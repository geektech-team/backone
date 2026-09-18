/**
 * 缓存公开类型。
 *
 * `TtlCache`（惰性过期、无容量限制）与 `LruCache`（容量上限 + LRU 淘汰，
 * 可选过期）实现同一 `Cache` 接口，可互换使用（依赖倒置）；通过
 * `createCache` 工厂按选项选择策略。实现为纯内存，零运行时依赖。
 */

/** 缓存条目：值 + 过期时间戳（null 表示永不过期） */
export interface CacheEntry<V> {
  value: V;
  /** 过期毫秒时间戳；null 表示永不过期 */
  expiresAt: number | null;
}

/** 缓存接口（值不允许为 undefined：undefined 视为未命中） */
export interface Cache<V = unknown> {
  /** 读取缓存；未命中或已过期返回 undefined */
  get(key: string): V | undefined;
  /**
   * 写入缓存。`ttlMs` 覆盖默认过期时间；不传时使用构造选项的 ttlMs；
   * 两者都未设置则永不过期。
   */
  set(key: string, value: V, ttlMs?: number): this;
  /** 是否存在未过期的条目 */
  has(key: string): boolean;
  /** 删除条目，返回是否删除成功 */
  delete(key: string): boolean;
  /** 清空全部条目 */
  clear(): void;
  /**
   * 命中则直接返回，未命中则执行工厂并写入（工厂可为异步，适合缓存
   * 数据库查询等耗时结果）。
   */
  getOrSet(
    key: string,
    factory: () => V | Promise<V>,
    ttlMs?: number
  ): Promise<V>;
  /** 当前条目数（可能包含尚未清理的过期条目） */
  readonly size: number;
}

/** 缓存通用选项（createCache 工厂与各实现共用） */
export interface CacheOptions {
  /** 默认过期时间（毫秒）；不设置则条目永不过期 */
  ttlMs?: number;
  /** 容量上限；设置后使用 LRU 淘汰最久未访问条目 */
  capacity?: number;
}
