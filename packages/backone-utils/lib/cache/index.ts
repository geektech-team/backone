/** 缓存工具统一出口 */

export type { Cache, CacheEntry, CacheOptions } from './types';
export { createCache, LruCache, TtlCache } from './memory';
