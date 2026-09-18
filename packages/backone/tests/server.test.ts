import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createServer } from '../lib/server';

describe('server', () => {
  const server = createServer();

  server.use(async (ctx, next) => {
    ctx.state.requestId = 'req-1';
    const result = await next();
    if (result instanceof Response) {
      result.headers.set('X-Powered-By', 'BackOne');
    }
    return result;
  });

  server.get('/hello', () => 'hi');
  server.get('/json', (ctx) => ctx.json({ ok: true, status: 200 }));
  server.get('/users/:id', (ctx) => ctx.json({ id: ctx.params.id }));
  server.get('/raw', () => new Response('raw', { status: 201 }));
  server.post('/echo', async (ctx) => ctx.json(await ctx.bodyJson()));
  server.get('/state', (ctx) => ctx.json({ requestId: ctx.state.requestId }));
  server.post('/form', async (ctx) =>
    ctx.json(Object.fromEntries(await ctx.bodyForm()))
  );
  server.get('/boom', () => {
    throw new Error('boom');
  });
  server.get('/redirect', (ctx) => ctx.redirect('/hello'));

  let base = '';

  beforeAll(async () => {
    const port = await server.listen({ port: 0 });
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server.close();
  });

  it('返回文本', async () => {
    const res = await fetch(`${base}/hello`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hi');
  });

  it('返回 JSON 并合并中间件响应头', async () => {
    const res = await fetch(`${base}/json`);
    expect(await res.json()).toEqual({ ok: true, status: 200 });
    expect(res.headers.get('X-Powered-By')).toBe('BackOne');
  });

  it('解析路径参数', async () => {
    const res = await fetch(`${base}/users/42`);
    expect(await res.json()).toEqual({ id: '42' });
  });

  it('直接返回 Response 透传状态码', async () => {
    const res = await fetch(`${base}/raw`);
    expect(res.status).toBe(201);
    expect(await res.text()).toBe('raw');
  });

  it('POST JSON 请求体', async () => {
    const res = await fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'BackOne' }),
    });
    expect(await res.json()).toEqual({ name: 'BackOne' });
  });

  it('中间件通过 ctx.state 传数据给处理器', async () => {
    const res = await fetch(`${base}/state`);
    expect(await res.json()).toEqual({ requestId: 'req-1' });
  });

  it('POST 表单请求体', async () => {
    const form = new FormData();
    form.set('name', 'max');
    const res = await fetch(`${base}/form`, { method: 'POST', body: form });
    expect(await res.json()).toEqual({ name: 'max' });
  });

  it('POST 非 JSON 请求体返回 400', async () => {
    const res = await fetch(`${base}/echo`, {
      method: 'POST',
      body: 'not-json',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Invalid JSON body',
      status: 400,
    });
  });

  it('重定向', async () => {
    const res = await fetch(`${base}/redirect`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/hello');
  });

  it('404 返回 JSON 错误', async () => {
    const res = await fetch(`${base}/missing`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'Not Found', status: 404 });
  });

  it('405 返回 Allow 头', async () => {
    const res = await fetch(`${base}/hello`, { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toContain('GET');
  });

  it('处理器抛错时返回 500 且不泄漏内部信息', async () => {
    const res = await fetch(`${base}/boom`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: 'Internal Server Error',
      status: 500,
    });
  });

  it('port 与 close 生命周期', () => {
    expect(server.port).toBeTypeOf('number');
    server.close();
    expect(server.port).toBeNull();
  });
});

describe('static', () => {
  const dir = mkdtempSync(join(tmpdir(), 'backone-static-'));
  writeFileSync(join(dir, 'index.html'), '<h1>home</h1>');
  writeFileSync(join(dir, 'app.js'), 'console.log(1)');

  const server = createServer();
  server.serveStatic('/public', dir);
  server.get('/health', () => 'ok');

  let base = '';

  beforeAll(async () => {
    const port = await server.listen({ port: 0 });
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('提供静态文件', async () => {
    const res = await fetch(`${base}/public/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(await res.text()).toBe('<h1>home</h1>');
  });

  it('静态文件带缓存头', async () => {
    const res = await fetch(`${base}/public/app.js`);
    expect(res.headers.get('Cache-Control')).toContain('public');
    expect(res.headers.get('Content-Type')).toContain('javascript');
  });

  it('目录穿越被拒绝', async () => {
    const res = await fetch(`${base}/public/%2e%2e/package.json`);
    expect(res.status).toBe(404);
  });

  it('静态路由外的请求继续走路由', async () => {
    const res = await fetch(`${base}/health`);
    expect(await res.text()).toBe('ok');
  });

  it('静态文件带 ETag 与 Last-Modified', async () => {
    const res = await fetch(`${base}/public/app.js`);
    expect(res.headers.get('ETag')).toMatch(/^W\/"\d+-\d+"$/);
    expect(res.headers.get('Last-Modified')).not.toBeNull();
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
  });

  it('If-None-Match 匹配时返回 304', async () => {
    const first = await fetch(`${base}/public/app.js`);
    const etag = first.headers.get('ETag') ?? '';
    const res = await fetch(`${base}/public/app.js`, {
      headers: { 'If-None-Match': etag },
    });
    expect(res.status).toBe(304);
  });

  it('Range 请求返回 206 与 Content-Range', async () => {
    const res = await fetch(`${base}/public/index.html`, {
      headers: { Range: 'bytes=0-3' },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toMatch(/^bytes 0-3\/\d+$/);
    expect(await res.text()).toBe('<h1>');
  });

  it('无效 Range 返回 416', async () => {
    const res = await fetch(`${base}/public/index.html`, {
      headers: { Range: 'bytes=9999-10000' },
    });
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toMatch(/^bytes \*\//);
  });
});
