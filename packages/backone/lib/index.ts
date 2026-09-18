/**
 * BackOne 入口：导出服务端应用、上下文、错误与内置中间件。
 */

export { BackOneServer, createServer } from './server';
export type { RouteGroup } from './server';
export { Context } from './context';
export { HttpError, defaultHttpMessage } from './errors';
export { compose } from './middleware/compose';
export { cors } from './middleware/cors';
export { gzip } from './middleware/gzip';
export { helmet } from './middleware/helmet';
export { logger } from './middleware/logger';
export { serveStatic } from './middleware/static';
export { timeout } from './middleware/timeout';
export type {
  AppOptions,
  CookieOptions,
  Handler,
  HttpMethod,
  Middleware,
  Next,
  RouteMethod,
} from './types';
export type { BackOneFormData } from './types';
export type { CorsOptions } from './middleware/cors';
export type { GzipOptions } from './middleware/gzip';
export type { HelmetOptions } from './middleware/helmet';
export type { LoggerOptions } from './middleware/logger';
export type { StaticOptions } from './middleware/static';
export type { TimeoutOptions } from './middleware/timeout';
export type {
  BackOneWebSocket,
  WebSocketData,
  WebSocketHandler,
} from './websocket';

// 导出框架名称和版本
export const name = '@geektech/backone';
export const version = '0.1.0';
