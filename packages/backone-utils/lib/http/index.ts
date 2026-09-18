/** HTTP 客户端统一出口 */

import type { HttpClientOptions } from './types';
import { HttpClient } from './client';

export type {
  HttpClientOptions,
  HttpRequestOptions,
  HttpResponse,
  RetryOptions,
} from './types';
export { HttpError, type HttpErrorCode } from './errors';
export { HttpClient } from './client';

/**
 * 创建 HTTP 客户端。
 *
 * ```ts
 * const api = createHttpClient({
 *   baseUrl: 'https://api.example.com',
 *   timeoutMs: 5_000,
 *   retry: { maxRetries: 3, baseDelayMs: 100 },
 * });
 * const { data } = await api.get<{ total: number }>('/stats', { query: { year: 2026 } });
 * ```
 */
export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  return new HttpClient(options);
}
