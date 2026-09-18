/**
 * 响应序列化：将处理器返回值转为标准 Response。
 * 供 server 请求管线与压缩等中间件共享，避免重复实现。
 */

import type { Context } from './context';

/**
 * 将处理器返回值序列化为 Response。
 * - Response：直接透传（零开销）
 * - undefined / null：204（或 ctx.status）
 * - string / number / boolean：text
 * - object：json
 */
export function serializeResponse(ctx: Context, value: unknown): Response {
  if (value instanceof Response) {
    return value;
  }
  if (value === undefined || value === null) {
    const status = ctx.status === 200 ? 204 : ctx.status;
    return new Response(null, { status, headers: ctx.headers });
  }
  if (typeof value === 'string') {
    return ctx.text(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return ctx.text(String(value));
  }
  if (typeof value === 'object') {
    return ctx.json(value);
  }
  return ctx.text(String(value), 500);
}
