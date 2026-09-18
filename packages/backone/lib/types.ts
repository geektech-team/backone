/**
 * BackOne 公开类型。
 * 公共 API 只依赖标准 Web 类型（Request / Response / Headers），
 * Bun 专属能力封装在 server 内部，不泄漏到公开签名。
 */

import type { Context } from './context';

/** 框架支持的路由方法；`all` 注册时匹配任意方法 */
export type HttpMethod =
  'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

/** 路由注册时可用的方法键（含通配） */
export type RouteMethod = HttpMethod | 'ALL';

/** next()：进入中间件/处理器的下一层 */
export type Next = () => unknown;

/**
 * 处理器统一签名。泛型 P 用于类型化路径参数（ctx.params）。
 * 返回值支持：
 * - Response：直接透传（零开销）
 * - string / number / boolean：按文本响应
 * - object：按 JSON 响应
 * - undefined / null：无内容（204）
 */
export type Handler<P extends Record<string, string> = Record<string, string>> =
  (ctx: Context & { params: Readonly<P> }, next: Next) => unknown;

/** 中间件与处理器使用同一签名 */
export type Middleware = Handler;

export interface AppOptions {
  /** 监听端口，默认 3000；传 0 表示随机可用端口 */
  port?: number;
  /** 监听地址，默认 0.0.0.0 */
  hostname?: string;
  /** 开发模式：控制台输出错误详情、错误响应携带 message */
  development?: boolean;
  /** 请求体大小上限（字节），默认由 Bun 决定 */
  maxRequestBodySize?: number;
  /** 空闲连接超时（秒），默认由 Bun 决定 */
  idleTimeout?: number;
}

export interface CookieOptions {
  maxAge?: number;
  path?: string;
  domain?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  expires?: Date;
}

/**
 * 表单数据（标准 FormData 的方法子集）。
 * 避免在公开签名中直接引用 DOM lib 或 undici 内部类型，保持零运行时依赖、
 * 类型自包含；值与 Blob（File 是其子类）组合，覆盖常用表单读取场景。
 */
export interface BackOneFormData {
  append(name: string, value: string | Blob, filename?: string): void;
  delete(name: string): void;
  get(name: string): string | Blob | null;
  getAll(name: string): Array<string | Blob>;
  has(name: string): boolean;
  set(name: string, value: string | Blob, filename?: string): void;
  entries(): IterableIterator<[string, string | Blob]>;
  keys(): IterableIterator<string>;
  values(): IterableIterator<string | Blob>;
  forEach(
    callback: (value: string | Blob, key: string, form: BackOneFormData) => void
  ): void;
  [Symbol.iterator](): IterableIterator<[string, string | Blob]>;
}
