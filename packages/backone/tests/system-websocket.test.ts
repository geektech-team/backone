import { describe, expect, it } from 'bun:test';
import type { Server } from 'bun';
import { createServer, HttpError, timeout } from '../lib/index';
import type { BackOneWebSocket, WebSocketData } from '../lib/index';
import { Controller, Get, Use } from '../lib/decorators';
import { Authorize, RateLimit } from '../lib/decorators/access';
import { Status, Timeout } from '../lib/decorators/responses';
import {
  OnClose,
  OnDrain,
  OnMessage,
  OnOpen,
  WebSocket as Gateway,
  registerWebSockets,
} from '../lib/decorators/websocket';

const upgradeRequest = (path: string) =>
  new Request(`http://localhost${path}`, {
    headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
  });

describe('WebSocket upgrade middleware', () => {
  it('honors middleware responses and HttpError before attempting an upgrade', async () => {
    const app = createServer();
    let upgrades = 0;
    const server = {
      upgrade() {
        upgrades++;
        return true;
      },
    } as unknown as Server<WebSocketData>;
    app.ws(
      '/blocked',
      {},
      {
        middlewares: [() => new Response('blocked', { status: 401 })],
      }
    );
    app.ws(
      '/forbidden',
      {},
      {
        middlewares: [
          () => {
            throw new HttpError(403, 'Gateway forbidden');
          },
        ],
      }
    );

    const blocked = await app.handle(upgradeRequest('/blocked'), server);
    expect(blocked.status).toBe(401);
    expect(await blocked.text()).toBe('blocked');
    const forbidden = await app.handle(upgradeRequest('/forbidden'), server);
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({
      error: 'Gateway forbidden',
      status: 403,
    });
    expect(upgrades).toBe(0);
  });

  it('copies completed local middleware state into grouped upgrade data', async () => {
    const app = createServer().usePrefix('/api');
    let globalCalls = 0;
    let state: Record<string, unknown> | undefined;
    let data: WebSocketData | undefined;
    app.use(() => {
      globalCalls++;
      return new Response('global');
    });
    app.group('/v1', (group) => {
      group.ws(
        '/chat',
        {},
        {
          middlewares: [
            async (ctx, next) => {
              state = ctx.state;
              ctx.state.principal = { id: 'alice' };
              const result = await next();
              ctx.state.ready = true;
              return result;
            },
          ],
        }
      );
    });
    const server = {
      upgrade(_request: Request, options: { data: WebSocketData }) {
        data = options.data;
        return true;
      },
    } as unknown as Server<WebSocketData>;

    expect(
      (await app.handle(upgradeRequest('/api/v1/chat'), server)).status
    ).toBe(101);
    expect(data).toEqual({
      path: '/api/v1/chat',
      state: { principal: { id: 'alice' }, ready: true },
    });
    expect(data?.state).not.toBe(state);
    expect(globalCalls).toBe(0);
  });

  it('never performs a late upgrade after timeout returns its response', async () => {
    const app = createServer();
    let upgrades = 0;
    app.ws(
      '/slow',
      {},
      {
        middlewares: [
          timeout(5),
          async (_ctx, next) => {
            await Bun.sleep(25);
            return next();
          },
        ],
      }
    );
    const server = {
      upgrade() {
        upgrades++;
        return true;
      },
    } as unknown as Server<WebSocketData>;

    expect((await app.handle(upgradeRequest('/slow'), server)).status).toBe(
      504
    );
    await Bun.sleep(40);
    expect(upgrades).toBe(0);
  });
});

