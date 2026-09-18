/**
 * HTTP 客户端公开类型。
 *
 * 基于 fetch 的轻量封装：超时、指数退避重试、请求 / 响应头合并、
 * JSON 自动序列化与解析，零运行时依赖。
 */

/** 重试配置 */
export interface RetryOptions {
  /** 最大重试次数（额外的请求次数），默认 2 */
  maxRetries?: number;
  /** 基础退避毫秒（指数退避：baseDelay * 2^attempt），默认 200 */
  baseDelayMs?: number;
  /** 可重试的响应状态码，默认 408 / 429 / 500 / 502 / 503 / 504 */
  retryableStatuses?: readonly number[];
  /** 是否重试网络错误（fetch 抛异常）与超时，默认 true */
  retryOnNetworkError?: boolean;
}

/** 客户端选项 */
export interface HttpClientOptions {
  /** 基础 URL（如 https://api.example.com），与请求路径拼接 */
  baseUrl?: string;
  /** 默认请求头（可被单次请求的 headers 覆盖） */
  headers?: Record<string, string>;
  /** 默认超时毫秒，默认 10_000 */
  timeoutMs?: number;
  /** 默认重试配置 */
  retry?: RetryOptions;
}

/** 单次请求选项 */
export interface HttpRequestOptions {
  /** 查询参数：自动拼接到 URL（undefined 值跳过） */
  query?: Record<string, string | number | boolean | undefined>;
  /** 请求头（覆盖默认头） */
  headers?: Record<string, string>;
  /** 超时毫秒（覆盖客户端默认） */
  timeoutMs?: number;
  /** 重试配置；传 false 关闭本次重试 */
  retry?: RetryOptions | false;
  /** 请求体：对象自动 JSON 序列化，字符串原样发送 */
  body?: unknown;
  /** 外部取消信号（与超时信号合并） */
  signal?: AbortSignal;
}

/** 响应封装：data 为解析后的 JSON（非 JSON 响应则原样为文本） */
export interface HttpResponse<T = unknown> {
  status: number;
  ok: boolean;
  headers: Headers;
  data: T;
  text: string;
  url: string;
}
