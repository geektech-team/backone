/** 请求日志中间件：输出 [YYYY-MM-DD HH:mm:ss] method path status 耗时 */

import type { Handler } from '../types';

export interface LoggerOptions {
  /** 自定义输出函数，默认 console.log */
  out?: (line: string) => void;
  /** 是否在行首输出请求时间（YYYY-MM-DD HH:mm:ss），默认 true */
  timestamp?: boolean;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** 本地日期时间，格式 YYYY-MM-DD HH:mm:ss */
function formatDateTime(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(
    now.getSeconds()
  )}`;
  return `${year}-${month}-${day} ${time}`;
}

export function logger(options: LoggerOptions = {}): Handler {
  const out = options.out ?? ((line: string) => console.log(line));
  const withTimestamp = options.timestamp ?? true;

  return async (ctx, next) => {
    const start = performance.now();
    const result = await next();
    const status = result instanceof Response ? result.status : ctx.status;
    const elapsed = (performance.now() - start).toFixed(2);
    const prefix = withTimestamp ? `[${formatDateTime()}] ` : '';
    out(`${prefix}${ctx.method} ${ctx.pathname} ${status} ${elapsed}ms`);
    return result;
  };
}
