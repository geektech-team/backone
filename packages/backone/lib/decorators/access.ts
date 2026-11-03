import type { Context } from '../context';
import { HttpError } from '../errors';
import { policyDecorator } from './metadata';

type MaybePromise<T> = T | Promise<T>;

/** 注入身份认证及可选授权策略，不绑定认证提供方。 */
export interface AuthorizeOptions<P extends object> {
  authenticate(ctx: Context): MaybePromise<P | null | undefined>;
  authorize?(principal: P, ctx: Context): MaybePromise<boolean>;
}

/** 认证主体也保存在 state 中，供 WebSocket 升级后继续使用。 */
export function getPrincipal<P extends object>(ctx: Context): P {
  const principal = ctx.state.principal;
  if (principal === null || typeof principal !== 'object') {
    throw new HttpError(401);
  }
  return principal as P;
}

export function Authorize<P extends object>(options: AuthorizeOptions<P>) {
  if (typeof options?.authenticate !== 'function') {
    throw new Error('@Authorize requires an authenticate function');
  }
  if (
    options.authorize !== undefined &&
    typeof options.authorize !== 'function'
  ) {
    throw new Error('@Authorize authorize must be a function');
  }
  return policyDecorator({
    phase: 'authorize',
    handler: async (ctx, next) => {
      let principal: P | null | undefined;
      try {
        principal = await options.authenticate(ctx);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(401);
      }
      if (principal === null || typeof principal !== 'object') {
        throw new HttpError(401);
      }
      ctx.state.principal = principal;
      if (options.authorize !== undefined) {
        let allowed: boolean;
        try {
          allowed = await options.authorize(principal, ctx);
        } catch (error) {
          if (error instanceof HttpError) throw error;
          throw new HttpError(403);
        }
        if (!allowed) throw new HttpError(403);
      }
      return next();
    },
  });
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  /** 下次可用时刻的毫秒时间戳。 */
  readonly resetAt: number;
}

/** 可直接接收 backone-utils 的限流器或异步外部存储适配器。 */
export interface RateLimitBackend {
  consume(key: string): MaybePromise<RateLimitResult>;
}

export interface RateLimitOptions {
  key(ctx: Context): MaybePromise<string>;
}

export function RateLimit(
  limiter: RateLimitBackend,
  options: RateLimitOptions
) {
  if (typeof limiter?.consume !== 'function') {
    throw new Error('@RateLimit requires a limiter with consume(key)');
  }
  if (typeof options?.key !== 'function') {
    throw new Error('@RateLimit requires an explicit key function');
  }
  return policyDecorator({
    phase: 'rateLimit',
    handler: async (ctx, next) => {
      const result = await limiter.consume(await options.key(ctx));
      if (!result.allowed) {
        const retryAfter = Math.max(
          0,
          Math.ceil((result.resetAt - Date.now()) / 1_000)
        );
        ctx.set('Retry-After', String(retryAfter));
        return ctx.json({ error: 'Too Many Requests', status: 429 }, 429);
      }
      return next();
    },
  });
}
