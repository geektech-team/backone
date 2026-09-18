/**
 * HTTP 客户端：fetch 的轻量封装。
 *
 * 能力：baseUrl 拼接与查询参数、默认/请求级请求头合并、JSON 自动
 * 序列化与解析、超时（AbortSignal.timeout + 外部 signal 合并）、
 * 指数退避重试（可重试状态码 / 网络错误 / 超时）、非 2xx 抛 HttpError。
 */

import { HttpError } from './errors';
import type {
  HttpClientOptions,
  HttpRequestOptions,
  HttpResponse,
  RetryOptions,
} from './types';

/** 默认可重试状态码（幂等语义下常见的瞬时失败） */
const DEFAULT_RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

/** 默认客户端配置 */
const DEFAULT_OPTIONS: Required<Pick<HttpClientOptions, 'timeoutMs'>> & {
  retry: Required<RetryOptions>;
} = {
  timeoutMs: 10_000,
  retry: {
    maxRetries: 2,
    baseDelayMs: 200,
    retryableStatuses: DEFAULT_RETRYABLE_STATUSES,
    retryOnNetworkError: true,
  },
};

function mergeRetry(
  defaults: Required<RetryOptions>,
  override?: RetryOptions | false
): Required<RetryOptions> | null {
  if (override === false) {
    return null;
  }
  return {
    ...defaults,
    ...override,
  };
}

/** HTTP 客户端（复用同一实例即可，内部无可变请求状态） */
export class HttpClient {
  readonly #baseUrl: string;
  readonly #headers: Record<string, string>;
  readonly #timeoutMs: number;
  readonly #retry: Required<RetryOptions>;

  constructor(options: HttpClientOptions = {}) {
    this.#baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
    this.#headers = options.headers ?? {};
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs;
    this.#retry = mergeRetry(DEFAULT_OPTIONS.retry, options.retry)!;
  }

  /** 发起请求：重试耗尽或不可重试时抛 HttpError；成功返回解析后的响应 */
  async request<T = unknown>(
    method: string,
    path: string,
    options: HttpRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    const retry = mergeRetry(this.#retry, options.retry);
    const timeoutMs = options.timeoutMs ?? this.#timeoutMs;

    for (let attempt = 0; ; attempt++) {
      const url = this.#buildUrl(path, options.query);
      let response: Response;

      try {
        response = await this.#fetchOnce(method, url, options, timeoutMs);
      } catch (error) {
        const err =
          error instanceof HttpError
            ? error
            : new HttpError('network error', 'HTTP_NETWORK');
        if (retry === null) {
          throw err;
        }
        const canRetry =
          retry.retryOnNetworkError && err.code !== 'HTTP_ABORTED';
        if (attempt >= retry.maxRetries || !canRetry) {
          throw err;
        }
        await this.#delay(attempt, retry.baseDelayMs);
        continue;
      }

      const result = await this.#parseResponse<T>(response);

      if (result.ok) {
        return result;
      }
      const err = new HttpError(
        `request failed: ${response.status} ${response.statusText}`.trim(),
        'HTTP_STATUS',
        response.status
      );
      if (retry === null) {
        throw err;
      }
      const retryable = retry.retryableStatuses.includes(response.status);
      if (attempt >= retry.maxRetries || !retryable) {
        throw err;
      }
      await this.#delay(attempt, retry.baseDelayMs);
    }
  }

  get<T = unknown>(
    path: string,
    options: HttpRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    return this.request<T>('GET', path, options);
  }

  post<T = unknown>(
    path: string,
    body?: unknown,
    options: HttpRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    return this.request<T>('POST', path, { ...options, body });
  }

  put<T = unknown>(
    path: string,
    body?: unknown,
    options: HttpRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    return this.request<T>('PUT', path, { ...options, body });
  }

  patch<T = unknown>(
    path: string,
    body?: unknown,
    options: HttpRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  delete<T = unknown>(
    path: string,
    options: HttpRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    return this.request<T>('DELETE', path, options);
  }

  #buildUrl(path: string, query?: HttpRequestOptions['query']): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.#baseUrl}${normalized}`);

    if (query !== undefined) {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          search.set(key, String(value));
        }
      }
      url.search = search.toString();
    }

    return url.toString();
  }

  async #fetchOnce(
    method: string,
    url: string,
    options: HttpRequestOptions,
    timeoutMs: number
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...this.#headers,
      ...options.headers,
    };
    let body: string | undefined;
    if (options.body !== undefined) {
      body =
        typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body);
      headers['content-type'] ??= 'application/json';
    }

    const signal = this.#combineSignals(options.signal, timeoutMs);

    try {
      return await fetch(url, { method, headers, body, signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new HttpError('request timed out', 'HTTP_TIMEOUT');
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new HttpError('request aborted', 'HTTP_ABORTED');
      }
      throw new HttpError(
        error instanceof Error ? error.message : 'network error',
        'HTTP_NETWORK'
      );
    }
  }

  #combineSignals(
    userSignal: AbortSignal | undefined,
    timeoutMs: number
  ): AbortSignal {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    if (userSignal === undefined) {
      return timeoutSignal;
    }
    return AbortSignal.any([userSignal, timeoutSignal]);
  }

  async #parseResponse<T>(response: Response): Promise<HttpResponse<T>> {
    const text = await response.text();
    let data: unknown = text;
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json') && text !== '') {
      try {
        data = JSON.parse(text);
      } catch {
        throw new HttpError(
          'invalid JSON in response body',
          'HTTP_BAD_RESPONSE',
          response.status
        );
      }
    }

    return {
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      data: data as T,
      text,
      url: response.url,
    };
  }

  #delay(attempt: number, baseDelayMs: number): Promise<void> {
    return new Promise((resolve) =>
      setTimeout(resolve, baseDelayMs * 2 ** attempt)
    );
  }
}
