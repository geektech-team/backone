/**
 * Context：单个请求的处理上下文。
 * query / body 采用惰性解析，首次访问时解析并缓存，避免热路径上的无谓开销。
 */

import type { BackOneFormData, CookieOptions, HttpMethod } from './types';
import { HttpError } from './errors';

const JSON_TYPE = 'application/json; charset=utf-8';
const TEXT_TYPE = 'text/plain; charset=utf-8';
const HTML_TYPE = 'text/html; charset=utf-8';

/** 响应体类型（标准 Web 类型子集，避免依赖 DOM lib） */
type ResponseBody = string | Blob | ReadableStream | URLSearchParams;

/**
 * 从绝对 URL 中提取路径名（不含 query）。
 * 用字符串切分替代 new URL，避免热路径上的完整 URL 解析开销。
 */
export function parsePathname(url: string): string {
  const schemeEnd = url.indexOf('://');
  const pathStart = url.indexOf('/', schemeEnd === -1 ? 0 : schemeEnd + 3);
  if (pathStart === -1) {
    return '/';
  }
  const queryStart = url.indexOf('?', pathStart);
  return queryStart === -1
    ? url.slice(pathStart)
    : url.slice(pathStart, queryStart);
}

export class Context {
  /** 原始请求对象 */
  readonly request: Request;

  /** 请求方法（大写） */
  readonly method: HttpMethod;

  /** 规范化后的路径名（不含 query） */
  readonly pathname: string;

  /** 响应头构建器：处理器中设置的头部会合并进最终响应 */
  readonly headers: Headers;

  /** 中间件与处理器之间共享的可变数据 */
  readonly state: Record<string, unknown>;

  #params: Readonly<Record<string, string>> = {};
  #query: URLSearchParams | null = null;
  #status = 200;
  #jsonBody: unknown;
  #jsonLoaded = false;
  #textBody: string | null = null;
  #formBody: BackOneFormData | null = null;

  constructor(request: Request) {
    this.request = request;
    this.method = request.method.toUpperCase() as HttpMethod;
    this.pathname = parsePathname(request.url);
    this.headers = new Headers();
    this.state = {};
  }

  /** 由路由匹配结果写入路径参数（内部使用） */
  setParams(params: Readonly<Record<string, string>>): void {
    this.#params = params;
  }

  /** 路径参数，例如 /users/:id 中的 id */
  get params(): Readonly<Record<string, string>> {
    return this.#params;
  }

  /** query 参数（惰性解析并缓存） */
  get query(): URLSearchParams {
    if (this.#query === null) {
      const q = this.request.url.indexOf('?');
      this.#query = new URLSearchParams(
        q === -1 ? '' : this.request.url.slice(q + 1)
      );
    }
    return this.#query;
  }

  /** 响应状态码，默认 200 */
  get status(): number {
    return this.#status;
  }

  set status(value: number) {
    this.#status = value;
  }

  /** 读取请求头 */
  getHeader(name: string): string | null {
    return this.request.headers.get(name);
  }

  /** 设置响应头（链式） */
  set(name: string, value: string): this {
    this.headers.set(name, value);
    return this;
  }

  /** 读取请求 Cookie */
  cookie(name: string): string | null {
    const header = this.request.headers.get('Cookie');
    if (header === null) {
      return null;
    }
    for (const part of header.split(';')) {
      const [key, ...rest] = part.trim().split('=');
      if (key === name) {
        return decodeURIComponent(rest.join('='));
      }
    }
    return null;
  }

  /** 追加响应 Set-Cookie */
  setCookie(name: string, value: string, options: CookieOptions = {}): this {
    let cookie = `${name}=${encodeURIComponent(value)}`;
    if (options.maxAge !== undefined) {
      cookie += `; Max-Age=${options.maxAge}`;
    }
    if (options.path !== undefined) {
      cookie += `; Path=${options.path}`;
    }
    if (options.domain !== undefined) {
      cookie += `; Domain=${options.domain}`;
    }
    if (options.httpOnly) {
      cookie += '; HttpOnly';
    }
    if (options.secure) {
      cookie += '; Secure';
    }
    if (options.sameSite !== undefined) {
      cookie += `; SameSite=${options.sameSite}`;
    }
    if (options.expires !== undefined) {
      cookie += `; Expires=${options.expires.toUTCString()}`;
    }
    this.headers.append('Set-Cookie', cookie);
    return this;
  }

  /** 惰性解析并缓存 JSON 请求体；解析失败抛出 HttpError(400) */
  async bodyJson<T = unknown>(): Promise<T> {
    if (!this.#jsonLoaded) {
      try {
        this.#jsonBody = await this.request.json();
      } catch {
        throw new HttpError(400, 'Invalid JSON body');
      }
      this.#jsonLoaded = true;
    }
    return this.#jsonBody as T;
  }

  /** 惰性解析并缓存文本请求体 */
  async bodyText(): Promise<string> {
    if (this.#textBody === null) {
      this.#textBody = await this.request.text();
    }
    return this.#textBody;
  }

  /** 惰性解析并缓存表单请求体（multipart/form-data 或 urlencoded） */
  async bodyForm(): Promise<BackOneFormData> {
    if (this.#formBody === null) {
      this.#formBody = await this.request.formData();
    }
    return this.#formBody;
  }

  /** 返回 JSON 响应 */
  json(data: unknown, status = this.#status): Response {
    return this.#build(JSON.stringify(data), JSON_TYPE, status);
  }

  /** 返回纯文本响应 */
  text(data: string, status = this.#status): Response {
    return this.#build(data, TEXT_TYPE, status);
  }

  /** 返回 HTML 响应 */
  html(data: string, status = this.#status): Response {
    return this.#build(data, HTML_TYPE, status);
  }

  /** 返回流式响应 */
  stream(body: ReadableStream, status = this.#status): Response {
    return this.#build(body, null, status);
  }

  /** 重定向响应 */
  redirect(url: string, status = 302): Response {
    const headers = new Headers(this.headers);
    headers.set('Location', url);
    return new Response(null, { status, headers });
  }

  /** 空响应（204 No Content） */
  noContent(): Response {
    return new Response(null, { status: 204, headers: this.headers });
  }

  #build(
    body: ResponseBody | null,
    contentType: string | null,
    status: number
  ): Response {
    const headers = new Headers(this.headers);
    if (contentType !== null) {
      headers.set('Content-Type', contentType);
    }
    return new Response(body, { status, headers });
  }
}
