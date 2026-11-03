import { describe, expect, it } from 'bun:test';
import { createServer } from '../lib/index';
import type { Context } from '../lib/index';
import { Controller, Get, Use, registerControllers } from '../lib/decorators';
import { policyDecorator } from '../lib/decorators/metadata';
import {
  Header,
  Status,
  Timeout,
  isDefaultHeader,
} from '../lib/decorators/responses';

const request = (path: string) => new Request(`http://localhost${path}`);

describe('system response decorators', () => {
  it('applies status before the business method and preserves explicit status', async () => {
    @Controller('/status')
    @Status(201)
    class Statuses {
      @Get('/default')
      get(ctx: Context) {
        return { status: ctx.status };
      }
      @Get('/method')
      @Status(202)
      method() {
        return 'accepted';
      }
      @Get('/explicit')
      explicit(ctx: Context) {
        ctx.status = 203;
        return 'explicit';
      }
      @Get('/response')
      response() {
        return new Response('conflict', { status: 409 });
      }
    }
    const app = createServer();
    registerControllers(app, [new Statuses()]);
    const response = await app.handle(request('/status/default'));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: 201 });
    expect((await app.handle(request('/status/method'))).status).toBe(202);
    expect((await app.handle(request('/status/explicit'))).status).toBe(203);
    expect((await app.handle(request('/status/response'))).status).toBe(409);
  });

  it('keeps status explicitly assigned by outer middleware', async () => {
    @Controller('/middleware-status')
    @Status(201)
    @Use((ctx, next) => {
      ctx.status = 202;
      return next();
    })
    class MiddlewareStatus {
      @Get()
      get() {
        return 'accepted';
      }
    }
    const app = createServer();
    registerControllers(app, [new MiddlewareStatus()]);
    expect((await app.handle(request('/middleware-status'))).status).toBe(202);
  });

  it('preserves an explicit outer 200 for ordinary and empty results', async () => {
    @Controller('/explicit-default-status')
    @Status(201)
    @Use((ctx, next) => {
      ctx.status = 200;
      return next();
    })
    class ExplicitDefaultStatus {
      @Get('/plain')
      plain() {
        return 'ok';
      }
      @Get('/empty')
      empty() {}
    }
    const app = createServer();
    registerControllers(app, [new ExplicitDefaultStatus()]);
    for (const path of ['plain', 'empty']) {
      const response = await app.handle(
        request(`/explicit-default-status/${path}`)
      );
      expect(response.status).toBe(200);
    }
  });

  it('preserves a later explicit assignment equal to an earlier status default', async () => {
    const explicit = policyDecorator({
      phase: 'response',
      handler(ctx, next) {
        ctx.status = 201;
        return next();
      },
    });
    @Controller('/same-status')
    @Status(201)
    class SameStatus {
      @Get()
      @explicit
      @Status(202)
      get() {
        return 'created';
      }
    }
    const app = createServer();
    registerControllers(app, [new SameStatus()]);
    expect((await app.handle(request('/same-status'))).status).toBe(201);
  });

  it('returns empty bodies for 204, 205 and 304 defaults on ordinary values', async () => {
    for (const status of [204, 205, 304]) {
      @Controller('/bodyless')
      class Bodyless {
        @Get()
        @Status(status)
        get() {
          return { omitted: true };
        }
      }
      const app = createServer();
      registerControllers(app, [new Bodyless()]);
      const response = await app.handle(request('/bodyless'));
      expect(response.status).toBe(status);
      expect(await response.text()).toBe('');
    }
  });

  it('uses the final business status when deciding whether to omit the body', async () => {
    @Controller('/bodyless-override')
    class BodylessOverride {
      @Get()
      @Status(204)
      get(ctx: Context) {
        ctx.status = 200;
        return 'retained';
      }
    }
    const app = createServer();
    registerControllers(app, [new BodylessOverride()]);
    const response = await app.handle(request('/bodyless-override'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('retained');
  });

  it('retains an explicit 200 status even when the method returns no value', async () => {
    @Controller('/empty-status')
    class EmptyStatus {
      @Get('/default')
      @Status(200)
      get() {}
      @Get('/explicit')
      @Status(201)
      explicit(ctx: Context) {
        ctx.status = 200;
      }
    }
    const app = createServer();
    registerControllers(app, [new EmptyStatus()]);
    for (const path of ['default', 'explicit']) {
      const response = await app.handle(request(`/empty-status/${path}`));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('');
    }
  });

  it('applies inherited headers with method defaults taking precedence', async () => {
    @Header('X-Level', 'base')
    @Header('X-Base', 'base')
    class Base {}
    @Controller('/headers')
    @Header('X-Level', 'class')
    class Headers extends Base {
      @Get()
      @Header('x-level', 'method')
      get(ctx: Context) {
        return ctx.headers.get('x-level');
      }
    }
    const app = createServer();
    registerControllers(app, [new Headers()]);
    const response = await app.handle(request('/headers'));
    expect(response.headers.get('x-level')).toBe('method');
    expect(response.headers.get('x-base')).toBe('base');
    expect(await response.text()).toBe('method');
  });

  it('preserves preexisting headers while tracking only applied defaults', async () => {
    @Controller('/tracked-headers')
    @Header('X-Value', 'class')
    @Header('X-Default', 'class')
    @Use((ctx, next) => {
      ctx.set('X-Value', 'middleware');
      return next();
    })
    class TrackedHeaders {
      @Get()
      @Header('X-Value', 'method')
      @Header('X-Default', '  method  ')
      get(ctx: Context) {
        const before = isDefaultHeader(ctx, 'X-DeFaUlT');
        ctx.set('X-Default', 'business');
        return {
          value: ctx.headers.get('x-value'),
          defaultBefore: before,
          defaultAfter: isDefaultHeader(ctx, 'x-default'),
          explicitDefault: isDefaultHeader(ctx, 'x-value'),
        };
      }
    }
    const app = createServer();
    registerControllers(app, [new TrackedHeaders()]);
    const response = await app.handle(request('/tracked-headers'));
    expect(response.headers.get('x-default')).toBe('business');
    expect(await response.json()).toEqual({
      value: 'middleware',
      defaultBefore: true,
      defaultAfter: false,
      explicitDefault: false,
    });
  });

  it('allows business context and Response headers to override defaults', async () => {
    @Controller('/explicit-headers')
    @Header('X-Value', 'default')
    class Headers {
      @Get('/plain')
      plain(ctx: Context) {
        ctx.set('X-Value', 'context');
        return 'plain';
      }
      @Get('/response')
      response(ctx: Context) {
        ctx.set('X-Value', 'context');
        return new Response('response', {
          headers: { 'X-Value': 'response' },
        });
      }
      @Get('/raw')
      raw(ctx: Context) {
        ctx.set('X-Value', 'context');
        return new Response('raw');
      }
    }
    const app = createServer();
    registerControllers(app, [new Headers()]);
    expect(
      (await app.handle(request('/explicit-headers/plain'))).headers.get(
        'x-value'
      )
    ).toBe('context');
    expect(
      (await app.handle(request('/explicit-headers/response'))).headers.get(
        'x-value'
      )
    ).toBe('response');
    expect(
      (await app.handle(request('/explicit-headers/raw'))).headers.get(
        'x-value'
      )
    ).toBe('context');
  });

  it('adds defaults to immutable Responses without changing reused originals', async () => {
    const immutable = Response.redirect('http://localhost/destination', 302);
    @Controller('/immutable')
    class Immutable {
      @Get('/one')
      @Header('X-Default', 'one')
      one() {
        return immutable;
      }
      @Get('/two')
      @Header('X-Default', 'two')
      two() {
        return immutable;
      }
    }
    const app = createServer();
    registerControllers(app, [new Immutable()]);
    const one = await app.handle(request('/immutable/one'));
    const two = await app.handle(request('/immutable/two'));
    expect(one.status).toBe(302);
    expect(one.headers.get('location')).toBe('http://localhost/destination');
    expect(one.headers.get('x-default')).toBe('one');
    expect(two.headers.get('x-default')).toBe('two');
    expect(immutable.headers.has('x-default')).toBe(false);
  });

  it('preserves response bodies and original headers when adding defaults', async () => {
    const original = new Response('original body', {
      status: 202,
      headers: { 'X-Original': 'yes' },
    });
    @Controller('/raw-response')
    class RawResponse {
      @Get()
      @Header('X-Default', 'yes')
      @Status(201)
      get() {
        return original;
      }
    }
    const app = createServer();
    registerControllers(app, [new RawResponse()]);
    const response = await app.handle(request('/raw-response'));
    expect(response.status).toBe(202);
    expect(response.headers.get('x-original')).toBe('yes');
    expect(response.headers.get('x-default')).toBe('yes');
    expect(await response.text()).toBe('original body');
    expect(original.headers.has('x-default')).toBe(false);
    expect(original.bodyUsed).toBe(true);
  });

  it('passes stream cancellation through without leaving an unread tee branch', async () => {
    let sourceCancelled = false;
    const original = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode('chunk'));
        },
        cancel() {
          sourceCancelled = true;
        },
      })
    );
    @Controller('/header-stream')
    class HeaderStream {
      @Get()
      @Header('X-Stream', 'yes')
      get() {
        return original;
      }
    }
    const app = createServer();
    registerControllers(app, [new HeaderStream()]);
    const response = await app.handle(request('/header-stream'));
    const body = response.body;
    if (body === null) throw new Error('Expected a streaming response');
    const reader = body.getReader();
    await reader.read();
    const cancelled = reader.cancel();
    await Promise.race([cancelled, Bun.sleep(25)]);
    try {
      expect(sourceCancelled).toBe(true);
      expect(original.headers.has('x-stream')).toBe(false);
    } finally {
      if (!sourceCancelled) await original.body?.cancel();
      await cancelled;
    }
  });

  it('preserves declared content types for plain strings and JSON values', async () => {
    @Controller('/declared-content-type')
    @Header('Content-Type', 'application/vnd.example+json')
    class DeclaredContentType {
      @Get('/object')
      object() {
        return { ok: true };
      }
      @Get('/string')
      @Header('Content-Type', 'text/markdown')
      string() {
        return '# heading';
      }
      @Get('/explicit-context')
      context(ctx: Context) {
        ctx.set('Content-Type', 'application/problem+json');
        return { title: 'problem' };
      }
      @Get('/explicit-response')
      response() {
        return new Response('response', {
          headers: { 'Content-Type': 'text/custom' },
        });
      }
    }
    const app = createServer();
    registerControllers(app, [new DeclaredContentType()]);
    const object = await app.handle(request('/declared-content-type/object'));
    expect(object.headers.get('content-type')).toBe(
      'application/vnd.example+json'
    );
    expect(await object.json()).toEqual({ ok: true });
    const string = await app.handle(request('/declared-content-type/string'));
    expect(string.headers.get('content-type')).toBe('text/markdown');
    expect(await string.text()).toBe('# heading');
    const explicit = await app.handle(
      request('/declared-content-type/explicit-context')
    );
    expect(explicit.headers.get('content-type')).toBe(
      'application/problem+json'
    );
    const response = await app.handle(
      request('/declared-content-type/explicit-response')
    );
    expect(response.headers.get('content-type')).toBe('text/custom');
  });

  it('retains headers on bodyless responses regardless of decorator order', async () => {
    @Controller('/ordered-headers')
    class OrderedHeaders {
      @Get('/one')
      @Status(204)
      @Header('X-Default', 'one')
      one() {
        return 'omitted';
      }
      @Get('/two')
      @Header('X-Default', 'two')
      @Status(204)
      two() {
        return 'omitted';
      }
    }
    const app = createServer();
    registerControllers(app, [new OrderedHeaders()]);
    for (const name of ['one', 'two']) {
      const response = await app.handle(request(`/ordered-headers/${name}`));
      expect(response.status).toBe(204);
      expect(response.headers.get('x-default')).toBe(name);
    }
  });

  it('reuses timeout responses and keeps work running after the deadline', async () => {
    let finished = false;
    @Controller('/timeout')
    @Timeout(5)
    class Timed {
      @Get()
      async get() {
        await Bun.sleep(25);
        finished = true;
        return 'late';
      }
    }
    const app = createServer();
    registerControllers(app, [new Timed()]);
    const response = await app.handle(request('/timeout'));
    expect(response.status).toBe(504);
    expect(finished).toBe(false);
    await Bun.sleep(35);
    expect(finished).toBe(true);
  });

  it('lets method timeouts replace class budgets and supports custom options', async () => {
    @Controller('/timeout-options')
    @Timeout(5)
    class Timed {
      @Get('/override')
      @Timeout(100)
      async override() {
        await Bun.sleep(15);
        return 'finished';
      }
      @Get('/custom')
      @Timeout({ ms: 5, status: 408, message: 'Try later' })
      async custom() {
        await Bun.sleep(15);
        return 'late';
      }
    }
    const app = createServer();
    registerControllers(app, [new Timed()]);
    const override = await app.handle(request('/timeout-options/override'));
    expect(override.status).toBe(200);
    expect(await override.text()).toBe('finished');
    const custom = await app.handle(request('/timeout-options/custom'));
    expect(custom.status).toBe(408);
    expect(await custom.json()).toEqual({ error: 'Try later', status: 408 });
  });

  it('rejects invalid timeout budgets at declaration time', () => {
    for (const ms of [0, -1, Infinity, -Infinity, NaN]) {
      expect(() => Timeout(ms)).toThrow(/positive|finite/i);
      expect(() => Timeout({ ms })).toThrow(/positive|finite/i);
    }
  });

  it('rejects statuses unsupported by Web Responses at declaration time', () => {
    for (const code of [100, 199, 600, 200.5, NaN, Infinity]) {
      expect(() => Status(code)).toThrow(/integer|status|200|599/i);
    }
  });

  it('rejects invalid header names and values at declaration time', () => {
    for (const name of ['', 'invalid header', 'x-value\r\nInjected']) {
      expect(() => Header(name, 'value')).toThrow();
    }
    for (const value of ['one\r\nInjected: yes', 'one\ntwo', 'one\0two']) {
      expect(() => Header('X-Value', value)).toThrow();
    }
  });
});
