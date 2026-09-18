/**
 * 限流公开类型。
 *
 * 三种策略（固定窗口 / 滑动窗口 / 令牌桶）实现同一 `RateLimiter` 接口，
 * 可互换使用；通过 `createRateLimiter` 工厂按策略创建。纯内存实现，
 * 零运行时依赖，适合单进程内的接口限流 / 防刷。
 */

/** 单次消费结果 */
export interface RateLimitResult {
  /** 本次消费是否被允许 */
  allowed: boolean;
  /** 剩余配额（本次消费后） */
  remaining: number;
  /** 配额重置 / 下一个可用时刻（毫秒时间戳） */
  resetAt: number;
}

/** 限流器接口（按 key 隔离，如 IP、用户 ID） */
export interface RateLimiter {
  /** 消费一次配额，返回结果 */
  consume(key: string): RateLimitResult;
  /** 重置指定 key 的状态 */
  reset(key: string): void;
  /** 清空全部状态 */
  clear(): void;
}

/** 限流策略 */
export type RateLimitStrategy =
  'fixed-window' | 'sliding-window' | 'token-bucket';

/** 限流器选项 */
export interface RateLimitOptions {
  /** 窗口内允许的最大请求数 / 令牌桶容量 */
  limit: number;
  /** 窗口时长（毫秒）；令牌桶下作为补充周期基准 */
  windowMs: number;
  /** 策略，默认 fixed-window */
  strategy?: RateLimitStrategy;
  /** 令牌桶每秒补充的令牌数（默认按 limit 在 windowMs 内补满计算） */
  refillPerSecond?: number;
}
