import { describe, expect, it } from 'bun:test';
import { Context } from '../lib/context';

function makeRequest(path = '/', init: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, init);
}

describe('context', () => {
  it('解析 pathname 与 query', () => {
    const ctx = new Context(makeRequest('/users?page=2&size=10'));
    expect(ctx.pathname).toBe('/users');
    expect(ctx.query.get('page')).toBe('2');
    expect(ctx.query.get('size')).toBe('10');
  });

  it('惰性解析并缓存 JSON 请求体', async () => {
    const ctx = new Context(
      makeRequest('/', { method: 'POST', body: JSON.stringify({ a: 1 }) })
    );
    const body = await ctx.bodyJson<{ a: number }>();
    expect(body.a).toBe(1);
    expect(await ctx.bodyJson<{ a: number }>()).toEqual({ a: 1 });
  });

  it('惰性解析文本请求体', async () => {
    const ctx = new Context(makeRequest('/', { method: 'POST', body: 'raw' }));
    expect(await ctx.bodyText()).toBe('raw');
  });

  it('json 响应携带状态码与响应头', () => {
    const ctx = new Context(makeRequest('/'));
    ctx.status = 201;
    ctx.set('X-Custom', 'yes');
    const res = ctx.json({ ok: true });
    expect(res.status).toBe(201);
    expect(res.headers.get('X-Custom')).toBe('yes');
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('text/html/noContent/redirect 响应构建', () => {
    const ctx = new Context(makeRequest('/'));
    expect(ctx.text('hi').headers.get('Content-Type')).toContain('text/plain');
    expect(ctx.html('<p>hi</p>').headers.get('Content-Type')).toContain(
      'text/html'
    );
    expect(ctx.noContent().status).toBe(204);
    const redir = ctx.redirect('/login');
    expect(redir.status).toBe(302);
    expect(redir.headers.get('Location')).toBe('/login');
  });

  it('读写 cookie', () => {
    const ctx = new Context(
      makeRequest('/', { headers: { Cookie: 'theme=dark; token=abc%20123' } })
    );
    expect(ctx.cookie('theme')).toBe('dark');
    expect(ctx.cookie('token')).toBe('abc 123');
    ctx.setCookie('sid', 'xyz', { httpOnly: true, path: '/' });
    const setCookie = ctx.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toContain('sid=xyz');
    expect(setCookie).toContain('HttpOnly');
  });

  it('路径参数由 setParams 写入', () => {
    const ctx = new Context(makeRequest('/'));
    ctx.setParams({ id: '42' });
    expect(ctx.params.id).toBe('42');
  });

  it('state 提供中间件与处理器之间的共享数据', () => {
    const ctx = new Context(makeRequest('/'));
    ctx.state.userId = 7;
    expect(ctx.state.userId).toBe(7);
  });

  it('惰性解析表单请求体', async () => {
    const form = new FormData();
    form.set('name', 'max');
    form.set('role', 'admin');
    const ctx = new Context(makeRequest('/', { method: 'POST', body: form }));
    const parsed = await ctx.bodyForm();
    expect(parsed.get('name')).toBe('max');
    expect(parsed.get('role')).toBe('admin');
    expect(await ctx.bodyForm()).toBe(parsed);
  });

  it('bodyJson 解析失败抛出 HttpError(400)', async () => {
    const ctx = new Context(
      makeRequest('/', { method: 'POST', body: 'not-json' })
    );
    await expect(ctx.bodyJson()).rejects.toMatchObject({ status: 400 });
  });
});
