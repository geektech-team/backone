import { describe, expect, it } from 'bun:test';
import { BackOneServer } from '../lib/server';
import type { BackOneWebSocket } from '../lib/websocket';
import {
  Cache,
  type CachedResponse,
  Controller,
  Get,
  Module,
  OnMessage,
  OnOpen,
  WebSocket as Gateway,
  registerControllers,
  registerModules,
  registerWebSockets,
  type ModuleOptions,
} from '../lib/decorators';

@Controller('/users')
class UsersController {
  constructor(private readonly name: string) {}
  @Get('/:id')
  detail() {
    return { name: this.name };
  }
}

@Module<UsersModule>({
  prefix: '/users-api',
  controllers: (module) => [module.controller],
})
class UsersModule {
  readonly controller: UsersController;
  constructor(name: string) {
    this.controller = new UsersController(name);
  }
}

@Controller('/valid')
class ValidController {
  @Get() get() {
    return 'valid';
  }
}

@Gateway('/chat')
class ChatGateway {
  @OnOpen() open(ws: BackOneWebSocket) {
    ws.send('ready');
  }
  @OnMessage() message(ws: BackOneWebSocket, message: string | Uint8Array) {
    ws.send(`echo:${String(message)}`);
  }
}

describe('business modules', () => {
  it('registers injected objects with nested prefixes and frozen descriptions', async () => {
    @Module<Root>({ prefix: '/v1', imports: (module) => [module.users] })
    class Root {
      constructor(readonly users: UsersModule) {}
    }
    const app = new BackOneServer();
    app.usePrefix('/api');
    const result = registerModules(app, [new Root(new UsersModule('Alice'))]);
    expect(app.prefix).toBe('/api');
    expect(result.modules).toEqual([
      { name: 'UsersModule', prefix: '/api/v1/users-api' },
      { name: 'Root', prefix: '/api/v1' },
    ]);
    expect(result.routes[0].path).toBe('/api/v1/users-api/users/:id');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.modules)).toBe(true);
    expect(Object.isFrozen(result.modules[0])).toBe(true);
    expect(Object.isFrozen(result.routes)).toBe(true);
    expect(Object.isFrozen(result.gateways)).toBe(true);
    expect(
      await (
        await app.handle(
          new Request('http://localhost/api/v1/users-api/users/1')
        )
      ).json()
    ).toEqual({ name: 'Alice' });
  });

  it('deduplicates shared imports and repeated registration, resolving each selector once', () => {
    let reads = 0;
    @Module<Shared>({
      controllers: (module) => {
        reads++;
        return [module.controller];
      },
    })
    class Shared {
      readonly controller = new ValidController();
    }
    @Module<Branch>({ imports: (module) => [module.shared] })
    class Branch {
      constructor(readonly shared: Shared) {}
    }
    const shared = new Shared();
    const roots = [new Branch(shared), new Branch(shared)];
    const app = new BackOneServer();
    expect(registerModules(app, roots).modules).toHaveLength(3);
    expect(reads).toBe(1);
    expect(registerModules(app, [...roots, shared])).toEqual({
      modules: [],
      routes: [],
      gateways: [],
    });
    expect(reads).toBe(1);
  });

  it('normalizes root prefix aliases and isolates registration state per application', async () => {
    @Module<Root>({ prefix: '/', controllers: (module) => [module.controller] })
    class Root {
      readonly controller = new ValidController();
    }
    const root = new Root();
    const first = new BackOneServer();
    const second = new BackOneServer();
    expect(registerModules(first, [root]).modules).toEqual([
      { name: 'Root', prefix: '' },
    ]);
    expect(registerModules(second, [root]).routes).toHaveLength(1);
    expect(
      (await second.handle(new Request('http://localhost/valid'))).status
    ).toBe(200);
  });

  it('rejects cycles without adding routes and can retry after graph repair', async () => {
    @Module<Node>({
      imports: (module) => module.imports,
      controllers: (module) => module.controllers,
    })
    class Node {
      imports: object[] = [];
      controllers: object[] = [];
    }
    const first = new Node();
    const second = new Node();
    first.controllers = [new ValidController()];
    first.imports = [second];
    second.imports = [first];
    const app = new BackOneServer();
    expect(() => registerModules(app, [first])).toThrow(/circular|cycle/i);
    expect(
      (await app.handle(new Request('http://localhost/valid'))).status
    ).toBe(404);
    second.imports = [];
    expect(registerModules(app, [first]).routes).toHaveLength(1);
  });

  it('rejects a shared instance mounted at different prefixes before committing', async () => {
    @Module<Parent>({ prefix: '/other', imports: (module) => [module.child] })
    class Parent {
      constructor(readonly child: UsersModule) {}
    }
    const app = new BackOneServer();
    const child = new UsersModule('Alice');
    expect(() => registerModules(app, [child, new Parent(child)])).toThrow(
      /prefix|mount/i
    );
    expect(
      (await app.handle(new Request('http://localhost/users-api/users/1')))
        .status
    ).toBe(404);
    registerModules(app, [child]);
    app.usePrefix('/different');
    expect(() => registerModules(app, [child])).toThrow(/prefix|mount/i);
  });

  it('does not deduplicate distinct module instances or shared controllers', async () => {
    @Module<Feature>({ controllers: (module) => [module.controller] })
    class Feature {
      constructor(readonly controller: ValidController) {}
    }
    const controller = new ValidController();
    const app = new BackOneServer();
    expect(() =>
      registerModules(app, [new Feature(controller), new Feature(controller)])
    ).toThrow('Duplicate Controller route');
    expect(
      (await app.handle(new Request('http://localhost/valid'))).status
    ).toBe(404);
  });

  it('validates all HTTP and WS declarations before adding either kind', async () => {
    @Module({
      controllers: () => [new ValidController()],
      gateways: () => [new ChatGateway(), new ChatGateway()],
    })
    class Invalid {}
    const app = new BackOneServer();
    const module = new Invalid();
    expect(() => registerModules(app, [module])).toThrow('Duplicate WebSocket');
    expect(app.hasWebSocket('/chat')).toBe(false);
    expect(
      (await app.handle(new Request('http://localhost/valid'))).status
    ).toBe(404);
    registerControllers(app, [new ValidController()]);
    @Module({
      controllers: () => [new ValidController()],
      gateways: () => [new ChatGateway()],
    })
    class Collision {}
    expect(() => registerModules(app, [new Collision()])).toThrow(
      'Duplicate Controller route'
    );
    expect(app.hasWebSocket('/chat')).toBe(false);
  });

  it('shares conflict detection with direct registrations in both directions', () => {
    @Module({
      controllers: () => [new ValidController()],
      gateways: () => [new ChatGateway()],
    })
    class Feature {}
    const first = new BackOneServer();
    registerModules(first, [new Feature()]);
    expect(() => registerControllers(first, [new ValidController()])).toThrow(
      'Duplicate Controller'
    );
    expect(() => registerWebSockets(first, [new ChatGateway()])).toThrow(
      'Duplicate WebSocket'
    );
    const second = new BackOneServer();
    second.ws('/chat', {});
    expect(() => registerModules(second, [new Feature()])).toThrow(
      'Duplicate WebSocket'
    );
  });

  it('rejects invalid selectors, members, prefixes, undecorated and inherited modules', () => {
    const app = new BackOneServer();
    class Undecorated {}
    class Inherited extends UsersModule {}
    expect(() => registerModules(app, [new Undecorated()])).toThrow('@Module');
    expect(() => registerModules(app, [new Inherited('Alice')])).toThrow(
      '@Module'
    );
    for (const prefix of ['/bad?query', '/bad#hash', '/:id', '/wild/*']) {
      expect(() => {
        @Module({ prefix })
        class Bad {}
        return Bad;
      }).toThrow(/prefix/i);
    }
    for (const invalid of [
      () => Promise.resolve([]),
      () => null,
      () => [null],
      () => Array<object>(1),
      () => [class Wrong {}],
    ]) {
      @Module({ imports: invalid } as unknown as ModuleOptions<object>)
      class Invalid {}
      expect(() => registerModules(app, [new Invalid()])).toThrow(
        /selector|array|instance/i
      );
    }
    expect(() => {
      @Module()
      @Module()
      class Twice {}
      return Twice;
    }).toThrow(/once/i);
  });

  it('preflights conflicting parameter names across modules', () => {
    @Controller('/users')
    class Other {
      @Get('/:name/extra') get() {}
    }
    @Module({ controllers: () => [new UsersController('Alice'), new Other()] })
    class Conflict {}
    const app = new BackOneServer();
    expect(() => registerModules(app, [new Conflict()])).toThrow(
      'Conflicting parameter names'
    );
    registerControllers(app, [new UsersController('retry')]);
  });

  it('isolates response caches by the final module route path', async () => {
    const entries = new Map<string, CachedResponse>();
    @Controller('/cached')
    class Cached {
      constructor(private readonly value: string) {}
      @Get()
      @Cache({
        store: entries,
        scope: 'public',
        key: () => 'same-key',
        ttlMs: 1000,
      })
      get() {
        return { value: this.value };
      }
    }
    @Module<Feature>({ controllers: (module) => [module.controller] })
    class Feature {
      constructor(readonly controller: Cached) {}
    }
    @Module<Left>({ prefix: '/left', imports: (module) => [module.feature] })
    class Left {
      constructor(readonly feature: Feature) {}
    }
    @Module<Right>({ prefix: '/right', imports: (module) => [module.feature] })
    class Right {
      constructor(readonly feature: Feature) {}
    }
    const app = new BackOneServer();
    registerModules(app, [
      new Left(new Feature(new Cached('left'))),
      new Right(new Feature(new Cached('right'))),
    ]);
    for (const path of ['left', 'right', 'left']) {
      const response = await app.handle(
        new Request(`http://localhost/${path}/cached`)
      );
      expect(await response.json()).toEqual({ value: path });
    }
    expect(entries.size).toBe(2);
  });

  it('mounts a real websocket gateway under module and app prefixes', async () => {
    @Module({ prefix: '/v1', gateways: () => [new ChatGateway()] })
    class ChatModule {}
    const app = new BackOneServer({ port: 0, hostname: '127.0.0.1' });
    app.usePrefix('/api');
    const result = registerModules(app, [new ChatModule()]);
    expect(result.gateways[0].path).toBe('/api/v1/chat');
    const port = await app.listen();
    try {
      const messages = await new Promise<string[]>((resolve, reject) => {
        const ws = new globalThis.WebSocket(
          `ws://127.0.0.1:${port}/api/v1/chat`
        );
        const messages: string[] = [];
        const timer = setTimeout(() => {
          ws.close();
          reject(new Error('WS timeout'));
        }, 2000);
        ws.onmessage = (event) => {
          messages.push(String(event.data));
          if (messages.length === 1) ws.send('module');
          else {
            clearTimeout(timer);
            ws.close();
            resolve(messages);
          }
        };
        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error('WS error'));
        };
      });
      expect(messages).toEqual(['ready', 'echo:module']);
    } finally {
      await app.close();
    }
  });
});
