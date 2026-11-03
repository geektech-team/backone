import { describe, expect, it } from 'bun:test';
import { createServer, HttpError } from '../lib/index';
import type { Context } from '../lib/index';
import { Controller, Get, Use, registerControllers } from '../lib/decorators';
import { Authorize, getPrincipal, RateLimit } from '../lib/decorators/access';
import { createRateLimiter } from '../../backone-utils/lib/rate-limit';

const request = (path: string, headers?: RequestInit['headers']) =>
  new Request(`http://localhost${path}`, { headers });

describe('Authorization decorators', () => {
  it('resolves an asynchronous principal before class and method policies', async () => {
    const calls: string[] = [];
    @Controller('/account')
    @Use(async (_ctx, next) => {
      calls.push('use');
      return next();
    })
    @Authorize({
      authenticate: async (ctx) => {
        calls.push('authenticate');
        return ctx.getHeader('authorization') ? { id: 'alice' } : null;
      },
      authorize: (principal) => {
        calls.push(`class:${principal.id}`);
        return true;
      },
    })
    class Account {
      @Get()
      @Authorize({
        authenticate: (ctx) => getPrincipal<{ id: string }>(ctx),
        authorize: (principal) => {
          calls.push(`method:${principal.id}`);
          return true;
        },
      })
      get(ctx: Context) {
        calls.push('handler');
        return getPrincipal<{ id: string }>(ctx);
      }
    }
    const app = createServer();
    registerControllers(app, [new Account()]);
    const response = await app.handle(
      request('/account', { authorization: 'ok' })
    );
    expect(await response.json()).toEqual({ id: 'alice' });
    expect(calls).toEqual([
      'use',
      'authenticate',
      'class:alice',
      'method:alice',
      'handler',
    ]);
  });

  it('rejects missing and failed authentication without running business code', async () => {
    for (const authenticate of [
      () => null,
      () => undefined,
      async () => {
        throw new Error('Expired token');
      },
    ]) {
      @Controller('/secure')
      class Secure {
        @Get()
        @Authorize({ authenticate })
        get() {
          throw new Error('Business code must not run');
        }
      }
      const app = createServer();
      registerControllers(app, [new Secure()]);
      const response = await app.handle(request('/secure'));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: 'Unauthorized',
        status: 401,
      });
    }
  });

  it('rejects false and failed policies with 403', async () => {
    for (const authorize of [
      () => false,
      async () => {
        throw new Error('Policy unavailable');
      },
    ]) {
      @Controller('/secure')
      class Secure {
        @Get()
        @Authorize({ authenticate: () => ({ id: 'alice' }), authorize })
        get() {
          return 'should not execute';
        }
      }
      const app = createServer();
      registerControllers(app, [new Secure()]);
      expect((await app.handle(request('/secure'))).status).toBe(403);
    }
  });

  it('preserves explicit HttpError from authentication and authorization', async () => {
    @Controller('/errors')
    class Errors {
      @Get('/authenticate')
      @Authorize({
        authenticate: () => {
          throw new HttpError(409, 'Account locked');
        },
      })
      authenticate() {
        return 'unused';
      }

      @Get('/authorize')
      @Authorize({
        authenticate: () => ({ id: 'alice' }),
        authorize: () => {
          throw new HttpError(404, 'Account hidden');
        },
      })
      authorize() {
        return 'unused';
      }
    }
    const app = createServer();
    registerControllers(app, [new Errors()]);
    for (const [path, status, error] of [
      ['/errors/authenticate', 409, 'Account locked'],
      ['/errors/authorize', 404, 'Account hidden'],
    ] as const) {
      const response = await app.handle(request(path));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ status, error });
    }
  });

  it('requires a principal when the typed helper is used without authorization', async () => {
    @Controller('/missing')
    class Missing {
      @Get()
      get(ctx: Context) {
        return getPrincipal<{ id: string }>(ctx);
      }
    }
    const app = createServer();
    registerControllers(app, [new Missing()]);
    expect((await app.handle(request('/missing'))).status).toBe(401);
  });
});

describe('RateLimit decorator', () => {
  it('accepts the utils limiter and isolates explicit principal keys', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    @Controller('/limited')
    class Limited {
      @RateLimit(limiter, {
        key: (ctx) => getPrincipal<{ id: string }>(ctx).id,
      })
      @Authorize({
        authenticate: (ctx) => ({
          id: ctx.getHeader('authorization') ?? 'guest',
        }),
      })
      @Get()
      get() {
        return 'ok';
      }
    }
    const app = createServer();
    registerControllers(app, [new Limited()]);
    expect(
      (await app.handle(request('/limited', { authorization: 'alice' }))).status
    ).toBe(200);
    const denied = await app.handle(
      request('/limited', { authorization: 'alice' })
    );
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await denied.json()).toEqual({
      status: 429,
      error: 'Too Many Requests',
    });
    expect(
      (await app.handle(request('/limited', { authorization: 'bob' }))).status
    ).toBe(200);
  });

  it('accumulates class and method limits and awaits asynchronous consumption', async () => {
    const classLimiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    const methodLimiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    @Controller('/limits')
    @RateLimit(classLimiter, { key: () => 'shared' })
    class Limits {
      @Get('/one')
      @RateLimit(
        { consume: async (key) => methodLimiter.consume(key) },
        { key: async () => 'one' }
      )
      one() {
        return 'one';
      }
      @Get('/two')
      two() {
        return 'two';
      }
    }
    const app = createServer();
    registerControllers(app, [new Limits()]);
    expect((await app.handle(request('/limits/one'))).status).toBe(200);
    expect((await app.handle(request('/limits/one'))).status).toBe(429);
    expect((await app.handle(request('/limits/two'))).status).toBe(429);
  });

  it('rounds Retry-After up to whole seconds and clamps expired windows', async () => {
    @Controller('/retry')
    class Retry {
      @Get('/future')
      @RateLimit(
        {
          consume: () => ({
            allowed: false,
            remaining: 0,
            resetAt: Date.now() + 1_100,
          }),
        },
        { key: () => 'future' }
      )
      future() {
        return 'unused';
      }
      @Get('/past')
      @RateLimit(
        {
          consume: () => ({
            allowed: false,
            remaining: 0,
            resetAt: Date.now() - 1_000,
          }),
        },
        { key: () => 'past' }
      )
      past() {
        return 'unused';
      }
    }
    const app = createServer();
    registerControllers(app, [new Retry()]);
    expect(
      (await app.handle(request('/retry/future'))).headers.get('retry-after')
    ).toBe('2');
    expect(
      (await app.handle(request('/retry/past'))).headers.get('retry-after')
    ).toBe('0');
  });

  it('rejects missing explicit key configuration', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(() => RateLimit(limiter, undefined as never)).toThrow('key');
    expect(() => RateLimit(limiter, {} as never)).toThrow('key');
  });
});
