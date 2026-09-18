import { describe, expect, it } from 'bun:test';
import { LruCache, TtlCache, createCache } from '../lib/cache';
import type { Cache } from '../lib/cache';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('TtlCache', () => {
  it('无 TTL 时条目不过期', () => {
    const cache = new TtlCache<string>();
    cache.set('a', '1');
    expect(cache.get('a')).toBe('1');
    expect(cache.has('a')).toBe(true);
    expect(cache.size).toBe(1);
  });

  it('按 ttlMs 过期（每次 set 单独指定）', async () => {
    const cache = new TtlCache<string>();
    cache.set('a', '1', 20);
    expect(cache.get('a')).toBe('1');
    await sleep(30);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.has('a')).toBe(false);
    // 过期条目读取后被清理
    expect(cache.size).toBe(0);
  });

  it('构造选项默认 ttl，set 可覆盖', async () => {
    const cache = new TtlCache<string>({ ttlMs: 20 });
    cache.set('a', 'default');
    cache.set('b', 'longer', 1000); // 单次覆盖默认 ttl
    expect(cache.get('a')).toBe('default');
    await sleep(30);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('longer');
  });

  it('getOrSet：命中返回缓存，未命中执行工厂并写入（含异步）', async () => {
    const cache = new TtlCache<number>();
    let calls = 0;
    const factory = () => {
      calls += 1;
      return Promise.resolve(42);
    };
    expect(await cache.getOrSet('k', factory)).toBe(42);
    expect(await cache.getOrSet('k', factory)).toBe(42);
    expect(calls).toBe(1);
  });

  it('getOrSet：过期后重新执行工厂', async () => {
    const cache = new TtlCache<number>();
    let calls = 0;
    const factory = () => {
      calls += 1;
      return calls;
    };
    expect(await cache.getOrSet('k', factory, 20)).toBe(1);
    await sleep(30);
    expect(await cache.getOrSet('k', factory, 20)).toBe(2);
    expect(calls).toBe(2);
  });

  it('delete / clear / has', () => {
    const cache = new TtlCache<string>();
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.delete('a')).toBe(true);
    expect(cache.delete('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('LruCache', () => {
  it('超出容量淘汰最久未访问条目', () => {
    const cache = new LruCache<string>({ capacity: 2 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3'); // 淘汰 a
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
    expect(cache.size).toBe(2);
  });

  it('读取刷新访问顺序（最近访问不被淘汰）', () => {
    const cache = new LruCache<string>({ capacity: 2 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.get('a'); // 刷新 a
    cache.set('c', '3'); // 淘汰 b
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('1');
    expect(cache.get('c')).toBe('3');
  });

  it('支持默认 ttl 与每次 set 覆盖', async () => {
    const cache = new LruCache<string>({ capacity: 10, ttlMs: 20 });
    cache.set('a', '1');
    cache.set('b', '2', 100);
    await sleep(30);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
  });

  it('容量非法时构造抛错', () => {
    expect(() => new LruCache({ capacity: 0 })).toThrow();
    expect(() => new LruCache({ capacity: -1 })).toThrow();
    expect(() => new LruCache({ capacity: 1.5 })).toThrow();
  });

  it('覆盖已有 key 不改变淘汰顺序语义', () => {
    const cache = new LruCache<string>({ capacity: 2 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('a', '1b'); // 覆盖 a
    cache.set('c', '3'); // 淘汰 b（a 被刷新到尾部）
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('1b');
  });
});

describe('createCache', () => {
  it('按 capacity 选择 LruCache / TtlCache', () => {
    const bounded = createCache<string>({ capacity: 10 });
    const unbounded = createCache<string>({ ttlMs: 100 });
    expect(bounded).toBeInstanceOf(LruCache);
    expect(unbounded).toBeInstanceOf(TtlCache);
  });

  it('与接口互换使用（依赖倒置）', async () => {
    const cache: Cache<number> = createCache<number>({ capacity: 1 });
    cache.set('x', 1);
    cache.set('y', 2); // 淘汰 x
    expect(cache.get('x')).toBeUndefined();
    expect(await cache.getOrSet('x', () => 99)).toBe(99); // 淘汰 y
    expect(cache.get('y')).toBeUndefined();
    expect(cache.get('x')).toBe(99);
    expect(cache.size).toBe(1);
  });
});
