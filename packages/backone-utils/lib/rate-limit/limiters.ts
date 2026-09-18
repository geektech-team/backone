/**
 * 限流实现：固定窗口 / 滑动窗口 / 令牌桶。
 *
 * 共享 BaseRateLimiter 的按 key 状态存储（模板方法模式），各策略只实现
 * consume 的计数 / 过期逻辑；新增策略只需扩展新类，满足开闭原则。
 */

import type { RateLimitOptions, RateLimitResult, RateLimiter } from './types';

/** 共享基类：按 key 的状态存储与重置 */
abstract class BaseRateLimiter implements RateLimiter {
  protected readonly state = new Map<string, unknown>();

  abstract consume(key: string): RateLimitResult;

  reset(key: string): void {
    this.state.delete(key);
  }

  clear(): void {
    this.state.clear();
  }
}

interface WindowBucket {
  count: number;
  start: number;
}

/** 固定窗口限流：窗口内计数，窗口结束整体重置 */
export class FixedWindowLimiter extends BaseRateLimiter {
  readonly #limit: number;
  readonly #windowMs: number;

  constructor(options: { limit: number; windowMs: number }) {
    super();
    this.#limit = options.limit;
    this.#windowMs = options.windowMs;
  }

  consume(key: string): RateLimitResult {
    const now = Date.now();
    let bucket = this.state.get(key) as WindowBucket | undefined;

    if (bucket === undefined || now - bucket.start >= this.#windowMs) {
      bucket = { count: 0, start: now };
      this.state.set(key, bucket);
    }

    bucket.count += 1;

    return {
      allowed: bucket.count <= this.#limit,
      remaining: Math.max(0, this.#limit - bucket.count),
      resetAt: bucket.start + this.#windowMs,
    };
  }
}

/** 滑动窗口限流：维护窗口内的请求时间戳，持续剔除过期请求 */
export class SlidingWindowLimiter extends BaseRateLimiter {
  readonly #limit: number;
  readonly #windowMs: number;

  constructor(options: { limit: number; windowMs: number }) {
    super();
    this.#limit = options.limit;
    this.#windowMs = options.windowMs;
  }

  consume(key: string): RateLimitResult {
    const now = Date.now();
    const timestamps = (this.state.get(key) as number[] | undefined) ?? [];

    while (timestamps.length > 0 && timestamps[0] <= now - this.#windowMs) {
      timestamps.shift();
    }
    timestamps.push(now);
    this.state.set(key, timestamps);

    return {
      allowed: timestamps.length <= this.#limit,
      remaining: Math.max(0, this.#limit - timestamps.length),
      resetAt:
        timestamps.length > 0
          ? timestamps[0] + this.#windowMs
          : now + this.#windowMs,
    };
  }
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/** 令牌桶限流：按速率持续补充令牌，支持突发与平滑 */
export class TokenBucketLimiter extends BaseRateLimiter {
  readonly #capacity: number;
  readonly #refillPerSecond: number;

  constructor(options: { limit: number; refillPerSecond: number }) {
    super();
    this.#capacity = options.limit;
    this.#refillPerSecond = options.refillPerSecond;
  }

  consume(key: string): RateLimitResult {
    const now = Date.now();
    let bucket = this.state.get(key) as TokenBucket | undefined;

    if (bucket === undefined) {
      bucket = { tokens: this.#capacity, lastRefill: now };
    }

    const elapsedSeconds = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(
      this.#capacity,
      bucket.tokens + elapsedSeconds * this.#refillPerSecond
    );
    bucket.lastRefill = now;

    const allowed = bucket.tokens >= 1;
    if (allowed) {
      bucket.tokens -= 1;
    }
    this.state.set(key, bucket);

    const resetAt =
      bucket.lastRefill +
      ((this.#capacity - bucket.tokens) / this.#refillPerSecond) * 1000;

    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      resetAt,
    };
  }
}

/** 按策略创建限流器（默认 fixed-window） */
export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const strategy = options.strategy ?? 'fixed-window';

  switch (strategy) {
    case 'fixed-window':
      return new FixedWindowLimiter(options);
    case 'sliding-window':
      return new SlidingWindowLimiter(options);
    case 'token-bucket':
      return new TokenBucketLimiter({
        limit: options.limit,
        refillPerSecond:
          options.refillPerSecond ?? (options.limit / options.windowMs) * 1000,
      });
    default:
      return new FixedWindowLimiter(options);
  }
}
