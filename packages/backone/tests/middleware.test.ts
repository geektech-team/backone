import { describe, expect, it } from 'bun:test';
import { Context } from '../lib/context';
import { compose } from '../lib/middleware/compose';
import { cors } from '../lib/middleware/cors';
import { logger } from '../lib/middleware/logger';

function makeRequest(path = '/', init: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, init);
}

describe('compose', () => {
  it('按洋葱模型顺序进出', async () => {
    const order: string[] = [];
    const handlers = [
      async (_ctx: Context, next: () => unknown) => {
        order.push('a-in');
        const result = await next();
        order.push('a-out');
        return result;
      },
      async (_ctx: Context, next: () => unknown) => {
        order.push('b-in');
        const result = await next();
        order.push('b-out');
        return result;
      },
      () => {
        order.push('handler');
        return new Response('done');
      },
    ];
    const result = (await compose(handlers)(
      new Context(makeRequest('/')),
      () => undefined
    )) as Response;
    expect(order).toEqual(['a-in', 'b-in', 'handler', 'b-out', 'a-out']);
    expect(result).toBeInstanceOf(Response);
  });

  it('重复调用 next() 抛错', () => {
    const handler = (_ctx: Context, next: () => unknown) => {
      next();
      return next();
    };
    expect(() =>
      compose([handler])(new Context(makeRequest('/')), () => undefined)
    ).toThrow('next() called multiple times');
  });

  it('链路末尾无 next 时安全返回', async () => {
    const result = await compose([])(
      new Context(makeRequest('/')),
      () => undefined
    );
    expect(result).toBeUndefined();
  });
});

describe('logger', () => {
  it('行首输出时间 method path status 耗时', async () => {
    const lines: string[] = [];
    const handler = logger({ out: (line) => lines.push(line) });
    await handler(
      new Context(makeRequest('/hello')),
      async () => new Response('ok')
    );
    expect(lines[0]).toMatch(
      /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] GET \/hello 200 \d+(\.\d+)?ms$/
    );
  });

  it('timestamp:false 时省略时间前缀', async () => {
    const lines: string[] = [];
    const handler = logger({
      out: (line) => lines.push(line),
      timestamp: false,
    });
    await handler(
      new Context(makeRequest('/hello')),
      async () => new Response('ok')
    );
    expect(lines[0]).toMatch(/^GET \/hello 200 \d+(\.\d+)?ms$/);
  });
});

describe('cors', () => {
  it('非 OPTIONS 请求注入允许来源', async () => {
    const handler = cors({ origin: '*' });
    const ctx = new Context(
      makeRequest('/', { headers: { Origin: 'http://a.com' } })
    );
    const result = (await handler(
      ctx,
      async () => new Response('ok')
    )) as Response;
    expect(ctx.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(result.status).toBe(200);
  });

  it('OPTIONS 预检返回 204 与允许方法', async () => {
    const handler = cors({ origin: '*' });
    const ctx = new Context(makeRequest('/', { method: 'OPTIONS' }));
    const result = (await handler(
      ctx,
      async () => new Response('ok')
    )) as Response;
    expect(result.status).toBe(204);
    expect(result.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });
});
