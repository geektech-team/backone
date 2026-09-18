/**
 * 安全响应头中间件（helmet 风格）：设置常见安全头。
 * 默认启用 X-Content-Type-Options、X-Frame-Options、Referrer-Policy 等；
 * 每项可通过选项覆盖或设为 false 禁用。
 */

import { serializeResponse } from '../response';
import type { Middleware } from '../types';

export interface HelmetOptions {
  contentSecurityPolicy?: string | false;
  crossOriginEmbedderPolicy?: string | false;
  crossOriginOpenerPolicy?: string | false;
  crossOriginResourcePolicy?: string | false;
  referrerPolicy?: string | false;
  strictTransportSecurity?: string | false;
  xContentTypeOptions?: string | false;
  xDnsPrefetchControl?: string | false;
  xDownloadOptions?: string | false;
  xFrameOptions?: string | false;
  xPermittedCrossDomainPolicies?: string | false;
  xXssProtection?: string | false;
}

const DEFAULT_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-DNS-Prefetch-Control': 'off',
  'X-Download-Options': 'noopen',
  'X-Frame-Options': 'DENY',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'X-XSS-Protection': '0',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export function helmet(options: HelmetOptions = {}): Middleware {
  const headers = new Map<string, string>(Object.entries(DEFAULT_HEADERS));

  const optionMap: Record<string, string | false | undefined> = {
    'Content-Security-Policy': options.contentSecurityPolicy,
    'Cross-Origin-Embedder-Policy': options.crossOriginEmbedderPolicy,
    'Cross-Origin-Opener-Policy': options.crossOriginOpenerPolicy,
    'Cross-Origin-Resource-Policy': options.crossOriginResourcePolicy,
    'Referrer-Policy': options.referrerPolicy,
    'Strict-Transport-Security': options.strictTransportSecurity,
    'X-Content-Type-Options': options.xContentTypeOptions,
    'X-DNS-Prefetch-Control': options.xDnsPrefetchControl,
    'X-Download-Options': options.xDownloadOptions,
    'X-Frame-Options': options.xFrameOptions,
    'X-Permitted-Cross-Domain-Policies': options.xPermittedCrossDomainPolicies,
    'X-XSS-Protection': options.xXssProtection,
  };

  for (const [name, value] of Object.entries(optionMap)) {
    if (value === false) {
      headers.delete(name);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  return async (ctx, next) => {
    const result = await next();
    const response = serializeResponse(ctx, result);
    for (const [name, value] of headers) {
      // 不覆盖处理器显式设置的头
      if (!response.headers.has(name)) {
        response.headers.set(name, value);
      }
    }
    return response;
  };
}
