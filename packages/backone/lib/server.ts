/**
 * BackOneServer：服务端应用入口。
 * 负责路由注册、中间件编排与 Bun.serve 生命周期；
 * handle() 是独立于监听的请求管线，可直接用于测试。
 */

import type { Server } from 'bun';
import { Context, parsePathname } from './context';
import { HttpError } from './errors';
import { compose } from './middleware/compose';
import type { ComposedHandler } from './middleware/compose';
import { cors } from './middleware/cors';
import { gzip } from './middleware/gzip';
import type { GzipOptions } from './middleware/gzip';
import { helmet } from './middleware/helmet';
import type { HelmetOptions } from './middleware/helmet';
import { logger } from './middleware/logger';
import { serveStatic } from './middleware/static';
import { timeout } from './middleware/timeout';
import type { TimeoutOptions } from './middleware/timeout';
import { serializeResponse } from './response';
import { Router } from './router/router';
import type { AppOptions, Handler, RouteMethod } from './types';
import type { CorsOptions } from './middleware/cors';
import type { LoggerOptions } from './middleware/logger';
import type { StaticOptions } from './middleware/static';
import type { WebSocketData, WebSocketHandler } from './websocket';

const JSON_TYPE = 'application/json; charset=utf-8';

/** 路由组：在指定前缀下批量注册路由，方法签名与 BackOneServer 一致 */
export interface RouteGroup {
  get<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this;
  post<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this;
  put<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this;
  patch<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this;
  delete<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this;
  options<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this;
  head<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this;
  all<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this;
  ws(path: string, handler: WebSocketHandler): this;
}

export class BackOneServer {
  readonly #router = new Router();
  readonly #middlewares: Handler[] = [];
  /** 路由前缀栈：栈顶为当前生效前缀；作用域形式进出栈实现临时叠加 */
  readonly #prefixes: string[] = [];
  /** 预编译的中间件链（use 后重编译），避免每请求重建闭包与数组 */
  #composedMiddlewares: ComposedHandler = compose([]);
  readonly #wsHandlers = new Map<string, WebSocketHandler>();
  readonly #options: AppOptions;
  #server: Server<WebSocketData> | null = null;
  #activeRequests = 0;

  constructor(options: AppOptions = {}) {
    this.#options = options;
  }

  // ---- 路由注册 ----

  get<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this {
    return this.add('GET', path, handlers as Handler[]);
  }

  post<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this {
    return this.add('POST', path, handlers as Handler[]);
  }

  put<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this {
    return this.add('PUT', path, handlers as Handler[]);
  }

  patch<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this {
    return this.add('PATCH', path, handlers as Handler[]);
  }

  delete<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this {
    return this.add('DELETE', path, handlers as Handler[]);
  }

  options<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this {
    return this.add('OPTIONS', path, handlers as Handler[]);
  }

  head<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this {
    return this.add('HEAD', path, handlers as Handler[]);
  }

  /** 匹配任意 HTTP 方法 */
  all<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this {
    return this.add('ALL', path, handlers as Handler[]);
  }

  /**
   * 路由组：在指定前缀下批量注册路由。
   * @example
   * app.group('/api', (api) => {
   *   api.get('/users', handler);
   *   api.post('/users', handler);
   * });
   */
  group(prefix: string, callback: (group: RouteGroup) => void): this {
    callback(new RouteGroupImpl(this, prefix));
    return this;
  }

  add(method: RouteMethod, path: string, handlers: Handler[]): this {
    this.#router.add(method, this.#resolvePath(path), handlers);
    return this;
  }

  // ---- WebSocket ----

  /** 注册 WebSocket 处理器：请求 Upgrade 时自动升级并分发（路径应用当前前缀） */
  ws(path: string, handler: WebSocketHandler): this {
    this.#wsHandlers.set(this.#resolvePath(path), handler);
    return this;
  }

  // ---- 中间件 ----

  use(...middlewares: Handler[]): this {
    this.#middlewares.push(...middlewares);
    this.#composedMiddlewares = compose(this.#middlewares);
    return this;
  }

  useLogger(options: LoggerOptions = {}): this {
    return this.use(logger(options));
  }

  useCors(options: CorsOptions = {}): this {
    return this.use(cors(options));
  }

  serveStatic(
    prefix: string,
    rootDir: string,
    options: StaticOptions = {}
  ): this {
    return this.use(serveStatic(prefix, rootDir, options));
  }

