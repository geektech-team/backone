/**
 * 请求超时中间件：超过指定时间未完成则返回 504。
 * 基于 Promise.race，超时后后台执行仍会继续但响应已返回。
 */

import { HttpError } from '../errors';
import type { Middleware } from '../types';

export interface TimeoutOptions {
  /** 超时毫秒数，默认 5000 */
  ms?: number;
  /** 超时响应状态码，默认 504 */
  status?: number;
  /** 超时响应消息，默认 "Gateway Timeout" */
  message?: string;
}

export function timeout(options: TimeoutOptions | number = {}): Middleware {
  const ms = typeof options === 'number' ? options : (options.ms ?? 5000);
  const status = typeof options === 'number' ? 504 : (options.status ?? 504);
  const message =
    typeof options === 'number'
      ? 'Gateway Timeout'
      : (options.message ?? 'Gateway Timeout');

  return async (_ctx, next) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new HttpError(status, message)), ms);
    });

    try {
      return await Promise.race([next(), timeoutPromise]);
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  };
}
