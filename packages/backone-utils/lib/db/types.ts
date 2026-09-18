/**
 * 数据库工具公开类型。
 *
 * 本包基于 Bun 内置的 `Bun.SQL`（零运行时依赖），统一支持 SQLite /
 * PostgreSQL / MySQL / MariaDB 四种方言。公开 API 只依赖标准 Web 类型与
 * 少量 Bun 类型，使用方在 Bun 运行时下无需安装任何数据库驱动。
 */

/** 支持的数据库方言（对应 Bun.SQL 的内置适配器） */
export type DbDialect = 'sqlite' | 'postgres' | 'mysql' | 'mariadb';

/** 数据库行：普通对象，值可为任意可绑定参数 */
export type DbRow = Record<string, unknown>;

/** 单值条件操作符。多个操作符同时出现时按 AND 组合。 */
export interface WhereOperator<V = unknown> {
  eq?: V;
  ne?: V;
  gt?: V;
  gte?: V;
  lt?: V;
  lte?: V;
  like?: string;
  notLike?: string;
  in?: readonly V[];
  notIn?: readonly V[];
  isNull?: boolean;
  between?: readonly [V, V];
}

/**
 * where 条件 DSL：
 * - 字段 = 裸值，表示等值（null 表示 `IS NULL`）
 * - 字段 = 操作符对象，支持比较 / 模糊 / 集合 / 空值 / 范围
 * - `AND` / `OR` 数组用于组合子条件（AND 优先级高于 OR）
 *
 * ```ts
 * { age: { gte: 18 }, status: { in: ['active', 'pending'] }, OR: [{ name: { like: '%a%' } }, { city: 'x' }] }
 * ```
 */
export type Where<T extends object = DbRow> = {
  [K in keyof T]?: T[K] | WhereOperator<T[K]>;
} & {
  AND?: readonly Where<T>[];
  OR?: readonly Where<T>[];
};

/** 排序方向 */
export type SortOrder = 'asc' | 'desc';

/**
 * 排序字段：
 * - 字符串 `'created_at'` 表示升序
 * - 对象 `{ created_at: 'desc', id: 'asc' }` 支持多列排序
 */
export type OrderBy<T extends object = DbRow> =
  { [K in keyof T]?: SortOrder } | keyof T;

/** 查询选项（findMany / findOne） */
export interface FindOptions<T extends object = DbRow> {
  where?: Where<T>;
  orderBy?: OrderBy<T> | readonly OrderBy<T>[];
  limit?: number;
  offset?: number;
  /** 投影列（默认返回全部列） */
  select?: readonly (keyof T)[];
}

/**
 * 连接配置。
 *
 * url 示例：
 * - PostgreSQL：`postgres://user:pass@localhost:5432/mydb`
 * - MySQL / MariaDB：`mysql://user:pass@localhost:3306/mydb`
 * - SQLite 内存：`:memory:` 或 `sqlite://:memory:`
 * - SQLite 文件：`./data/app.db` 或 `sqlite://./data/app.db`
 *
 * 未传 url 时按 sqlite 内存库处理。
 */
export interface DbConnectionOptions {
  /** 库的业务名称（DatabaseManager 注册时以注册名为主，缺省 'default'） */
  name?: string;
  /** 连接串（见上方示例） */
  url?: string | URL;
  /** 方言；缺省时按 url 推断，无法推断时按 sqlite 处理 */
  dialect?: DbDialect;
  /** 只读标记（业务语义标记，当前版本不强制拦截写入） */
  readonly?: boolean;
  /** 连接池最大连接数（仅 postgres/mysql/mariadb 生效） */
  max?: number;
  /** 空闲连接超时（秒，仅服务端方言生效） */
  idleTimeout?: number;
  /** 建立连接超时（秒，仅服务端方言生效） */
  connectionTimeout?: number;
  /** TLS/SSL 配置（仅服务端方言生效） */
  tls?: boolean | string | Record<string, unknown>;
  /** int8 等大整数按 BigInt 返回（默认 false，按字符串返回） */
  bigint?: boolean;
  /** 连接建立完成回调 */
  onconnect?: (err: Error | null) => void;
  /** 连接关闭回调 */
  onclose?: (err: Error | null) => void;
}