  /** 内置：gzip 响应压缩（基于 Bun.gzipSync，零依赖） */
  useGzip(options: GzipOptions = {}): this {
    return this.use(gzip(options));
  }

  /** 内置：请求超时，超时返回 504 */
  useTimeout(options: TimeoutOptions | number = {}): this {
    return this.use(timeout(options));
  }

  /** 内置：安全响应头（helmet 风格） */
  useHelmet(options: HelmetOptions = {}): this {
    return this.use(helmet(options));
  }

  // ---- 路由前缀 ----

  /**
   * 路由前缀：为之后注册的路由统一增加前缀（内置快捷方法，作用于路由注册
   * 而非请求处理，因此与 group 一样在注册期生效）。
   *
   * 两种形式：
   * - 持久形式 `usePrefix('/api')`：替换当前基础前缀，影响此后注册的所有
   *   路由与 WebSocket；`usePrefix()` / `usePrefix('')` 重置为无前缀。
   * - 作用域形式 `usePrefix('/api', (api) => {...})`：在回调内临时叠加
   *   前缀（相对当前前缀），回调结束自动恢复，支持嵌套。
   *
   * 前缀会做归一化：自动补前导 `/`、去掉末尾 `/`；`''` 与 `'/'` 视为无前缀。
   *
   * @example
   * app.usePrefix('/api');
   * app.get('/users', handler);           // GET /api/users
   * app.usePrefix('/v2', (api) => {
   *   api.get('/users', handler);         // GET /api/v2/users
   * });
   * app.get('/health', handler);          // GET /api/health
   * app.usePrefix();
   * app.get('/status', handler);          // GET /status
   */
  usePrefix(prefix = '', callback?: (api: BackOneServer) => void): this {
    const normalized = normalizePrefix(prefix);
    if (callback === undefined) {
      this.#prefixes.length = 0;
      if (normalized !== '') {
        this.#prefixes.push(normalized);
      }
      return this;
    }
    this.#prefixes.push(this.#currentPrefix + normalized);
    try {
      callback(this);
    } finally {
      this.#prefixes.pop();
    }
    return this;
  }

  /** 当前生效的路由前缀（无前缀时为空字符串） */
  get prefix(): string {
    return this.#currentPrefix;
  }

