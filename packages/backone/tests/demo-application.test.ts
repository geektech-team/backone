import { describe, expect, it } from 'bun:test';

describe('Object first playground', () => {
  it('mounts the task business module with injected databases under an application prefix', async () => {
    const { BackOneServer } = await import('@geektech/backone');
    const { registerModules } = await import('@geektech/backone/decorators');
    const { DemoDatabases } =
      await import('../../../playground/backone-demo/src/db');
    const { TasksModule } =
      await import('../../../playground/backone-demo/src/modules/tasks/tasks-module');
    const databases = new DemoDatabases(':memory:');
    const server = new BackOneServer();
    try {
      await databases.initialize();
      const tasks = new TasksModule(databases);
      await tasks.initialize();
      server.usePrefix('/workspace');
      const registration = registerModules(server, [tasks]);
      expect(registration.modules).toEqual([
        { name: 'TasksModule', prefix: '/workspace/api' },
      ]);
      expect(server.prefix).toBe('/workspace');
      const created = await server.handle(
        new Request('http://localhost/workspace/api/tasks', {
          method: 'POST',
          body: JSON.stringify({ title: 'module-owned task' }),
        })
      );
      expect(created.status).toBe(200);
      const task = (await created.json()) as { id: number; title: string };
      expect(task.title).toBe('module-owned task');
      const audit = await server.handle(
        new Request('http://localhost/workspace/api/audit')
      );
      expect(await audit.json()).toMatchObject({
        total: 1,
        logs: [{ action: 'task.create', task_id: task.id }],
      });
      expect(registerModules(server, [tasks]).routes).toEqual([]);
    } finally {
      await server.close();
      await databases.close();
    }
  });

  it('constructs without opening resources and isolates initialized applications', async () => {
    const { DemoApplication } =
      await import('../../../playground/backone-demo/src/app');
    const first = new DemoApplication({
      databaseUrl: ':memory:',
      logger: false,
      development: false,
    });
    const second = new DemoApplication({
      databaseUrl: ':memory:',
      logger: false,
      development: false,
    });
    expect(first.server.port).toBeNull();
    expect(first.databases.manager.names()).toEqual([]);
    try {
      await Promise.all([
        first.initialize(),
        first.initialize(),
        second.initialize(),
      ]);
      const request = (path: string, method = 'GET', body?: unknown) =>
        new Request(`http://localhost${path}`, {
          method,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      const created = await first.server.handle(
        request('/api/tasks', 'POST', { title: 'class repository' })
      );
      expect(created.status).toBe(200);
      const task = (await created.json()) as { id: number; title: string };
      expect(task.title).toBe('class repository');
      const list = await first.server.handle(request('/api/tasks?q=class'));
      expect(await list.json()).toMatchObject({ total: 1 });
      const isolated = await second.server.handle(
        request('/api/tasks?q=class')
      );
      expect(await isolated.json()).toEqual({ total: 0, items: [] });
      const update = await first.server.handle(
        request(`/api/tasks/${task.id}`, 'PUT', { done: true })
      );
      expect(await update.json()).toMatchObject({
        count: 1,
        rows: [{ done: 1 }],
      });
      const batch = await first.server.handle(
        request('/api/tasks/batch', 'POST', {
          titles: ['batch one', 'batch two'],
        })
      );
      expect(await batch.json()).toMatchObject({ inserted: 2 });
      const deleted = await first.server.handle(
        request(`/api/tasks/${task.id}`, 'DELETE')
      );
      expect(await deleted.json()).toEqual({ deleted: 1 });
      const audit = await first.server.handle(request('/api/audit'));
      expect(await audit.json()).toMatchObject({ total: 4 });
      const missing = await first.server.handle(
        request(`/api/tasks/${task.id}`)
      );
      expect(missing.status).toBe(404);
      const main = first.databases.manager.get('main');
      await first.stop();
      expect(main.isClosed).toBe(true);
      expect(first.databases.manager.names()).toEqual([]);
    } finally {
      await Promise.all([first.stop(), second.stop()]);
    }
  });

  it('preserves framework, prefix, tools and streaming routes', async () => {
    const { DemoApplication } =
      await import('../../../playground/backone-demo/src/app');
    const app = await new DemoApplication({
      databaseUrl: ':memory:',
      logger: false,
      development: false,
    }).initialize();
    try {
      const get = (path: string) =>
        app.server.handle(new Request(`http://localhost${path}`));
      expect(await (await get('/')).text()).toBe(
        'BackOne playground is running'
      );
      expect(await (await get('/hello/Alice')).text()).toBe('hello, Alice');
      expect(await (await get('/typed/2')).json()).toEqual({
        id: '2',
        typed: true,
      });
      expect(await (await get('/files/a/b')).json()).toEqual({
        wildcard: 'a/b',
      });
      expect(await (await get('/search?q=hello&page=2')).json()).toEqual({
        q: 'hello',
        page: 2,
      });
      const json = await get('/json');
      expect(json.headers.get('x-request-id')).toBeTruthy();
      expect(json.headers.get('x-server-timing')).toEndWith('ms');
      expect((await get('/status')).status).toBe(202);
      expect(await (await get('/api/v1/users/3')).json()).toEqual({
        id: '3',
        version: 'v1',
      });
      expect(await (await get('/api/v2/hello')).json()).toEqual({
        message: 'hello from prefixed route',
        prefix: '/api/v2',
      });
      expect(await (await get('/api/v2/hello/')).json()).toEqual({
        message: 'hello from prefixed route',
        prefix: '/api/v2',
      });
      expect(await (await get('/api/v2/admin/ping')).text()).toBe(
        'admin pong under /api/v2/admin'
      );
      expect((await get('/api/tools/ids')).status).toBe(200);
      expect(await (await get('/api/db')).json()).toMatchObject({
        databases: ['main', 'audit'],
      });
      const events = await get('/events');
      expect(events.headers.get('content-type')).toContain('text/event-stream');
      expect(await events.text()).toContain(
        'id: 3\nevent: done\ndata: stream complete'
      );
      const tokenResponse = await app.server.handle(
        new Request('http://localhost/api/tools/token', {
          method: 'POST',
          body: '{}',
        })
      );
      const token = (await tokenResponse.json()) as { token: string };
      const me = await app.server.handle(
        new Request('http://localhost/api/tools/me', {
          headers: { authorization: `Bearer ${token.token}` },
        })
      );
      expect(await me.json()).toMatchObject({ sub: 'demo-user', role: 'user' });
    } finally {
      await app.stop();
    }
  });

  it('binds repositories to the transaction connection and rolls back failures', async () => {
    const { DemoApplication } =
      await import('../../../playground/backone-demo/src/app');
    const { TasksRepository } =
      await import('../../../playground/backone-demo/src/modules/tasks/tasks-repository');
    const app = await new DemoApplication({
      databaseUrl: ':memory:',
      logger: false,
      development: false,
    }).initialize();
    try {
      const database = app.databases.manager.get('main');
      const tasks = new TasksRepository(database);
      const before = await tasks.list();
      await expect(
        database.transaction(async (tx) => {
          await new TasksRepository(tx).create({
            title: 'rolled back',
            done: 0,
            created_at: new Date().toISOString(),
          });
          throw new Error('rollback');
        })
      ).rejects.toThrow('rollback');
      expect(await tasks.list()).toEqual(before);
    } finally {
      await app.stop();
    }
  });

  it('coordinates pending initialization and start with an idempotent terminal stop', async () => {
    const { DemoApplication } =
      await import('../../../playground/backone-demo/src/app');
    const app = new DemoApplication({ databaseUrl: ':memory:', logger: false });
    const initializing = app.initialize();
    expect(app.initialize()).toBe(initializing);
    const starting = app.start();
    const stopped = app.stop();
    expect(app.stop()).toBe(stopped);
    await expect(initializing).rejects.toThrow('closed');
    await expect(starting).rejects.toThrow('closed');
    await stopped;
    expect(app.server.port).toBeNull();
    expect(app.databases.manager.names()).toEqual([]);
    await expect(app.initialize()).rejects.toThrow('closed');
    await expect(app.start()).rejects.toThrow('closed');
  });

  it('closes live SSE streams when the application stops', async () => {
    const { DemoApplication } =
      await import('../../../playground/backone-demo/src/app');
    const app = await new DemoApplication({
      databaseUrl: ':memory:',
      logger: false,
    }).initialize();
    const response = await app.server.handle(
      new Request('http://localhost/clock')
    );
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    if (!reader) throw new Error('Expected clock response body');
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('data:');
    await app.stop();
    expect(await reader.read()).toEqual({ done: true, value: undefined });
  });

  it('serves static assets, self HTTP calls and both WebSocket gateways on its actual port', async () => {
    const { DemoApplication } =
      await import('../../../playground/backone-demo/src/app');
    const app = new DemoApplication({
      databaseUrl: ':memory:',
      port: 0,
      hostname: '127.0.0.1',
      logger: false,
      development: false,
    });
    const port = await app.start();
    try {
      expect(await app.start()).toBe(port);
      const origin = `http://127.0.0.1:${port}`;
      const staticPage = await fetch(`${origin}/static/`);
      expect(staticPage.status).toBe(200);
      expect(await staticPage.text()).toContain('BackOne');
      const proxy = await fetch(`${origin}/api/tools/http`);
      expect(proxy.status).toBe(200);
      expect(await proxy.json()).toHaveProperty('proxied.uuidv7');
      const exchange = (path: string) =>
        new Promise<string[]>((resolve, reject) => {
          const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
          const messages: string[] = [];
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('WebSocket timeout'));
          }, 3000);
          ws.onmessage = (event) => {
            messages.push(String(event.data));
            if (messages.length === 1) ws.send('classes');
            else {
              clearTimeout(timeout);
              ws.close();
              resolve(messages);
            }
          };
          ws.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('WebSocket failed'));
          };
        });
      expect(await exchange('/ws')).toEqual([
        'connected to backone websocket',
        'echo: classes',
      ]);
      const tokenResponse = await fetch(`${origin}/controller-api/session`, {
        method: 'POST',
      });
      const session = (await tokenResponse.json()) as { token: string };
      const messages = await exchange(
        `/controller-api/chat?token=${encodeURIComponent(session.token)}`
      );
      expect(JSON.parse(messages[0])).toMatchObject({
        connected: true,
        principal: { id: 'demo-user', role: 'member' },
      });
      expect(messages[1]).toBe('echo: classes');
    } finally {
      await app.stop();
    }
    expect(app.server.port).toBeNull();
  });

  it('releases database resources when listening fails', async () => {
    const { DemoApplication } =
      await import('../../../playground/backone-demo/src/app');
    const blocker = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => new Response('occupied'),
    });
    const app = new DemoApplication({
      databaseUrl: ':memory:',
      port: blocker.port,
      hostname: '127.0.0.1',
      logger: false,
    });
    await app.initialize();
    const database = app.databases.manager.get('main');
    try {
      await expect(app.start()).rejects.toThrow();
      expect(database.isClosed).toBe(true);
      expect(app.databases.manager.names()).toEqual([]);
      await expect(app.initialize()).rejects.toThrow('closed');
    } finally {
      await app.stop();
      blocker.stop(true);
    }
  });
});
