import { describe, expect, it } from 'bun:test';
import { createServer, HttpError } from '../lib/index';
import type { Context } from '../lib/index';
import {
  All,
  Controller,
  Get,
  Use,
  registerControllers,
} from '../lib/decorators';
import { Authorize, getPrincipal, RateLimit } from '../lib/decorators/access';
import { Cache } from '../lib/decorators/cache';
import type { CachedResponse } from '../lib/decorators/cache';
import { Header, Status, Timeout } from '../lib/decorators/responses';
import { createCache } from '../../backone-utils/lib/cache';
import { createRateLimiter } from '../../backone-utils/lib/rate-limit';

const request = (path = '/cached', init?: RequestInit) =>
  new Request(`http://localhost${path}`, init);

function mount(controller: object) {
  const app = createServer();
  registerControllers(app, [controller]);
  return app;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function promptly<T>(pending: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 250);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe('Cache decorator', () => {
  it('snapshots successful responses and reconstructs independent bodies and headers', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    class Cached {
      calls = 0;
      @Get()
      @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
      get(ctx: Context) {
        ctx.status = 203;
        ctx.set('x-result', 'original');
        return { count: ++this.calls };
      }
    }
    const controller = new Cached();
    const app = mount(controller);
    const first = await app.handle(request());
    expect(first.status).toBe(203);
    first.headers.set('x-result', 'changed');
    expect(await first.json()).toEqual({ count: 1 });
    for (let i = 0; i < 2; i++) {
      const hit = await app.handle(request());
      expect(hit.status).toBe(203);
      expect(hit.headers.get('x-result')).toBe('original');
      expect(await hit.json()).toEqual({ count: 1 });
      hit.headers.set('x-result', 'changed again');
    }
    expect(controller.calls).toBe(1);
    expect(store.size).toBe(1);
  });

  it('isolates routes and apps that share a store and custom cache key', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
    class Cached {
      calls = 0;
      constructor(private readonly appName: string) {}
      @Get('/one')
      one() {
        return `${this.appName}:one:${++this.calls}`;
      }
      @Get('/two')
      two() {
        return `${this.appName}:two:${++this.calls}`;
      }
    }
    const one = mount(new Cached('first'));
    const two = mount(new Cached('second'));
    for (let i = 0; i < 2; i++) {
      expect(await (await one.handle(request('/cached/one'))).text()).toBe(
        'first:one:1'
      );
      expect(await (await one.handle(request('/cached/two'))).text()).toBe(
        'first:two:2'
      );
      expect(await (await two.handle(request('/cached/one'))).text()).toBe(
        'second:one:1'
      );
      expect(await (await two.handle(request('/cached/two'))).text()).toBe(
        'second:two:2'
      );
    }
    expect(store.size).toBe(4);
  });

  it('isolates authenticated scopes and awaits asynchronous reads and resolvers', async () => {
    const memory = createCache<CachedResponse>();
    const store = {
      get: async (key: string) => memory.get(key),
      set: async (key: string, value: CachedResponse, ttlMs: number) => {
        memory.set(key, value, ttlMs);
      },
    };
    @Controller('/cached')
    class Cached {
      calls = 0;
      @Get()
      @Cache({
        store,
        key: async () => 'same',
        scope: async (ctx) => getPrincipal<{ id: string }>(ctx).id,
        ttlMs: 60_000,
      })
      @Authorize({
        authenticate: (ctx) => ({ id: ctx.getHeader('user') ?? 'guest' }),
      })
      get(ctx: Context) {
        return {
          user: getPrincipal<{ id: string }>(ctx).id,
          count: ++this.calls,
        };
      }
    }
    const app = mount(new Cached());
    for (const [user, count] of [
      ['alice', 1],
      ['bob', 2],
      ['alice', 1],
      ['bob', 2],
    ] as const) {
      const response = await app.handle(
        request('/cached', { headers: { user } })
      );
      expect(await response.json()).toEqual({ user, count });
    }
  });

  for (const timeout of ['route', 'global']) {
    it(`returns successfully when a cache write never settles with a ${timeout} timeout`, async () => {
      const store = {
        get: () => undefined,
        set: () => new Promise<never>(() => {}),
      };
      const timeoutDecorator = timeout === 'route' ? Timeout(50) : Use();
      @Controller('/cached')
      @timeoutDecorator
      class Cached {
        @Get()
        @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
        get() {
          return 'successful business response';
        }
      }
      const app = mount(new Cached());
      if (timeout === 'global') app.useTimeout(50);
      const response = await promptly(app.handle(request()));
      expect(response).not.toBeNull();
      if (response === null)
        throw new Error('Cache write blocked the response');
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('successful business response');
    });
  }

  for (const failure of ['synchronous', 'asynchronous']) {
    it(`contains ${failure} cache write failures and preserves business responses`, async () => {
      const fail = () => {
        throw new Error('Cache backend unavailable');
      };
      const store = {
        get: () => undefined,
        set:
          failure === 'synchronous'
            ? fail
            : async () => {
                await delay(1);
                fail();
              },
      };
      @Controller('/cached')
      class Cached {
        calls = 0;
        @Get()
        @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
        get() {
          return String(++this.calls);
        }
      }
      const app = mount(new Cached());
      for (const expected of ['1', '2']) {
        const response = await app.handle(request());
        expect(response.status).toBe(200);
        expect(await response.text()).toBe(expected);
        await delay(5);
      }
    });
  }

  it('returns before a delayed write completes and observes the entry only after the backend gate opens', async () => {
    const memory = createCache<CachedResponse>();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let committed: Promise<unknown> = Promise.resolve();
    const store = {
      get: (key: string) => memory.get(key),
      set: (key: string, value: CachedResponse, ttlMs: number) => {
        committed = gate.then(() => memory.set(key, value, ttlMs));
        return committed;
      },
    };
    @Controller('/cached')
    class Cached {
      calls = 0;
      @Get()
      @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
      get() {
        return String(++this.calls);
      }
    }
    const controller = new Cached();
    const app = mount(controller);
    try {
      const response = await promptly(app.handle(request()));
      expect(response).not.toBeNull();
      if (response === null)
        throw new Error('Delayed cache write blocked response');
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('1');
      expect(memory.size).toBe(0);
    } finally {
      release();
      await committed;
    }
    expect(memory.size).toBe(1);
    expect(await (await app.handle(request())).text()).toBe('1');
    expect(controller.calls).toBe(1);
  });

  it('uses the explicit custom key to isolate query variants', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    class Cached {
      calls = 0;
      @Get()
      @Cache({
        store,
        key: (ctx) => ctx.query.get('page') ?? '1',
        scope: 'public',
        ttlMs: 60_000,
      })
      get(ctx: Context) {
        return { page: ctx.query.get('page'), count: ++this.calls };
      }
    }
    const app = mount(new Cached());
    for (const [page, count] of [
      ['1', 1],
      ['2', 2],
      ['1', 1],
    ] as const) {
      const response = await app.handle(request(`/cached?page=${page}`));
      expect(await response.json()).toEqual({ page, count });
    }
  });

  it('runs authentication, authorization and rate limits on every public cache hit', async () => {
    const store = createCache<CachedResponse>();
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    @Controller('/cached')
    class Cached {
      calls = 0;
      @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
      @RateLimit(limiter, {
        key: (ctx) => getPrincipal<{ id: string }>(ctx).id,
      })
      @Get()
      @Authorize({
        authenticate: (ctx) =>
          ctx.getHeader('user') ? { id: ctx.getHeader('user') ?? '' } : null,
        authorize: (principal) => principal.id !== 'blocked',
      })
      get() {
        return { count: ++this.calls };
      }
    }
    const app = mount(new Cached());
    const allowed = () => request('/cached', { headers: { user: 'alice' } });
    expect(await (await app.handle(allowed())).json()).toEqual({ count: 1 });
    expect(await (await app.handle(allowed())).json()).toEqual({ count: 1 });
    expect((await app.handle(allowed())).status).toBe(429);
    expect((await app.handle(request())).status).toBe(401);
    expect(
      (await app.handle(request('/cached', { headers: { user: 'blocked' } })))
        .status
    ).toBe(403);
  });

  it('lets method cache configuration replace the class default', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
    class Cached {
      calls = 0;
      @Get('/default')
      default() {
        return ++this.calls;
      }
      @Get('/override')
      @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 10 })
      override() {
        return ++this.calls;
      }
    }
    const app = mount(new Cached());
    expect(await (await app.handle(request('/cached/default'))).text()).toBe(
      '1'
    );
    expect(await (await app.handle(request('/cached/override'))).text()).toBe(
      '2'
    );
    await delay(30);
    expect(await (await app.handle(request('/cached/default'))).text()).toBe(
      '1'
    );
    expect(await (await app.handle(request('/cached/override'))).text()).toBe(
      '3'
    );
  });

  it('expires through the injected store and supports backend invalidation', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    class Cached {
      calls = 0;
      @Get()
      @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 10 })
      get() {
        return ++this.calls;
      }
    }
    const app = mount(new Cached());
    expect(await (await app.handle(request())).text()).toBe('1');
    expect(await (await app.handle(request())).text()).toBe('1');
    await delay(30);
    expect(await (await app.handle(request())).text()).toBe('2');
    store.clear();
    expect(await (await app.handle(request())).text()).toBe('3');
  });

  it('does not read or write the cache for non-GET requests', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    class Cached {
      calls = 0;
      @All()
      @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
      get() {
        return ++this.calls;
      }
    }
    const app = mount(new Cached());
    expect(await (await app.handle(request())).text()).toBe('1');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await app.handle(request('/cached', { method }));
      expect(await response.text()).not.toBe('1');
    }
    expect(await (await app.handle(request())).text()).toBe('1');
    expect(store.size).toBe(1);
  });

  it('skips errors, cookies, SSE, no-store and public/private mismatches', async () => {
    for (const [status, headers] of [
      [400, {}],
      [500, {}],
      [302, { location: '/elsewhere' }],
      [200, { 'set-cookie': 'session=secret' }],
      [200, { 'content-type': 'text/event-stream; charset=utf-8' }],
      [200, { 'cache-control': 'public, max-age=100, no-store' }],
      [200, { 'cache-control': 'private, max-age=100' }],
    ] as const) {
      const store = createCache<CachedResponse>();
      @Controller('/cached')
      class Cached {
        calls = 0;
        @Get()
        @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
        get() {
          return new Response(String(++this.calls), { status, headers });
        }
      }
      const app = mount(new Cached());
      expect(await (await app.handle(request())).text()).toBe('1');
      expect(await (await app.handle(request())).text()).toBe('2');
      expect(store.size).toBe(0);
    }
  });

  it('does not cache thrown errors or ctx cookie responses', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
    class Cached {
      @Get('/error')
      error() {
        throw new HttpError(404, 'Missing');
      }
      @Get('/cookie')
      cookie(ctx: Context) {
        ctx.setCookie('session', 'secret');
        return 'cookie';
      }
    }
    const app = mount(new Cached());
    expect((await app.handle(request('/cached/error'))).status).toBe(404);
    expect(
      (await app.handle(request('/cached/cookie'))).headers.get('set-cookie')
    ).toContain('session=secret');
    expect(store.size).toBe(0);
  });

  it('waits for outer middleware privacy headers before committing snapshots', async () => {
    for (const [name, value] of [
      ['cache-control', 'no-store'],
      ['cache-control', 'private'],
      ['set-cookie', 'session=outer'],
      ['content-type', 'text/event-stream'],
    ]) {
      const store = createCache<CachedResponse>();
      @Controller('/cached')
      @Use(async (_ctx, next) => {
        const response = await next();
        if (!(response instanceof Response))
          throw new Error('Expected Response');
        response.headers.set(name, value);
        return response;
      })
      class Cached {
        calls = 0;
        @Get()
        @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
        get() {
          return String(++this.calls);
        }
      }
      const app = mount(new Cached());
      const first = await app.handle(request());
      expect(first.headers.get(name)).toBe(value);
      expect(await first.text()).toBe('1');
      expect(store.size).toBe(0);
      expect(await (await app.handle(request())).text()).toBe('2');
    }
  });

  it('rechecks late ctx privacy headers even when the final Response omits them', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    @Use(async (ctx, next) => {
      const response = await next();
      ctx.setCookie('session', 'late');
      return response;
    })
    class Cached {
      @Get()
      @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
      get() {
        return 'result';
      }
    }
    const app = mount(new Cached());
    expect(await (await app.handle(request())).text()).toBe('result');
    expect(store.size).toBe(0);
  });

  it('does not commit snapshots when outer middleware replaces the result with an error', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    @Use(async (_ctx, next) => {
      await next();
      return new Response('failed', { status: 503 });
    })
    class Cached {
      @Get()
      @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
      get() {
        return 'result';
      }
    }
    const app = mount(new Cached());
    expect((await app.handle(request())).status).toBe(503);
    expect(store.size).toBe(0);
  });

  it('does not commit snapshots when outer middleware throws after next', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    @Use(async (_ctx, next) => {
      await next();
      throw new HttpError(409, 'Outer middleware rejected the result');
    })
    class Cached {
      @Get()
      @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
      get() {
        return 'result';
      }
    }
    const app = mount(new Cached());
    expect((await app.handle(request())).status).toBe(409);
    expect(store.size).toBe(0);
  });

  it('does not commit captured snapshots after an outer timeout', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    @Use(async (_ctx, next) => {
      const result = await next();
      await delay(40);
      return result;
    })
    class Cached {
      @Get()
      @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
      get() {
        return 'result';
      }
    }
    const app = mount(new Cached()).useTimeout(10);
    expect((await app.handle(request())).status).toBe(504);
    await delay(60);
    expect(store.size).toBe(0);
  });

  it('captures before global gzip so each client keeps its own encoding negotiation', async () => {
    const store = createCache<CachedResponse>();
    const payload = 'x'.repeat(100);
    @Controller('/cached')
    class Cached {
      calls = 0;
      @Get()
      @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
      get() {
        return { count: ++this.calls, payload };
      }
    }
    const controller = new Cached();
    const app = mount(controller).useGzip({ threshold: 1 });
    for (const encoding of ['gzip', '', 'gzip']) {
      const response = await app.handle(
        request('/cached', {
          headers: { 'accept-encoding': encoding },
        })
      );
      if (encoding === 'gzip') {
        expect(response.headers.get('content-encoding')).toBe('gzip');
        const compressed = new Uint8Array(await response.arrayBuffer());
        expect(
          JSON.parse(new TextDecoder().decode(Bun.gunzipSync(compressed)))
        ).toEqual({ count: 1, payload });
      } else {
        expect(response.headers.get('content-encoding')).toBeNull();
        expect(await response.json()).toEqual({ count: 1, payload });
      }
    }
    expect(controller.calls).toBe(1);
    expect(store.size).toBe(1);
  });

  it('honors security headers supplied by response decorators before caching', async () => {
    for (const [name, value] of [
      ['cache-control', 'private'],
      ['cache-control', 'no-store'],
      ['set-cookie', 'session=secret'],
    ]) {
      const store = createCache<CachedResponse>();
      @Controller('/cached')
      class Cached {
        calls = 0;
        @Get()
        @Header(name, value)
        @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
        get() {
          return String(++this.calls);
        }
      }
      const app = mount(new Cached());
      const first = await app.handle(request());
      expect(first.headers.get(name)).toBe(value);
      expect(await first.text()).toBe('1');
      expect(await (await app.handle(request())).text()).toBe('2');
      expect(store.size).toBe(0);
    }
  });

  it('supports bodyless status defaults before serializing snapshots', async () => {
    for (const status of [204, 205, 304]) {
      const store = createCache<CachedResponse>();
      @Controller('/cached')
      class Cached {
        @Get()
        @Status(status)
        @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
        get() {
          return 'discarded';
        }
      }
      const app = mount(new Cached());
      const response = await app.handle(request());
      expect(response.status).toBe(status);
      expect(await response.text()).toBe('');
    }
  });

  it('preserves an explicit Status(200) default for a cached null result', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    class Cached {
      calls = 0;
      @Get()
      @Status(200)
      @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
      get() {
        this.calls++;
        return null;
      }
    }
    const controller = new Cached();
    const app = mount(controller);
    for (let i = 0; i < 2; i++) {
      const response = await app.handle(request());
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('');
    }
    expect(controller.calls).toBe(1);
  });

  it('honors request no-store even when a prior cache entry exists', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    class Cached {
      calls = 0;
      @Get()
      @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
      get() {
        return ++this.calls;
      }
    }
    const app = mount(new Cached());
    expect(await (await app.handle(request())).text()).toBe('1');
    expect(
      await (
        await app.handle(
          request('/cached', { headers: { 'cache-control': 'no-store' } })
        )
      ).text()
    ).toBe('2');
    expect(await (await app.handle(request())).text()).toBe('1');
  });

  it('honors current middleware privacy headers before reading an existing entry', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    @Use((ctx, next) => {
      const privacy = ctx.getHeader('privacy');
      if (privacy !== null) ctx.set('cache-control', privacy);
      const cookie = ctx.getHeader('cookie-response');
      if (cookie !== null) ctx.set('set-cookie', cookie);
      return next();
    })
    class Cached {
      calls = 0;
      @Get()
      @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
      get() {
        return String(++this.calls);
      }
    }
    const app = mount(new Cached());
    expect(await (await app.handle(request())).text()).toBe('1');
    for (const [privacy, body] of [
      ['no-store', '2'],
      ['private', '3'],
    ]) {
      const response = await app.handle(
        request('/cached', { headers: { privacy } })
      );
      expect(await response.text()).toBe(body);
      expect(response.headers.get('cache-control')).toBe(privacy);
    }
    const cookie = await app.handle(
      request('/cached', {
        headers: { 'cookie-response': 'session=current' },
      })
    );
    expect(await cookie.text()).toBe('4');
    expect(cookie.headers.get('set-cookie')).toBe('session=current');
    expect(await (await app.handle(request())).text()).toBe('1');
  });

  it('uses fresh middleware headers on hits while retaining cached business headers', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    @Use((ctx, next) => {
      ctx.set('x-request-id', ctx.getHeader('request-id') ?? 'none');
      return next();
    })
    class Cached {
      calls = 0;
      @Get()
      @Header('x-business', 'default')
      @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
      get(ctx: Context) {
        ctx.set('x-business', 'explicit');
        return String(++this.calls);
      }
    }
    const app = mount(new Cached());
    for (const id of ['first', 'second']) {
      const response = await app.handle(
        request('/cached', { headers: { 'request-id': id } })
      );
      expect(await response.text()).toBe('1');
      expect(response.headers.get('x-request-id')).toBe(id);
      expect(response.headers.get('x-business')).toBe('explicit');
    }
  });

  it('rejects non-string resolved scopes instead of sharing an absent user key', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    class Cached {
      calls = 0;
      @Get()
      @Cache({
        store,
        key: () => 'same',
        scope: () => undefined as never,
        ttlMs: 60_000,
      })
      get() {
        return ++this.calls;
      }
    }
    const controller = new Cached();
    const app = mount(controller);
    expect((await app.handle(request())).status).toBe(500);
    expect(controller.calls).toBe(0);
    expect(store.size).toBe(0);
  });

  it('allows a private response only within an explicit isolated scope', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    class Cached {
      calls = 0;
      @Get()
      @Cache({ store, key: () => 'same', scope: () => 'tenant', ttlMs: 60_000 })
      get() {
        return new Response(String(++this.calls), {
          headers: { 'cache-control': 'private' },
        });
      }
    }
    const app = mount(new Cached());
    expect(await (await app.handle(request())).text()).toBe('1');
    expect(await (await app.handle(request())).text()).toBe('1');
  });

  it('bounds snapshots by byte length while leaving the original response readable', async () => {
    for (const maxBodyBytes of [5, 6]) {
      const store = createCache<CachedResponse>();
      @Controller('/cached')
      class Cached {
        calls = 0;
        @Get()
        @Cache({
          store,
          key: () => 'same',
          scope: 'public',
          ttlMs: 60_000,
          maxBodyBytes,
        })
        get() {
          this.calls++;
          return new Response('你好');
        }
      }
      const controller = new Cached();
      const app = mount(controller);
      expect(await (await app.handle(request())).text()).toBe('你好');
      expect(await (await app.handle(request())).text()).toBe('你好');
      expect(controller.calls).toBe(maxBodyBytes === 6 ? 1 : 2);
      expect(store.size).toBe(maxBodyBytes === 6 ? 1 : 0);
    }
  });

  it('skips declared oversized bodies before reading their streams', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    class Cached {
      @Get()
      @Cache({
        store,
        key: () => 'same',
        scope: 'public',
        ttlMs: 60_000,
        maxBodyBytes: 4,
      })
      get() {
        return new Response('hello', { headers: { 'content-length': '5' } });
      }
    }
    const app = mount(new Cached());
    expect(await (await app.handle(request())).text()).toBe('hello');
    expect(store.size).toBe(0);
  });

  it('uses the default one MiB body limit when no override is supplied', async () => {
    const store = createCache<CachedResponse>();
    const body = 'x'.repeat(1_048_577);
    @Controller('/cached')
    class Cached {
      @Get()
      @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
      get() {
        return body;
      }
    }
    const app = mount(new Cached());
    expect(await (await app.handle(request())).text()).toBe(body);
    expect(store.size).toBe(0);
  });

  it('returns slow streams after the snapshot deadline without cancelling the original', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    class Cached {
      @Get()
      @Cache({
        store,
        key: () => 'same',
        scope: 'public',
        ttlMs: 60_000,
        snapshotTimeoutMs: 10,
      })
      get() {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('first'));
              setTimeout(() => {
                controller.enqueue(new TextEncoder().encode('last'));
                controller.close();
              }, 200);
            },
          })
        );
      }
    }
    const app = mount(new Cached());
    const start = Date.now();
    const response = await app.handle(request());
    expect(Date.now() - start).toBeLessThan(150);
    expect(await response.text()).toBe('firstlast');
    expect(store.size).toBe(0);
  });

  it('bounds never-ending stream snapshots and lets consumers cancel normally', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    class Cached {
      @Get()
      @Cache({
        store,
        key: () => 'same',
        scope: 'public',
        ttlMs: 60_000,
        snapshotTimeoutMs: 10,
      })
      get() {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('first'));
            },
          })
        );
      }
    }
    const app = mount(new Cached());
    const start = Date.now();
    const response = await app.handle(request());
    expect(Date.now() - start).toBeLessThan(150);
    if (response.body === null) throw new Error('Expected streamed response');
    const reader = response.body.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('first');
    await reader.cancel();
    expect(store.size).toBe(0);
  });

  it('skips failed response body reads without turning the request into a 500', async () => {
    const store = createCache<CachedResponse>();
    @Controller('/cached')
    class Cached {
      @Get()
      @Cache({ store, key: () => 'same', scope: 'public', ttlMs: 60_000 })
      get() {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.error(new Error('Broken body'));
            },
          })
        );
      }
    }
    const app = mount(new Cached());
    const response = await app.handle(request());
    expect(response.status).toBe(200);
    await expect(response.text()).rejects.toThrow('Broken body');
    expect(store.size).toBe(0);
  });

  it('requires explicit scope and positive finite lifetime and snapshot bounds', () => {
    const store = createCache<CachedResponse>();
    const options = {
      store,
      key: () => 'same',
      scope: 'public' as const,
      ttlMs: 1_000,
    };
    expect(() => Cache({ ...options, scope: undefined } as never)).toThrow(
      'scope'
    );
    expect(() => Cache({ ...options, key: undefined } as never)).toThrow('key');
    for (const value of [0, -1, NaN, Infinity]) {
      expect(() => Cache({ ...options, ttlMs: value })).toThrow('ttlMs');
      expect(() => Cache({ ...options, maxBodyBytes: value })).toThrow(
        'maxBodyBytes'
      );
      expect(() => Cache({ ...options, snapshotTimeoutMs: value })).toThrow(
        'snapshotTimeoutMs'
      );
    }
  });
});