describe('WebSocket gateway registration', () => {
  it('describes bound lifecycle callbacks and applies the app prefix', () => {
    @Gateway('/chat')
    class Chat {
      @OnOpen() opened() {}
      @OnMessage() received() {}
      @OnClose() closed() {}
      @OnDrain() drained() {}
    }
    const app = createServer().usePrefix('/api');
    const result = registerWebSockets(app, [new Chat()]);
    expect(result).toEqual([
      {
        path: '/api/chat',
        gateway: 'Chat',
        events: [
          { event: 'open', handler: 'opened' },
          { event: 'message', handler: 'received' },
          { event: 'close', handler: 'closed' },
          { event: 'drain', handler: 'drained' },
        ],
      },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0].events)).toBe(true);
    expect(app.hasWebSocket('/chat')).toBe(true);
  });

  it('rejects invalid and duplicate batches before mounting any gateways', () => {
    @Gateway('/valid')
    class Valid {}
    @Gateway('/existing')
    class Existing {}
    @Gateway('/invalid/:id')
    class Parameters {}
    @Gateway('/invalid/*')
    class Wildcard {}
    @Gateway('/invalid?query')
    class Query {}
    const app = createServer();
    app.ws('/existing', {});
    for (const invalid of [
      new Existing(),
      new Parameters(),
      new Wildcard(),
      new Query(),
    ]) {
      expect(() => registerWebSockets(app, [new Valid(), invalid])).toThrow();
      expect(app.hasWebSocket('/valid')).toBe(false);
    }
    expect(() => registerWebSockets(app, [new Valid(), new Valid()])).toThrow(
      'Duplicate'
    );
    expect(app.hasWebSocket('/valid')).toBe(false);
    registerWebSockets(app, [new Valid()]);
    expect(() => registerWebSockets(app, [new Valid()])).toThrow('Duplicate');
  });

  it('requires an explicit gateway and public instance callbacks', () => {
    class Missing {
      @OnMessage() receive() {}
    }
    expect(() => registerWebSockets(createServer(), [new Missing()])).toThrow(
      '@WebSocket'
    );
    expect(() => {
      class Static {
        @OnOpen() static opened() {}
      }
      return Static;
    }).toThrow('public instance');
    expect(() => {
      class Private {
        @OnMessage() #received() {}
        use() {
          this.#received();
        }
      }
      return Private;
    }).toThrow('public instance');
  });

  it('rejects HTTP declarations and middleware on event callbacks', () => {
    @Gateway('/route')
    @Controller('/http')
    class Route {
      @OnMessage()
      @Get()
      receive() {}
    }
    @Gateway('/middleware')
    class Middleware {
      @OnOpen()
      @Use((_ctx, next) => next())
      open() {}
    }
    @Gateway('/status')
    @Status(201)
    class HttpPolicy {}
    @Gateway('/event-policy')
    class EventPolicy {
      @OnOpen()
      @Authorize({ authenticate: () => ({ id: 'alice' }) })
      open() {}
    }
    expect(() => registerWebSockets(createServer(), [new Route()])).toThrow(
      'HTTP'
    );
    expect(() =>
      registerWebSockets(createServer(), [new Middleware()])
    ).toThrow('event');
    expect(() =>
      registerWebSockets(createServer(), [new HttpPolicy()])
    ).toThrow('HTTP-only');
    expect(() =>
      registerWebSockets(createServer(), [new EventPolicy()])
    ).toThrow('event');
  });

  it('rejects multiple callbacks for one event without partially registering a batch', () => {
    @Gateway('/valid')
    class Valid {}
    @Gateway('/duplicate-event')
    class Duplicate {
      @OnMessage() one() {}
      @OnMessage() two() {}
    }
    const app = createServer();
    expect(() =>
      registerWebSockets(app, [new Valid(), new Duplicate()])
    ).toThrow('Duplicate');
    expect(app.hasWebSocket('/valid')).toBe(false);
  });

  it('hides inherited callbacks for prototype overrides and non-callable own shadows', () => {
    class Base {
      @OnOpen() open() {}
      @OnMessage() message() {}
    }
    @Gateway('/override')
    class Override extends Base {
      override open() {}
    }
    expect(
      registerWebSockets(createServer(), [new Override()])[0].events
    ).toEqual([{ event: 'message', handler: 'message' }]);
    for (const descriptor of [
      { value: 'hidden' },
      {
        get() {
          throw new Error('Callback getter must not run');
        },
      },
    ]) {
      const instance = new Override();
      Object.defineProperty(instance, 'message', descriptor);
      expect(registerWebSockets(createServer(), [instance])[0].events).toEqual(
        []
      );
    }
  });
});

