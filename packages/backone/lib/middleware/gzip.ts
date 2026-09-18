/**
 * gzip 响应压缩中间件：基于 Bun.gzipSync，零依赖。
 * 仅对文本类响应、未编码、大于阈值的响应压缩。
 */

import type { Handler } from '../types';
import { serializeResponse } from '../response';

export interface GzipOptions {
  /** 最小压缩字节数，低于此值不压缩，默认 1024 */
  threshold?: number;
  /** 压缩级别 1-9，默认 6 */
  level?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  /** 可压缩的 Content-Type 前缀列表，默认文本类与 JSON/JS/XML/SVG */
  types?: string[];
}

const DEFAULT_TYPES = [
  'text/',
  'application/json',
  'application/javascript',
  'application/xml',
  'image/svg+xml',
];

/** 不应压缩的内容类型（流式实时响应等） */
const SKIP_TYPES = ['text/event-stream'];

export function gzip(options: GzipOptions = {}): Handler {
  const threshold = options.threshold ?? 1024;
  const level = options.level ?? 6;
  const types = options.types ?? DEFAULT_TYPES;

  return async (ctx, next) => {
    const result = await next();
    // 先序列化为 Response（处理器可能返回 string/object 等）
    const response = serializeResponse(ctx, result);

    // 客户端不支持 gzip
    const acceptEncoding = ctx.request.headers.get('accept-encoding') ?? '';
    if (!acceptEncoding.includes('gzip')) {
      return response;
    }

    // 已编码
    if (response.headers.get('content-encoding')) {
      return response;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (SKIP_TYPES.some((t) => contentType.includes(t))) {
      return response;
    }
    if (!types.some((t) => contentType.startsWith(t))) {
      return response;
    }

    // Content-Length 已知且低于阈值，直接返回（不消费 body）
    const contentLength = response.headers.get('content-length');
    if (contentLength !== null && Number(contentLength) < threshold) {
      return response;
    }

    const body = await response.arrayBuffer();
    if (body.byteLength < threshold) {
      // body 已消费，重新构造未压缩的 Response
      const headers = new Headers(response.headers);
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    const compressed = Bun.gzipSync(new Uint8Array(body), { level });
    const headers = new Headers(response.headers);
    headers.set('content-encoding', 'gzip');
    headers.set('content-length', String(compressed.length));
    headers.append('vary', 'Accept-Encoding');

    return new Response(compressed, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
