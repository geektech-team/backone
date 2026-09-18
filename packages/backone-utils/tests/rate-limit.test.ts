import { describe, expect, it } from 'bun:test';
import {
  createRateLimiter,
  FixedWindowLimiter,
  SlidingWindowLimiter,
  TokenBucketLimiter,
} from '../lib/rate-limit';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('FixedWindowLimiter', () => {
  it('窗口内限流：第 limit+1 次被拒绝，窗口结束后恢复', async () => {
    const limiter = new FixedWindowLimiter({ limit: 3, windowMs: 100 });
    expect(limiter.consume('ip:1').allowed).toBe(true);
    expect(limiter.consume('ip:1').allowed).toBe(true);
    expect(limiter.consume('ip:1').allowed).toBe(true);
    const fourth = limiter.consume('ip:1');
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    await sleep(120);
    expect(limiter.consume('ip:1').allowed).toBe(true);
  });

  it('不同 key 相互隔离', () => {
    const limiter = new FixedWindowLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('a').allowed).toBe(false);
    expect(limiter.consume('b').allowed).toBe(true);
  });

  it('reset / clear', () => {
    const limiter = new FixedWindowLimiter({ limit: 1, windowMs: 1000 });
    limiter.consume('a');
    expect(limiter.consume('a').allowed).toBe(false);
    limiter.reset('a');
    expect(limiter.consume('a').allowed).toBe(true);
    limiter.consume('b');
    limiter.clear();
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('b').allowed).toBe(true);
  });
});

describe('SlidingWindowLimiter', () => {
  it('滑动窗口：窗口内超限被拒，过期请求被剔除后恢复', async () => {
    const limiter = new SlidingWindowLimiter({ limit: 2, windowMs: 100 });
    limiter.consume('k');
    limiter.consume('k');
    expect(limiter.consume('k').allowed).toBe(false); // 同窗口 3 个 → 拒绝
    await sleep(120); // 窗口整体过去，全部过期
    expect(limiter.consume('k').allowed).toBe(true);
    expect(limiter.consume('k').allowed).toBe(true);
    expect(limiter.consume('k').allowed).toBe(false);
  });

  it('resetAt 随最旧请求过期滚动', async () => {
    const limiter = new SlidingWindowLimiter({ limit: 5, windowMs: 200 });
    const first = limiter.consume('k');
    await sleep(220); // 最旧请求过期，resetAt 滚动到新请求
    const second = limiter.consume('k');
    expect(second.resetAt).toBeGreaterThan(first.resetAt);
  });
});

describe('TokenBucketLimiter', () => {
  it('容量内允许突发，耗尽后拒绝，随时间补充恢复', async () => {
    const limiter = new TokenBucketLimiter({
      limit: 3,
      refillPerSecond: 10,
    });
    expect(limiter.consume('k').allowed).toBe(true);
    expect(limiter.consume('k').allowed).toBe(true);
    expect(limiter.consume('k').allowed).toBe(true);
    expect(limiter.consume('k').allowed).toBe(false);
    await sleep(220); // 补充约 2 个令牌
    expect(limiter.consume('k').allowed).toBe(true);
    expect(limiter.consume('k').allowed).toBe(true);
    expect(limiter.consume('k').allowed).toBe(false);
  });

  it('remaining 反映剩余令牌', () => {
    const limiter = new TokenBucketLimiter({
      limit: 2,
      refillPerSecond: 100,
    });
    expect(limiter.consume('k').remaining).toBe(1);
    expect(limiter.consume('k').remaining).toBe(0);
    expect(limiter.consume('k').remaining).toBe(0);
  });
});

describe('createRateLimiter', () => {
  it('按策略创建对应实现，默认 fixed-window', () => {
    expect(createRateLimiter({ limit: 1, windowMs: 1000 })).toBeInstanceOf(
      FixedWindowLimiter
    );
    expect(
      createRateLimiter({
        limit: 1,
        windowMs: 1000,
        strategy: 'sliding-window',
      })
    ).toBeInstanceOf(SlidingWindowLimiter);
    expect(
      createRateLimiter({ limit: 1, windowMs: 1000, strategy: 'token-bucket' })
    ).toBeInstanceOf(TokenBucketLimiter);
  });
});