describe('WebSocket gateway handshakes', () => {
  it('authenticates and rate limits upgrades before accepting any connection', async () => {
    const calls: string[] = [];
    let attempts = 0;
    @RateLimit(
      {
        consume(key) {
          calls.push(`limit:${key}`);
          attempts++;
          return {
            allowed: attempts === 1,
            remaining: 0,
            resetAt: Date.now() + 10_000,
          };
        },
      },
      { key: (ctx) => String((ctx.state.principal as { id: string }).id) }
    )
    @Timeout(20)
    @Authorize({
      authenticate: async (ctx) => {
        calls.push('authenticate');
        if (ctx.query.get('token') === 'slow') await Bun.sleep(50);
        return ctx.query.get('token') === 'yes' ? { id: 'alice' } : null;
      },
    })
    @Use((_ctx, next) => {
      calls.push('use');
      return next();
    })
    @Gateway('/secure')
    class Secure {
      @OnOpen() open(ws: BackOneWebSocket<WebSocketData>) {
        calls.push('open');
        ws.send(JSON.stringify(ws.data.state?.principal));
      }
    }
    const app = createServer({ port: 0 });
    registerWebSockets(app, [new Secure()]);
    const port = await app.listen();
    const rejectUpgrade = (query = '') =>
      fetch(`http://127.0.0.1:${port}/secure${query}`, {
        headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
      });
    try {
      expect((await rejectUpgrade()).status).toBe(401);
      expect(attempts).toBe(0);
      const client = new globalThis.WebSocket(
        `ws://127.0.0.1:${port}/secure?token=yes`
      );
      expect(await nextMessage(client)).toBe('{"id":"alice"}');
      const ended = nextClose(client);
      client.close();
      await ended;
      const limited = await rejectUpgrade('?token=yes');
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
      const slow = await rejectUpgrade('?token=slow');
      expect(slow.status).toBe(504);
      await Bun.sleep(60);
      expect(calls).toEqual([
        'use',
        'authenticate',
        'use',
        'authenticate',
        'limit:alice',
        'open',
        'use',
        'authenticate',
        'limit:alice',
        'use',
        'authenticate',
      ]);
    } finally {
      await app.close();
    }
  });

  it('retains inherited callback metadata through method wrappers in either order', async () => {
    function wrap<This, Args extends unknown[]>(
      target: (this: This, ...args: Args) => unknown
    ) {
      return function (this: This, ...args: Args) {
        return target.apply(this, args);
      };
    }
    class Base {
      constructor(private readonly label: string) {}
      @wrap
      @OnOpen()
      open(ws: BackOneWebSocket<WebSocketData>) {
        ws.send(this.label);
      }
      @OnMessage()
      @wrap
      message(
        ws: BackOneWebSocket<WebSocketData>,
        message: string | Uint8Array
      ) {
        ws.send(`wrapped:${message}`);
      }
    }
    @Gateway('/inherited')
    class Inherited extends Base {
      constructor() {
        super('inherited');
        this.open = this.open.bind(this);
      }
    }
    @Gateway('/replacement')
    class Replacement extends Base {
      constructor() {
        super('replacement');
        this.message = (ws, message) => {
          ws.send(`own:${message}`);
        };
      }
    }
    const app = createServer({ port: 0 });
    registerWebSockets(app, [new Inherited(), new Replacement()]);
    const port = await app.listen();
    try {
      for (const [path, response] of [
        ['inherited', 'wrapped:hello'],
        ['replacement', 'own:hello'],
      ]) {
        const client = new globalThis.WebSocket(
          `ws://127.0.0.1:${port}/${path}`
        );
        expect(await nextMessage(client)).toBe(path);
        const received = nextMessage(client);
        client.send('hello');
        expect(await received).toBe(response);
        const ended = nextClose(client);
        client.close();
        await ended;
      }
    } finally {
      await app.close();
    }
  });

  it('runs class middleware once and binds connection lifecycle callbacks', async () => {
    let upgrades = 0;
    const closed: [number, string][] = [];
    @Use((ctx, next) => {
      upgrades++;
      ctx.state.principal = { id: 'alice' };
      return next();
    })
    @Gateway('/chat')
    class Chat {
      #counter = { messages: 0 };
      constructor(private readonly label: string) {}

      @OnOpen() opened(ws: BackOneWebSocket<WebSocketData>) {
        ws.send(JSON.stringify(ws.data.state));
      }
      @OnMessage() async received(
        ws: BackOneWebSocket<WebSocketData>,
        message: string | Uint8Array
      ) {
        await Promise.resolve();
        this.#counter.messages++;
        ws.send(`${this.label}:${message}:${this.#counter.messages}`);
      }
      @OnClose() closed(
        _ws: BackOneWebSocket<WebSocketData>,
        code: number,
        reason: string
      ) {
        closed.push([code, reason]);
      }
    }
    const app = createServer({ port: 0 });
    registerWebSockets(app, [new Chat('bound')]);
    const port = await app.listen();
    try {
      const client = new globalThis.WebSocket(`ws://127.0.0.1:${port}/chat`);
      const opened = nextMessage(client);
      expect(await opened).toBe('{"principal":{"id":"alice"}}');
      const received = nextMessage(client);
      client.send('hello');
      expect(await received).toBe('bound:hello:1');
      expect(upgrades).toBe(1);
      const ended = nextClose(client);
      client.close(1000, 'done');
      await ended;
      await Bun.sleep(10);
      expect(closed).toEqual([[1000, 'done']]);
    } finally {
      await app.close();
    }
  });

  it('closes asynchronous event failures with 1011', async () => {
    @Gateway('/failure')
    class Failure {
      @OnOpen() async opened() {
        await Promise.resolve();
        throw new Error('Async callback failure');
      }
    }
    const app = createServer({ port: 0 });
    registerWebSockets(app, [new Failure()]);
    const port = await app.listen();
    try {
      const client = new globalThis.WebSocket(`ws://127.0.0.1:${port}/failure`);
      expect((await nextClose(client)).code).toBe(1011);
    } finally {
      await app.close();
    }
  });

  it.each(['sync', 'async'] as const)(
    'contains %s message failures and rejected close callbacks',
    async (mode) => {
      @Gateway('/failure')
      class Failure {
        @OnOpen() opened(ws: BackOneWebSocket<WebSocketData>) {
          ws.send('ready');
        }
        @OnMessage() received() {
          if (mode === 'sync') throw new Error('Sync message failure');
          return Promise.reject(new Error('Async message failure'));
        }
        @OnClose() closed() {
          return Promise.reject(new Error('Async close failure'));
        }
      }
      const app = createServer({ port: 0 });
      registerWebSockets(app, [new Failure()]);
      const port = await app.listen();
      try {
        const client = new globalThis.WebSocket(
          `ws://127.0.0.1:${port}/failure`
        );
        await nextMessage(client);
        const ended = nextClose(client);
        client.send('fail');
        expect((await ended).code).toBe(1011);
        await Bun.sleep(10);
      } finally {
        await app.close();
      }
    }
  );
});

function nextMessage(client: globalThis.WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    client.addEventListener('message', (event) => resolve(String(event.data)), {
      once: true,
    });
    client.addEventListener(
      'error',
      () => reject(new Error('WebSocket failed')),
      {
        once: true,
      }
    );
  });
}

function nextClose(client: globalThis.WebSocket): Promise<CloseEvent> {
  return new Promise((resolve) => {
    client.addEventListener('close', resolve, { once: true });
  });
}
