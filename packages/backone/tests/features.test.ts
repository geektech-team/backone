import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createServer } from '../lib/server';

describe('websocket', () => {
  const app = createServer({ port: 0 });
  const received: string[] = [];
  let opened = false;
  let closed = false;

  app.ws('/echo', {
    open: () => {
      opened = true;
    },
    message: (ws, message) => {
      received.push(String(message));
      ws.send(`echo: ${message}`);
    },
    close: () => {
      closed = true;
    },
  });

  let port = 0;
  beforeAll(async () => {
    port = await app.listen();
  });
  afterAll(() => app.close());

  it('连接、收发消息、关闭', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/echo`);
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });
    expect(opened).toBe(true);

    ws.send('hello');
    const data = await new Promise<string>((resolve) => {
      ws.onmessage = (event) => resolve(String(event.data));
    });
    expect(data).toBe('echo: hello');
    expect(received).toContain('hello');

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
    // 等待服务器端 close 回调执行
    await new Promise((r) => setTimeout(r, 20));
    expect(closed).toBe(true);
  });

  it('未注册路径的升级请求走 404', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/nope`, {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
    });
    expect(res.status).toBe(404);
  });
});

describe('gzip', () => {
  const largeText = 'x'.repeat(2048);

  it('Accept-Encoding: gzip 时压缩文本响应', async () => {
    const app = createServer({ port: 0 });
    app.useGzip();
    app.get('/text', () => largeText);
    const port = await app.listen();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/text`, {
        headers: { 'Accept-Encoding': 'gzip' },
      });
      expect(res.headers.get('content-encoding')).toBe('gzip');
      expect(res.headers.get('vary')).toContain('Accept-Encoding');
      // fetch 自动解压 gzip，text() 返回原始内容
      expect(await res.text()).toBe(largeText);
    } finally {
      app.close();
    }
  });

  it('客户端不支持 gzip 时不压缩', async () => {
    const app = createServer({ port: 0 });
    app.useGzip();
    app.get('/text', () => largeText);
    const port = await app.listen();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/text`, {
        headers: { 'Accept-Encoding': 'identity' },
      });
      expect(res.headers.get('content-encoding')).toBeNull();
      expect(await res.text()).toBe(largeText);
    } finally {
      app.close();
    }
  });

  it('低于阈值的小响应不压缩', async () => {
    const app = createServer({ port: 0 });
    app.useGzip({ threshold: 1024 });
    app.get('/small', () => 'tiny');
    const port = await app.listen();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/small`, {
        headers: { 'Accept-Encoding': 'gzip' },
      });
      expect(res.headers.get('content-encoding')).toBeNull();
    } finally {
      app.close();
    }
  });

  it('已编码的响应不重复压缩', async () => {
    const app = createServer({ port: 0 });
    app.useGzip();
    app.get('/encoded', (ctx) =>
      ctx.set('content-encoding', 'identity').text(largeText)
    );
    const port = await app.listen();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/encoded`, {
        headers: { 'Accept-Encoding': 'gzip' },
      });
      expect(res.headers.get('content-encoding')).toBe('identity');
    } finally {
      app.close();
    }
  });
});

describe('typed routes', () => {
  it('泛型 params 在处理器中类型化', async () => {
    const app = createServer({ port: 0 });
    app.get<{ id: string }>('/users/:id', (ctx) => {
      const id: string = ctx.params.id;
      return ctx.json({ id });
    });
    const port = await app.listen();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/users/42`);
      expect(await res.json()).toEqual({ id: '42' });
    } finally {
      app.close();
    }
  });

  it('多处理器链支持泛型', async () => {
    const app = createServer({ port: 0 });
    app.get<{ slug: string }>(
      '/posts/:slug',
      (ctx, next) => {
        ctx.state.slug = ctx.params.slug;
        return next();
      },
      (ctx) => ctx.json({ slug: ctx.state.slug })
    );
    const port = await app.listen();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/posts/hello`);
      expect(await res.json()).toEqual({ slug: 'hello' });
    } finally {
      app.close();
    }
  });
});

describe('graceful shutdown', () => {
  it('close 返回 Promise 并停止监听', async () => {
    const app = createServer({ port: 0 });
    app.get('/', () => 'ok');
    const port = await app.listen();
    expect(app.port).toBe(port);
    await app.close();
    expect(app.port).toBeNull();
  });

  it('优雅关闭等待进行中请求完成', async () => {
    const app = createServer({ port: 0 });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    app.get('/slow', async () => {
      await gate;
      return 'done';
    });
    const port = await app.listen();

    const responsePromise = fetch(`http://127.0.0.1:${port}/slow`);
    await new Promise((r) => setTimeout(r, 50));

    const closePromise = app.close({ timeout: 2000 });
    release();
    await closePromise;

    const res = await responsePromise;
    expect(await res.text()).toBe('done');
  });
});

