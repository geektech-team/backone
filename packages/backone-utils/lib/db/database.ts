/**
 * Database：单个数据库连接的封装。
 *
 * 组合关系：Database 组合（拥有）一个 `Bun.SQL` 客户端与一个方言策略；
 * 对外提供标签模板查询、原始 SQL、表句柄与事务能力。
 */

import { BackoneDbError } from './errors';
import { createDialect, inferDialect, type SqlDialect } from './dialect';
import { Table, type TableOptions } from './table';
import type { DbConnectionOptions, DbDialect, DbRow } from './types';

/** 把 sqlite 连接串规整为 Bun 的 filename 形式 */
function toSqliteFilename(url: string | URL): string {
  const text = typeof url === 'string' ? url : url.toString();
  if (text === ':memory:' || text.startsWith('file:')) {
    return text;
  }
  if (text.startsWith('sqlite://')) {
    const rest = text.slice('sqlite://'.length);
    return rest === ':memory:' ? ':memory:' : rest;
  }
  return text;
}

function createSqlClient(
  url: string | URL | undefined,
  dialect: DbDialect,
  passthrough: Omit<
    DbConnectionOptions,
    'name' | 'url' | 'dialect' | 'readonly'
  >
): Bun.SQL {
  if (dialect === 'postgres' || dialect === 'mysql' || dialect === 'mariadb') {
    if (url === undefined) {
      throw new BackoneDbError(
        `dialect "${dialect}" requires a connection url`,
        'DB_MISSING_URL'
      );
    }
    return new Bun.SQL({
      ...passthrough,
      url,
      adapter: dialect,
    } as Bun.SQL.Options);
  }
  return new Bun.SQL({
    ...passthrough,
    filename: url === undefined ? ':memory:' : toSqliteFilename(url),
    adapter: 'sqlite',
  } as Bun.SQL.Options);
}

export class Database {
  /** 库的业务名称 */
  readonly name: string;
  /** 方言 */
  readonly dialect: DbDialect;
  /** 只读标记（业务语义，当前版本不强制拦截写入） */
  readonly readonly: boolean;

  #sql: Bun.SQL;
  #dialect: SqlDialect;
  #ownsClient: boolean;
  #closed = false;

  /**
   * 创建数据库连接。
   *
   * @param options 连接配置；缺省 url 时创建 sqlite 内存库。
   * @param internalClient 仅框架内部使用：包装已有客户端（如事务连接），
   *   此时 Database 不拥有该客户端的生命周期。
   */
  constructor(options: DbConnectionOptions = {}, internalClient?: Bun.SQL) {
    const {
      name = 'default',
      url,
      dialect = inferDialect(url),
      readonly = false,
      ...passthrough
    } = options;

    this.name = name;
    this.dialect = dialect;
    this.readonly = readonly;
    this.#dialect = createDialect(dialect);

    if (internalClient !== undefined) {
      this.#sql = internalClient;
      this.#ownsClient = false;
    } else {
      this.#sql = createSqlClient(url, dialect, passthrough);
      this.#ownsClient = true;
    }
  }

  /** 底层 Bun.SQL 客户端（高级用法，通常不需要直接接触） */
  get client(): Bun.SQL {
    return this.#sql;
  }

  /** 是否已关闭 */
  get isClosed(): boolean {
    return this.#closed;
  }

  /** 当前方言是否支持 `... RETURNING *` */
  dialectSupportsReturning(): boolean {
    return this.#dialect.supportsReturning;
  }

  /** 按方言规则引用标识符（表名 / 列名） */
  quoteIdent(name: string): string {
    return this.#dialect.quoteIdent(name);
  }

  /**
   * 标签模板查询（安全参数绑定）：
   *
   * ```ts
   * const rows = await db.query<Task[]>`SELECT * FROM tasks WHERE id = ${id}`;
   * ```
   *
   * 也可直接传入 SQL 字符串（无参数场景，等价于 raw 不带参数）。
   */
  query<T = DbRow>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
  query<T = DbRow>(sqlText: string): Promise<T>;
  query<T = DbRow>(
    stringsOrText: TemplateStringsArray | string,
    ...values: unknown[]
  ): Promise<T> {
    const closedError = this.#closedError();
    if (closedError) {
      return Promise.reject(closedError);
    }
    if (typeof stringsOrText === 'string') {
      return this.#sql.unsafe<T>(stringsOrText);
    }
    return this.#sql<T>(stringsOrText, ...values);
  }

  /**
   * 原始 SQL 查询（`?` 占位符，Bun 统一参数化）。
   *
   * ```ts
   * const rows = await db.raw<Row[]>('SELECT * FROM tasks WHERE done = ?', [0]);
   * ```
   */
  raw<T = DbRow>(sqlText: string, params?: readonly unknown[]): Promise<T> {
    const closedError = this.#closedError();
    if (closedError) {
      return Promise.reject(closedError);
    }
    return this.#sql.unsafe<T>(sqlText, params ? [...params] : undefined);
  }

  /** 获取表的 CRUD 句柄 */
  table<T extends object = DbRow, PK extends PropertyKey = 'id'>(
    name: string,
    options: TableOptions<T> = {}
  ): Table<T, PK> {
    this.#assertOpen();
    return new Table<T, PK>(this, name, options);
  }

  /**
   * 事务：回调中的查询在同一连接内原子执行，任一失败自动回滚。
   * 回调收到一个绑定到当前事务连接的 Database（其中 close() 为无操作）。
   *
   * ```ts
   * const [a, b] = await db.transaction(async (tx) => {
   *   const table = tx.table<Row>('items');
   *   const a = await table.insert({ v: 1 });
   *   const b = await table.insert({ v: 2 });
   *   return [a, b];
   * });
   * ```
   */
  async transaction<T>(fn: (tx: Database) => Promise<T> | T): Promise<T> {
    this.#assertOpen();
    return this.#sql.begin(async (txSql) => {
      const txDb = new Database(
        { name: this.name, dialect: this.dialect, readonly: this.readonly },
        txSql
      );
      return await fn(txDb);
    });
  }

  /** 关闭连接池。事务作用域内的 Database 调用无效果（不拥有客户端）。 */
  async close(options?: { timeout?: number }): Promise<void> {
    if (this.#closed || !this.#ownsClient) {
      return;
    }
    this.#closed = true;
    await this.#sql.close(options);
  }

  #closedError(): BackoneDbError | undefined {
    if (this.#closed) {
      return new BackoneDbError(
        `database "${this.name}" is closed`,
        'DB_CLOSED'
      );
    }
    return undefined;
  }

  #assertOpen(): void {
    const error = this.#closedError();
    if (error) {
      throw error;
    }
  }
}
