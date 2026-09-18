import { describe, expect, it } from 'bun:test';
import { Router } from '../lib/router/router';

describe('router', () => {
  it('匹配静态路径', () => {
    const router = new Router();
    router.get('/users', () => new Response('ok'));
    expect(router.match('GET', '/users')?.handlers).toHaveLength(1);
  });

  it('解析 :param 路径参数', () => {
    const router = new Router();
    router.get('/users/:id', () => new Response('ok'));
    const match = router.match('GET', '/users/42');
    expect(match?.params).toEqual({ id: '42' });
  });

  it('* 通配匹配剩余路径', () => {
    const router = new Router();
    router.get('/files/*', () => new Response('ok'));
    const match = router.match('GET', '/files/a/b/c.txt');
    expect(match?.params).toEqual({ wildcard: 'a/b/c.txt' });
  });

  it('静态段优先于参数段', () => {
    const router = new Router();
    router.get('/users/new', () => new Response('new'));
    router.get('/users/:id', () => new Response('id'));
    const match = router.match('GET', '/users/new');
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({});
  });

  it('未命中返回 null', () => {
    const router = new Router();
    router.get('/users', () => new Response('ok'));
    expect(router.match('GET', '/nope')).toBeNull();
  });

  it('方法不匹配时返回空处理器与允许方法', () => {
    const router = new Router();
    router.get('/users', () => new Response('ok'));
    const match = router.match('POST', '/users');
    expect(match?.handlers).toHaveLength(0);
    expect(match?.allowed).toContain('GET');
  });

  it('HEAD 回退到 GET 处理器', () => {
    const router = new Router();
    router.get('/users', () => new Response('ok'));
    expect(router.match('HEAD', '/users')?.handlers).toHaveLength(1);
  });

  it('all() 匹配任意方法', () => {
    const router = new Router();
    router.all('/ping', () => new Response('pong'));
    expect(router.match('POST', '/ping')?.handlers).toHaveLength(1);
    expect(router.match('DELETE', '/ping')?.handlers).toHaveLength(1);
  });

  it('同一路由注册多个处理器', () => {
    const router = new Router();
    router.get(
      '/x',
      (_ctx, next) => next(),
      () => new Response('done')
    );
    expect(router.match('GET', '/x')?.handlers).toHaveLength(2);
  });

  it('空处理器注册抛错', () => {
    const router = new Router();
    expect(() => router.get('/x')).toThrow('at least one handler');
  });
});
