import { describe, expect, it } from 'bun:test';
import { createServer, HttpError } from '../lib/index';
import type { Context, Middleware } from '../lib/index';
import {
  All,
  Controller,
  Delete,
  Get,
  Head,
  Options,
  Patch,
  Post,
  Put,
  Use,
  registerControllers,
} from '../lib/decorators';

const request = (path: string, method = 'GET') =>
  new Request(`http://localhost${path}`, { method });

describe('Controller decorators', () => {
  it('binds instances with private dependencies and composes app prefixes', async () => {
    @Controller('users/')
    class Users {
      constructor(private readonly label: string) {}
      #counter = { value: 0 };

      @Get('/:id')
      async detail(ctx: Context & { params: { id: string } }) {
        this.#counter.value++;
        return {
          id: ctx.params.id,
          label: this.label,
          count: this.#counter.value,
        };
      }
    }
    const app = createServer().usePrefix('/api');
    const routes = registerControllers(app, [new Users('one')]);
    expect(routes).toEqual([
      {
        method: 'GET',
        path: '/api/users/:id',
        controller: 'Users',
        handler: 'detail',
      },
    ]);
    expect(await (await app.handle(request('/api/users/7'))).json()).toEqual({
      id: '7',
      label: 'one',
      count: 1,
    });
    expect(await (await app.handle(request('/api/users/8'))).json()).toEqual({
      id: '8',
      label: 'one',
      count: 2,
    });
  });

  it('registers every HTTP decorator and supports multiple routes on a method', async () => {
    @Controller('/verbs')
    class Verbs {
      @Get('/get')
      @Post('/post')
      shared(ctx: Context) {
        return ctx.method;
      }
      @Put() put() {
        return 'put';
      }
      @Patch() patch() {
        return 'patch';
      }
      @Delete() remove() {
        return 'delete';
      }
      @Options() options() {
        return new Response(null, { status: 204 });
      }
      @Head() head() {
        return new Response(null, { headers: { 'x-head': 'yes' } });
      }
      @All('/any') any(ctx: Context) {
        return ctx.method;
      }
    }
    const app = createServer();
    registerControllers(app, [new Verbs()]);
    for (const [path, method, body] of [
      ['/verbs/get', 'GET', 'GET'],
      ['/verbs/post', 'POST', 'POST'],
      ['/verbs', 'PUT', 'put'],
      ['/verbs', 'PATCH', 'patch'],
      ['/verbs', 'DELETE', 'delete'],
      ['/verbs/any', 'POST', 'POST'],
    ]) {
      const response = await app.handle(request(path, method));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(body);
    }
    expect((await app.handle(request('/verbs', 'OPTIONS'))).status).toBe(204);
    expect(
      (await app.handle(request('/verbs', 'HEAD'))).headers.get('x-head')
    ).toBe('yes');
    expect((await app.handle(request('/verbs/get', 'POST'))).status).toBe(405);
  });

  it('runs global, class and method middleware in written onion order', async () => {
    const calls: string[] = [];
    const trace =
      (name: string): Middleware =>
      async (_ctx, next) => {
        calls.push(`${name}:in`);
        const value = await next();
        calls.push(`${name}:out`);
        return value;
      };
    @Use(trace('class-a'), trace('class-b'))
    @Controller('/order')
    @Use(trace('class-c'))
    class Ordered {
      @Use(trace('method-a'))
      @Get()
      @Use(trace('method-b'), trace('method-c'))
      handle() {
        calls.push('handler');
        return { ok: true };
      }
    }
    const app = createServer().use(trace('global'));
    registerControllers(app, [new Ordered()]);
    expect(await (await app.handle(request('/order'))).json()).toEqual({
      ok: true,
    });
    expect(calls).toEqual([
      'global:in',
      'class-a:in',
      'class-b:in',
      'class-c:in',
      'method-a:in',
      'method-b:in',
      'method-c:in',
      'handler',
      'method-c:out',
      'method-b:out',
      'method-a:out',
      'class-c:out',
      'class-b:out',
      'class-a:out',
      'global:out',
    ]);
  });

  it('supports middleware short circuit and existing error serialization', async () => {
    @Controller('/errors')
    class Errors {
      @Get('/blocked')
      @Use(() => new Response('blocked', { status: 401 }))
      blocked() {
        throw new Error('Must not execute');
      }
      @Get('/missing')
      async missing() {
        throw new HttpError(404, 'Missing user');
      }
    }
    const app = createServer();
    registerControllers(app, [new Errors()]);
    expect((await app.handle(request('/errors/blocked'))).status).toBe(401);
    const missing = await app.handle(request('/errors/missing'));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: 'Missing user',
      status: 404,
    });
  });

  it('isolates apps and rejects repeat registrations', async () => {
    @Controller('/value')
    class Value {
      constructor(private readonly value: string) {}
      @Get() get() {
        return this.value;
      }
    }
    const one = createServer();
    const two = createServer();
    registerControllers(one, [new Value('one')]);
    registerControllers(two, [new Value('two')]);
    expect(await (await one.handle(request('/value'))).text()).toBe('one');
    expect(await (await two.handle(request('/value'))).text()).toBe('two');
    expect(() => registerControllers(one, [new Value('three')])).toThrow(
      'Duplicate'
    );
  });

  it('retains declared routes when a constructor binds its methods', async () => {
    @Controller('/bound')
    class Bound {
      constructor(private readonly value: string) {
        this.get = this.get.bind(this);
      }
      @Get()
      get() {
        return this.value;
      }
    }
    const app = createServer();
    expect(registerControllers(app, [new Bound('bound value')])).toHaveLength(
      1
    );
    expect(await (await app.handle(request('/bound'))).text()).toBe(
      'bound value'
    );
  });

  it('keeps non-callable and accessor instance shadows hidden without invoking getters', async () => {
    @Controller('/hidden')
    class Hidden {
      @Get() get() {
        return 'prototype';
      }
    }
    for (const descriptor of [
      { value: 'not callable' },
      {
        get() {
          throw new Error('Getter must not execute');
        },
      },
    ]) {
      const instance = new Hidden();
      Object.defineProperty(instance, 'get', descriptor);
      const app = createServer();
      expect(registerControllers(app, [instance])).toHaveLength(0);
      expect((await app.handle(request('/hidden'))).status).toBe(404);
    }
  });

  it('validates a complete batch before registering equivalent parameter paths', async () => {
    @Controller('/users')
    class One {
      @Get('/:id') get() {
        return 'one';
      }
    }
    @Controller('users//')
    class Two {
      @Get('/:name/') get() {
        return 'two';
      }
    }
    const app = createServer();
    expect(() => registerControllers(app, [new One(), new Two()])).toThrow(
      'Duplicate'
    );
    expect((await app.handle(request('/users/7'))).status).toBe(404);
    registerControllers(app, [new One()]);
    expect(await (await app.handle(request('/users/7'))).text()).toBe('one');
  });

  it('inherits methods and class middleware without leaking sibling metadata', async () => {
    const calls: string[] = [];
    @Use(async (_ctx, next) => {
      calls.push('base');
      return next();
    })
    class Base {
      @Get('/shared') shared() {
        return 'base';
      }
      @Get('/hidden') hidden() {
        return 'hidden';
      }
    }
    @Controller('/one')
    @Use(async (_ctx, next) => {
      calls.push('one');
      return next();
    })
    class One extends Base {
      hidden() {
        return 'undecorated override';
      }
      @Get('/own') own() {
        return 'one';
      }
    }
    @Controller('/two')
    class Two extends Base {}
    const app = createServer();
    registerControllers(app, [new One(), new Two()]);
    expect(await (await app.handle(request('/one/shared'))).text()).toBe(
      'base'
    );
    expect(calls).toEqual(['base', 'one']);
    expect((await app.handle(request('/one/hidden'))).status).toBe(404);
    calls.length = 0;
    expect(await (await app.handle(request('/two/hidden'))).text()).toBe(
      'hidden'
    );
    expect(calls).toEqual(['base']);
    expect((await app.handle(request('/two/own'))).status).toBe(404);
  });

  it('requires an explicit controller and rejects static or private routes', () => {
    class Missing {
      @Get() get() {
        return 'missing';
      }
    }
    expect(() => registerControllers(createServer(), [new Missing()])).toThrow(
      '@Controller'
    );
    expect(() => {
      class Static {
        @Get() static get() {
          return 'static';
        }
      }
      return Static;
    }).toThrow('public instance');
    expect(() => {
      class Private {
        @Get() #get() {
          return 'private';
        }
        use() {
          return this.#get();
        }
      }
      return Private;
    }).toThrow('public instance');
  });

  it('rejects legacy class decorator invocation with a configuration hint', () => {
    expect(() => Controller()(class Legacy {}, undefined as never)).toThrow(
      'standard'
    );
  });

  it('rejects inconsistent names at a shared dynamic segment before changing routes', async () => {
    @Controller('/users')
    class One {
      @Get('/:id/view') get(ctx: Context) {
        return ctx.params.id;
      }
    }
    @Controller('/users')
    class Two {
      @Post('/:name/edit') post(ctx: Context) {
        return ctx.params.name;
      }
    }
    const app = createServer();
    expect(() => registerControllers(app, [new One(), new Two()])).toThrow(
      'Conflicting parameter'
    );
    expect((await app.handle(request('/users/7/view'))).status).toBe(404);
    registerControllers(app, [new One()]);
    expect(() => registerControllers(app, [new Two()])).toThrow(
      'Conflicting parameter'
    );
    expect(await (await app.handle(request('/users/7/view'))).text()).toBe('7');
    app.usePrefix('/v2');
    registerControllers(app, [new Two()]);
    expect(
      await (await app.handle(request('/v2/users/alice/edit', 'POST'))).text()
    ).toBe('alice');
  });

  it('rejects invalid path declarations without registering earlier valid controllers', async () => {
    @Controller('/valid')
    class Valid {
      @Get() get() {
        return 'valid';
      }
    }
    @Controller('/invalid')
    class Invalid {
      @Get('/bad?query=1') get() {
        return 'invalid';
      }
    }
    const app = createServer();
    expect(() =>
      registerControllers(app, [new Valid(), new Invalid()])
    ).toThrow('paths');
    expect((await app.handle(request('/valid'))).status).toBe(404);
  });
});