describe('route group', () => {
  it('批量注册带前缀的路由', async () => {
    const app = createServer({ port: 0 });
    app.group('/api', (api) => {
      api.get('/users', () => 'users');
      api.get<{ id: string }>('/users/:id', (ctx) => ctx.params.id);
    });
    const port = await app.listen();
    try {
      const res1 = await fetch(`http://127.0.0.1:${port}/api/users`);
      expect(await res1.text()).toBe('users');
      const res2 = await fetch(`http://127.0.0.1:${port}/api/users/42`);
      expect(await res2.text()).toBe('42');
      const res3 = await fetch(`http://127.0.0.1:${port}/users`);
      expect(res3.status).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('usePrefix', () => {
  it('持久形式：为后续注册的路由统一增加前缀', async () => {
    const app = createServer({ port: 0 });
    app.usePrefix('/api');
    app.get('/users', () => 'users');
    app.get<{ id: string }>('/users/:id', (ctx) => ctx.params.id);
    const port = await app.listen();
    try {
      const res1 = await fetch(`http://127.0.0.1:${port}/api/users`);
      expect(await res1.text()).toBe('users');
      const res2 = await fetch(`http://127.0.0.1:${port}/api/users/7`);
      expect(await res2.text()).toBe('7');
      const res3 = await fetch(`http://127.0.0.1:${port}/users`);
      expect(res3.status).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('前缀归一化：自动补前导斜杠、去末尾斜杠；空串重置', async () => {
    const app = createServer({ port: 0 });
    expect(app.prefix).toBe('');
    app.usePrefix('api/');
    expect(app.prefix).toBe('/api');
    app.get('/x', () => 'x');
    app.usePrefix('');
    expect(app.prefix).toBe('');
    app.get('/y', () => 'y');
    const port = await app.listen();
    try {
      expect(await (await fetch(`http://127.0.0.1:${port}/api/x`)).text()).toBe(
        'x'
      );
      expect(await (await fetch(`http://127.0.0.1:${port}/y`)).text()).toBe(
        'y'
      );
      expect((await fetch(`http://127.0.0.1:${port}/x`)).status).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('持久形式替换而非叠加', async () => {
    const app = createServer({ port: 0 });
    app.usePrefix('/api');
    app.usePrefix('/api/v2');
    expect(app.prefix).toBe('/api/v2');
    app.get('/ping', () => 'pong');
    const port = await app.listen();
    try {
      expect(
        await (await fetch(`http://127.0.0.1:${port}/api/v2/ping`)).text()
      ).toBe('pong');
      expect((await fetch(`http://127.0.0.1:${port}/api/ping`)).status).toBe(
        404
      );
    } finally {
      await app.close();
    }
  });

  it('作用域形式：相对当前前缀叠加，结束自动恢复，支持嵌套', async () => {
    const app = createServer({ port: 0 });
    app.usePrefix('/api');
    app.usePrefix('/v2', (api) => {
      api.get('/users', () => 'v2-users');
      api.usePrefix('/admin', (admin) => {
        admin.get('/stats', () => 'v2-admin-stats');
      });
    });
    expect(app.prefix).toBe('/api');
    app.get('/health', () => 'health');
    const port = await app.listen();
    try {
      expect(
        await (await fetch(`http://127.0.0.1:${port}/api/v2/users`)).text()
      ).toBe('v2-users');
      expect(
        await (
          await fetch(`http://127.0.0.1:${port}/api/v2/admin/stats`)
        ).text()
      ).toBe('v2-admin-stats');
      expect(
        await (await fetch(`http://127.0.0.1:${port}/api/health`)).text()
      ).toBe('health');
      expect((await fetch(`http://127.0.0.1:${port}/v2/users`)).status).toBe(
        404
      );
    } finally {
      await app.close();
    }
  });

  it('与 group 叠加：前缀 + 组前缀', async () => {
    const app = createServer({ port: 0 });
    app.usePrefix('/api');
    app.group('/v1', (api) => {
      api.get('/users', () => 'v1-users');
    });
    const port = await app.listen();
    try {
      expect(
        await (await fetch(`http://127.0.0.1:${port}/api/v1/users`)).text()
      ).toBe('v1-users');
      expect((await fetch(`http://127.0.0.1:${port}/v1/users`)).status).toBe(
        404
      );
    } finally {
      await app.close();
    }
  });

  it('WebSocket 路径同样应用前缀', async () => {
    const app = createServer({ port: 0 });
    app.usePrefix('/ws');
    app.ws('/echo', {
      message: (ws, message) => ws.send(`echo: ${message}`),
    });
    const port = await app.listen();
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/echo`);
      await new Promise<void>((resolve) => {
        ws.onopen = () => resolve();
      });
      ws.send('hi');
      const data = await new Promise<string>((resolve) => {
        ws.onmessage = (event) => resolve(String(event.data));
      });
      expect(data).toBe('echo: hi');
      ws.close();
      await new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });
    } finally {
      await app.close();
    }
  });
});

describe('timeout', () => {
  it('超时返回 504', async () => {
    const app = createServer({ port: 0 });
    app.useTimeout({ ms: 50 });
    app.get('/slow', async () => {
      await new Promise((r) => setTimeout(r, 200));
      return 'done';
    });
    const port = await app.listen();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/slow`);
      expect(res.status).toBe(504);
    } finally {
      await app.close();
    }
  });

  it('未超时的请求正常返回', async () => {
    const app = createServer({ port: 0 });
    app.useTimeout({ ms: 1000 });
    app.get('/fast', () => 'ok');
    const port = await app.listen();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/fast`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('ok');
    } finally {
      await app.close();
    }
  });
});

describe('helmet', () => {
  it('设置默认安全头', async () => {
    const app = createServer({ port: 0 });
    app.useHelmet();
    app.get('/', () => 'ok');
    const port = await app.listen();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(res.headers.get('X-XSS-Protection')).toBe('0');
    } finally {
      await app.close();
    }
  });

  it('options 覆盖和禁用安全头', async () => {
    const app = createServer({ port: 0 });
    app.useHelmet({
      xFrameOptions: 'SAMEORIGIN',
      referrerPolicy: false,
    });
    app.get('/', () => 'ok');
    const port = await app.listen();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
      expect(res.headers.get('Referrer-Policy')).toBeNull();
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    } finally {
      await app.close();
    }
  });
});
