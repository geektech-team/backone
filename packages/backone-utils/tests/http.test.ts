import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createHttpClient, HttpError } from '../lib/http';

describe('HttpClient', () => {
  const counters = new Map<string, number>();
  let server: { port: number; stop(closeActive?: boolean): void };
  let baseUrl: string;

  beforeAll(async () => {
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        const path = url.pathname;
        const n = (counters.get(path) ?? 0) + 1;
        counters.set(path, n);

        if (path === '/ok') {
          return Response.json({ hello: 'world', n });
        }
        if (path === '/echo') {
          const body = await req.text();
          return Response.json({
            method: req.method,
            body: body === '' ? null : JSON.parse(body),
            query: Object.fromEntries(url.searchParams),
            contentType: req.headers.get('content-type'),
          });
        }
        if (path === '/fail-twice') {
          return n < 3
            ? Response.json({ error: 'flaky' }, { status: 500 })
            : Response.json({ ok: true, n });
        }
        if (path === '/always-500') {
          return new Response('boom', { status: 500 });
        }
        if (path === '/slow') {
          await Bun.sleep(200);
          return Response.json({ slow: true });
        }
        if (path === '/bad-json') {
          return new Response('not json', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (path === '/text') {
          return new Response('plain text');
        }
        if (path === '/headers') {
          return Response.json({
            custom: req.headers.get('x-custom'),
            default: req.headers.get('x-default'),
          });
        }
        return new Response('not found', { status: 404 });
      },
    });
    baseUrl = `http://127.0.0.1:${server.port}`;
  });

  afterAll(() => {
    server.stop(true);
  });

  it('GET：JSON 自动解析为类型化 data', async () => {
    const client = createHttpClient({ baseUrl });
    const res = await client.get<{ hello: string; n: number }>('/ok');
    expect(res.ok).toBe(true);
    expect(res.data.hello).toBe('world');
    expect(typeof res.data.n).toBe('number');
    expect(res.status).toBe(200);
  });

  it('baseUrl 拼接、query 参数、JSON body 自动序列化与 content-type', async () => {
    const client = createHttpClient({ baseUrl: `${baseUrl}/` });
    const echo = await client.post<{
      method: string;
      body: { a: number; b: string };
      query: Record<string, string>;
      contentType: string | null;
    }>(
      '/echo',
      { a: 1, b: 'x' },
      { query: { page: 2, q: 'a b', skip: undefined } }
    );
    expect(echo.data.method).toBe('POST');
    expect(echo.data.body).toEqual({ a: 1, b: 'x' });
    expect(echo.data.query).toEqual({ page: '2', q: 'a b' });
    expect(echo.data.contentType).toBe('application/json');
  });

  it('非 2xx 抛 HttpError（HTTP_STATUS + status）', async () => {
    const client = createHttpClient({ baseUrl });
    try {
      await client.get('/nope');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).code).toBe('HTTP_STATUS');
      expect((error as HttpError).status).toBe(404);
    }
  });

  it('可重试状态码：500 重试后成功', async () => {
    const client = createHttpClient({
      baseUrl,
      retry: { maxRetries: 3, baseDelayMs: 1 },
    });
    const res = await client.get<{ ok: boolean; n: number }>('/fail-twice');
    expect(res.data.ok).toBe(true);
    expect(counters.get('/fail-twice')).toBe(3);
  });

  it('重试耗尽后仍抛 HTTP_STATUS（请求次数 = maxRetries + 1）', async () => {
    const before = counters.get('/always-500') ?? 0;
    const client = createHttpClient({
      baseUrl,
      retry: { maxRetries: 1, baseDelayMs: 1 },
    });
    await expect(client.get('/always-500')).rejects.toMatchObject({
      code: 'HTTP_STATUS',
      status: 500,
    });
    expect((counters.get('/always-500') ?? 0) - before).toBe(2);
  });

  it('超时抛 HTTP_TIMEOUT（30ms 超时命中 200ms 慢接口）', async () => {
    const client = createHttpClient({ baseUrl, timeoutMs: 30 });
    await expect(client.get('/slow')).rejects.toMatchObject({
      code: 'HTTP_TIMEOUT',
    });
  });

  it('非 JSON 响应返回原文本；content-type 声明 JSON 但解析失败抛 HTTP_BAD_RESPONSE', async () => {
    const client = createHttpClient({ baseUrl });
    const text = await client.get<string>('/text');
    expect(text.data).toBe('plain text');
    await expect(client.get('/bad-json')).rejects.toMatchObject({
      code: 'HTTP_BAD_RESPONSE',
    });
  });

  it('请求头合并：默认头 + 单次覆盖', async () => {
    const client = createHttpClient({
      baseUrl,
      headers: { 'x-default': 'd', 'x-custom': 'old' },
    });
    const res = await client.get<{ custom: string; default: string }>(
      '/headers',
      {
        headers: { 'x-custom': 'new' },
      }
    );
    expect(res.data.default).toBe('d');
    expect(res.data.custom).toBe('new');
  });

  it('网络错误自动重试（mock fetch：第一次抛错，第二次成功）', async () => {
    const client = createHttpClient({
      baseUrl,
      retry: { maxRetries: 1, baseDelayMs: 1 },
    });
    let calls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      calls += 1;
      if (calls === 1) {
        throw new TypeError('fetch failed');
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    try {
      const res = await client.get<{ ok: boolean }>('/ok');
      expect(res.data.ok).toBe(true);
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('retryOnNetworkError: false 时网络错误立即抛 HTTP_NETWORK', async () => {
    const client = createHttpClient({
      baseUrl,
      retry: { maxRetries: 2, baseDelayMs: 1, retryOnNetworkError: false },
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new TypeError('connection refused');
    }) as typeof fetch;
    try {
      await expect(client.get('/ok')).rejects.toMatchObject({
        code: 'HTTP_NETWORK',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('单次请求可用 retry: false 关闭重试（只请求一次）', async () => {
    const before = counters.get('/always-500') ?? 0;
    const client = createHttpClient({ baseUrl, retry: { maxRetries: 5 } });
    await expect(
      client.get('/always-500', { retry: false })
    ).rejects.toMatchObject({ code: 'HTTP_STATUS', status: 500 });
    expect((counters.get('/always-500') ?? 0) - before).toBe(1);
  });
});
