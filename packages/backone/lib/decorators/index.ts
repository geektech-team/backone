/** 可选的标准装饰器入口，不依赖反射或全局应用实例。 */
export {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Options,
  Head,
  All,
  Use,
} from './metadata';
export type { RouteDecorator } from './metadata';
export type { SystemDecorator } from './metadata';
export { registerControllers } from './register';
export type { ControllerRoute } from './register';
export {
  Validate,
  validatedBody,
  validatedQuery,
  validatedParams,
} from './validation';
export type { InputSchema, ValidateOptions } from './validation';
export { Status, Header, Timeout } from './responses';
export { Authorize, getPrincipal, RateLimit } from './access';
export type {
  AuthorizeOptions,
  RateLimitBackend,
  RateLimitResult,
  RateLimitOptions,
} from './access';
export { Cache } from './cache';
export type { CachedResponse, ResponseCacheStore, CacheOptions } from './cache';
export {
  WebSocket,
  OnOpen,
  OnMessage,
  OnClose,
  OnDrain,
  registerWebSockets,
} from './websocket';
export type { WebSocketGateway } from './websocket';

export { Module, registerModules } from './module';
export type {
  ModuleOptions,
  ModuleDescription,
  ModuleRegistration,
} from './module';
