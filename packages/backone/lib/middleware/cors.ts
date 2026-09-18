/** 跨域（CORS）中间件：注入允许来源并处理 OPTIONS 预检 */

import type { Handler } from '../types';

export interface CorsOptions {
  /** 允许的来源，默认 '*'；函数形式按请求 Origin 动态决定 */
  origin?:
    string | string[] | ((origin: string | null) => string | null | undefined);
  /** 允许的方法，默认常见 REST 方法集合 */
  methods?: string[];
  /** 允许的请求头 */
  allowedHeaders?: string[];
  /** 暴露给浏览器的响应头 */
  exposeHeaders?: string[];
  /** 允许携带凭证 */
  credentials?: boolean;
  /** 预检结果缓存秒数 */
  maxAge?: number;
}

const DEFAULT_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
];

export function cors(options: CorsOptions = {}): Handler {
  const methods = options.methods ?? DEFAULT_METHODS;
  const allowedHeaders = options.allowedHeaders;
  const exposeHeaders = options.exposeHeaders;
  const credentials = options.credentials ?? false;
  const maxAge = options.maxAge;

  return (ctx, next) => {
    const requestOrigin = ctx.request.headers.get('Origin');
    let origin = options.origin ?? '*';
    if (typeof origin === 'function') {
      origin = origin(requestOrigin) ?? '*';
    }
    const candidates = Array.isArray(origin) ? origin : [origin];
    const selected = candidates.find(
      (candidate) => candidate === '*' || candidate === requestOrigin
    );

    if (selected !== undefined) {
      ctx.headers.set('Access-Control-Allow-Origin', selected);
      if (credentials) {
        ctx.headers.set('Access-Control-Allow-Credentials', 'true');
      }
      if (exposeHeaders !== undefined && exposeHeaders.length > 0) {
        ctx.headers.set(
          'Access-Control-Expose-Headers',
          exposeHeaders.join(', ')
        );
      }
    }

    if (ctx.method === 'OPTIONS') {
      ctx.headers.set('Access-Control-Allow-Methods', methods.join(', '));
      if (allowedHeaders !== undefined && allowedHeaders.length > 0) {
        ctx.headers.set(
          'Access-Control-Allow-Headers',
          allowedHeaders.join(', ')
        );
      }
      if (maxAge !== undefined) {
        ctx.headers.set('Access-Control-Max-Age', String(maxAge));
      }
      return new Response(null, { status: 204, headers: ctx.headers });
    }

    return next();
  };
}