  get #currentPrefix(): string {
    return this.#prefixes.length > 0
      ? this.#prefixes[this.#prefixes.length - 1]
      : '';
  }

  /** 把注册路径解析为最终路径（叠加当前前缀） */
  #resolvePath(path: string): string {
    const prefix = this.#currentPrefix;
    return prefix === '' ? path : prefix + path;
  }

  // ---- 请求管线 ----

  /**
   * 处理单个请求：WebSocket 升级 → 路由匹配 → 中间件链 → 响应序列化。
   * server 参数仅在 Bun.serve fetch 回调中传入，用于 WebSocket 升级。
   */
  async handle(
    request: Request,
    server?: Server<WebSocketData>
  ): Promise<Response> {
    this.#activeRequests++;
    try {
      return await this.#handleInner(request, server);
    } finally {
      this.#activeRequests--;
    }
  }

  async #handleInner(
    request: Request,
    server?: Server<WebSocketData>
  ): Promise<Response> {
    // WebSocket 升级
    if (
      server !== undefined &&
      request.headers.get('upgrade')?.toLowerCase() === 'websocket'
    ) {
      const pathname = parsePathname(request.url);
      if (this.#wsHandlers.has(pathname)) {
        const data: WebSocketData = { path: pathname };
        if (server.upgrade(request, { data })) {
          return new Response(null, { status: 101 });
        }
      }
    }

    const ctx = new Context(request);
    const match = this.#router.match(request.method, ctx.pathname);
    ctx.setParams(match?.params ?? {});

    // 中间件链始终执行（静态文件等中间件需要拦截未匹配路径）；
    // 链尾按匹配结果追加 404 / 405 / 路由处理器（单个函数，无数组分配）。
    let tailNext: Handler;
    if (match === null) {
      tailNext = () => this.#errorResponse(new HttpError(404));
    } else if (match.handlers.length === 0) {
      const allowed = match.allowed.join(', ');
      tailNext = () =>
        new Response(null, { status: 405, headers: { Allow: allowed } });
    } else {
      tailNext = match.handler;
    }

    try {
      const result = await this.#composedMiddlewares(ctx, tailNext);
      return this.#toResponse(ctx, result);
    } catch (error) {
      const httpError =
        error instanceof HttpError
          ? error
          : new HttpError(500, undefined, { cause: error });
      return this.#errorResponse(httpError);
    }
  }

  // ---- 生命周期 ----

  /** 启动监听，返回实际端口号 */
  async listen(
    options: Pick<AppOptions, 'port' | 'hostname'> = {}
  ): Promise<number> {
    if (this.#server !== null) {
      throw new Error('BackOne server is already listening');
    }
    this.#server = Bun.serve<WebSocketData>({
      port: options.port ?? this.#options.port ?? 3000,
      hostname: options.hostname ?? this.#options.hostname,
      fetch: (request, server) => this.handle(request, server),
      maxRequestBodySize: this.#options.maxRequestBodySize,
      idleTimeout: this.#options.idleTimeout,
      websocket: {
        open: (ws) => {
          this.#wsHandlers.get(ws.data.path)?.open?.(ws);
        },
        message: (ws, message) => {
          this.#wsHandlers.get(ws.data.path)?.message?.(ws, message);
        },
        close: (ws, code, reason) => {
          this.#wsHandlers.get(ws.data.path)?.close?.(ws, code, reason);
        },
        drain: (ws) => {
          this.#wsHandlers.get(ws.data.path)?.drain?.(ws);
        },
      },
    });
    const { port } = this.#server;
    if (port === undefined) {
      throw new Error('BackOne failed to determine listening port');
    }
    return port;
  }

  /** 当前监听端口；未启动时为 null */
  get port(): number | null {
    return this.#server?.port ?? null;
  }

  /**
   * 优雅关闭：停止接受新连接，等待进行中请求完成，超时后强制关闭。
   * @param options.timeout 最大等待毫秒数，默认 5000；传 0 立即强制关闭
   */
  async close(options: { timeout?: number } = {}): Promise<void> {
    if (this.#server === null) return;
    const timeout = options.timeout ?? 5000;

    // 停止接受新连接（不强制断开现有连接）
    this.#server.stop(false);

    if (timeout > 0) {
      const start = Date.now();
      while (this.#activeRequests > 0 && Date.now() - start < timeout) {
        await new Promise((r) => setTimeout(r, 10));
      }
    }

    // 强制关闭剩余连接
    this.#server.stop(true);
    this.#server = null;
  }

  // ---- 内部 ----

  #toResponse(ctx: Context, value: unknown): Response {
    return serializeResponse(ctx, value);
  }

  #errorResponse(error: HttpError): Response {
    const development = this.#options.development === true;
    const isServerError = error.status >= 500;
    if (isServerError && development) {
      console.error(error, error.cause);
    }
    const message =
      isServerError && !development ? 'Internal Server Error' : error.message;
    return new Response(
      JSON.stringify({ error: message, status: error.status }),
      {
        status: error.status,
        headers: { 'Content-Type': JSON_TYPE },
      }
    );
  }
}

/** 创建 BackOne 服务端应用 */
export function createServer(options: AppOptions = {}): BackOneServer {
  return new BackOneServer(options);
}

/**
 * 归一化路由前缀：补前导 `/`、去末尾 `/`；空串与 `/` 视为无前缀。
 * 例如 `'api/'` → `'/api'`、`'/v2'` → `'/v2'`、`''` → `''`。
 */
function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim();
  if (trimmed === '' || trimmed === '/') {
    return '';
  }
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, '');
}

/** RouteGroup 的内部实现：所有方法委托给 server 并自动加前缀 */
class RouteGroupImpl implements RouteGroup {
  constructor(
    private readonly server: BackOneServer,
    private readonly prefix: string
  ) {}

  get<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this {
    this.server.get(this.prefix + path, ...handlers);
    return this;
  }
  post<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this {
    this.server.post(this.prefix + path, ...handlers);
    return this;
  }
  put<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this {
    this.server.put(this.prefix + path, ...handlers);
    return this;
  }
  patch<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this {
    this.server.patch(this.prefix + path, ...handlers);
    return this;
  }
  delete<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this {
    this.server.delete(this.prefix + path, ...handlers);
    return this;
  }
  options<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this {
    this.server.options(this.prefix + path, ...handlers);
    return this;
  }
  head<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this {
    this.server.head(this.prefix + path, ...handlers);
    return this;
  }
  all<P extends Record<string, string> = Record<string, string>>(
    path: string,
    ...handlers: Handler<P>[]
  ): this {
    this.server.all(this.prefix + path, ...handlers);
    return this;
  }
  ws(path: string, handler: WebSocketHandler): this {
    this.server.ws(this.prefix + path, handler);
    return this;
  }
}
