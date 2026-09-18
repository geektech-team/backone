/**
 * 缓存实现：TtlCache（惰性过期）与 LruCache（容量 + LRU 淘汰 + 可选过期）。
 *
 * 两实现共享 BaseCache 的条目存储、过期判定与 getOrSet（模板方法模式），
 * 各自只定制读取顺序（LRU 命中刷新）与淘汰策略，满足开闭原则。
 */

import type { Cache, CacheEntry, CacheOptions } from './types';

/** 共享基类：条目存储、过期判定、写入与查询组合逻辑 */
abstract class BaseCache<V> implements Cache<V> {
  protected readonly defaultTtl: number | undefined;
  protected readonly entries = new Map<string, CacheEntry<V>>();

  constructor(options: { ttlMs?: number } = {}) {
    this.defaultTtl = options.ttlMs;
  }

  get size(): number {
    return this.entries.size;
  }

  abstract get(key: string): V | undefined;

  set(key: string, value: V, ttlMs?: number): this {
    const ttl = ttlMs ?? this.defaultTtl;
    this.entries.set(key, {
      value,
      expiresAt: ttl === undefined ? null : Date.now() + ttl,
    });
    this.maybeEvict();
    return this;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  async getOrSet(
    key: string,
    factory: () => V | Promise<V>,
    ttlMs?: number
  ): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  /** 写入后淘汰策略（TtlCache 无容量限制，默认不淘汰） */
  protected maybeEvict(): void {}

  protected isExpired(entry: CacheEntry<V>, now: number = Date.now()): boolean {
    return entry.expiresAt !== null && entry.expiresAt <= now;
  }
}

/** 惰性过期缓存：无容量限制，读时检查过期 */
export class TtlCache<V> extends BaseCache<V> {
  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (this.isExpired(entry)) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }
}

/** 容量受限缓存：超出容量淘汰最久未访问条目，支持可选过期 */
export class LruCache<V> extends BaseCache<V> {
  readonly #capacity: number;

  constructor(options: { capacity: number; ttlMs?: number }) {
    super(options);
    if (!Number.isInteger(options.capacity) || options.capacity <= 0) {
      throw new Error('LruCache: capacity must be a positive integer');
    }
    this.#capacity = options.capacity;
  }

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (this.isExpired(entry)) {
      this.entries.delete(key);
      return undefined;
    }
    // 刷新访问顺序：删除后重新插入到末尾（Map 按插入序迭代，尾部最新）
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V, ttlMs?: number): this {
    // 覆盖已有 key 视为一次访问：先删除再插入，刷新到末尾
    this.entries.delete(key);
    return super.set(key, value, ttlMs);
  }

  protected maybeEvict(): void {
    while (this.entries.size > this.#capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.entries.delete(oldest);
    }
  }
}

/**
 * 按选项创建缓存：设置了 `capacity` 使用 LruCache，否则 TtlCache。
 *
 * ```ts
 * const cache = createCache<string>({ ttlMs: 60_000, capacity: 1000 });
 * await cache.getOrSet('city:rank', () => fetchRank('city'), 30_000);
 * ```
 */
export function createCache<V = unknown>(options: CacheOptions = {}): Cache<V> {
  return options.capacity !== undefined && options.capacity > 0
    ? new LruCache<V>({
        capacity: options.capacity,
        ttlMs: options.ttlMs,
      })
    : new TtlCache<V>({ ttlMs: options.ttlMs });
}
