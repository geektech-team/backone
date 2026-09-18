/**
 * @geektech/backone-utils —— BackOne 通用工具包。
 *
 * 零运行时依赖，全部构建在 Bun 内置能力与标准 Web API 之上。
 *
 * 模块一览：
 * - `db`：数据库连接管理（多库连接）与增删改查封装，基于 `Bun.SQL`，
 *   支持 SQLite / PostgreSQL / MySQL / MariaDB 多方言。
 * - `id`：ID 生成器（uuidv4 / uuidv7 / nanoid / snowflake），策略模式。
 * - `cache`：内存缓存（TTL 惰性过期 / LRU 容量淘汰），含 getOrSet。
 * - `jwt`：HMAC JWT 签发与验证（HS256 / HS384 / HS512），WebCrypto 实现。
 * - `http`：fetch 封装客户端（超时、指数退避重试、请求头合并、JSON 解析）。
 * - `rate-limit`：限流器（固定窗口 / 滑动窗口 / 令牌桶）。
 * - `schema`：轻量 schema 校验器（zod 风格，含类型推导与 safeParse）。
 * - `config`：全局配置（从环境变量读取强类型配置，启动期 fail-fast 校验）。
 *
 * ```ts
 * import { DatabaseManager, createId, createHttpClient, v } from '@geektech/backone-utils';
 * ```
 */

export {
  Database,
  DatabaseManager,
  createDatabase,
  Table,
  BackoneDbError,
} from './db';
export type {
  DbConnectionOptions,
  DbDialect,
  DbRow,
  FindOptions,
  OrderBy,
  SortOrder,
  Where,
  WhereOperator,
  InsertResult,
  InsertRow,
  MutateResult,
  TableOptions,
  DbErrorCode,
} from './db';

export {
  BackoneIdError,
  NanoIdGenerator,
  SnowflakeGenerator,
  UuidV4Generator,
  UuidV7Generator,
  createId,
  createIdGenerator,
} from './id';
export type {
  IdErrorCode,
  IdGenerator,
  IdGeneratorOptions,
  IdStrategy,
  NanoIdOptions,
  SnowflakeOptions,
} from './id';

export { createCache, LruCache, TtlCache } from './cache';
export type { Cache, CacheEntry, CacheOptions } from './cache';

export { createJwt, Jwt, JwtError } from './jwt';
export type {
  JwtAlgorithm,
  JwtHeader,
  JwtPayload,
  JwtSignOptions,
  JwtVerifyOptions,
  JwtErrorCode,
} from './jwt';

export { createHttpClient, HttpClient, HttpError } from './http';
export type {
  HttpClientOptions,
  HttpRequestOptions,
  HttpResponse,
  RetryOptions,
  HttpErrorCode,
} from './http';

export {
  createRateLimiter,
  FixedWindowLimiter,
  SlidingWindowLimiter,
  TokenBucketLimiter,
} from './rate-limit';
export type {
  RateLimitOptions,
  RateLimitResult,
  RateLimitStrategy,
  RateLimiter,
} from './rate-limit';

export { ValidationError, formatPath, v } from './schema';
export type {
  ArrayOptions,
  InferType,
  NumberOptions,
  SafeParseResult,
  Schema,
  SchemaIssue,
  SchemaKind,
  Shape,
  StringOptions,
  ValidationErrorCode,
} from './schema';

export {
  ConfigError,
  defineConfig,
  EnvSource,
  MemorySource,
  toUpperSnake,
} from './config';
export type {
  Config,
  ConfigErrorCode,
  ConfigFromSchema,
  ConfigSource,
  DefineConfigOptions,
} from './config';

export { BackoneError } from './errors';

// 导出包名与版本（发布脚本同步）
export const name = '@geektech/backone-utils';
export const version = '0.5.0';
