/**
 * Table：单表的增删改查封装。
 *
 * 依赖关系：Table 依赖 Database 执行查询与方言引用；所有值经 `?`
 * 占位符参数化，表名 / 列名经方言引用，杜绝拼接注入。
 *
 * 支持方言差异：PostgreSQL / SQLite 直接使用 `RETURNING *` 返回变更后的
 * 行；MySQL / MariaDB 通过 LAST_INSERT_ID / 前置 COUNT 回查（写入类操作
 * 返回的 rows 为空数组，count 表示匹配行数）。
 */

import type { Database } from './database';
import { BackoneDbError } from './errors';
import { buildOrderBy, buildWhereClause } from './query';
import type { DbRow, FindOptions, Where } from './types';

export interface TableOptions<T extends object> {
  /** 主键列名，默认 `'id'`；用于 findById 与 insert 回查 */
  primaryKey?: keyof T;
}

/**
 * insert 的输入行：主键列可选（数据库自增 / 默认值生成），其余列必填。
 * 自定义主键时请显式传 PK 泛型：`table<Order, 'order_id'>('orders')`。
 */
export type InsertRow<T extends object, PK extends PropertyKey> = Omit<
  T,
  Extract<PK, keyof T>
> &
  Partial<Pick<T, Extract<PK, keyof T>>>;

export interface InsertResult<T extends object> {
  rows: T[];
  count: number;
}

export interface MutateResult<T extends object> {
  /** 受影响 / 匹配行数 */
  count: number;
  /** 变更后的行（方言不支持 RETURNING 时为空数组） */
  rows: T[];
}

export class Table<T extends object = DbRow, PK extends PropertyKey = 'id'> {
  /** 所属数据库 */
  readonly db: Database;
  /** 表名 */
  readonly name: string;
  /** 主键列名 */
  readonly primaryKey: PK;

  constructor(db: Database, name: string, options: TableOptions<T> = {}) {
    this.db = db;
    this.name = name;
    this.primaryKey = (options.primaryKey ?? 'id') as PK;
  }

  // ---- 查询 ----

  /** 按主键查询单行；未命中返回 null */
  async findById(id: unknown): Promise<T | null> {
    if (id === undefined || id === null) {
      return null;
    }
    const rows = await this.findMany({
      where: { [this.primaryKey]: id } as Where<T>,
      limit: 1,
    });
    return rows[0] ?? null;
  }

  /** 查询至多一行 */
  async findOne(options: FindOptions<T> = {}): Promise<T | null> {
    const rows = await this.findMany({ ...options, limit: 1 });
    return rows[0] ?? null;
  }

  /** 多行查询：支持 where / orderBy / limit / offset / select */
  async findMany(options: FindOptions<T> = {}): Promise<T[]> {
    const { select, where, orderBy, limit, offset } = options;
    const params: unknown[] = [];
    const columns =
      select && select.length > 0
        ? select.map((col) => this.#quote(String(col))).join(', ')
        : '*';

    const clauses = [`SELECT ${columns} FROM ${this.#quote(this.name)}`];
    if (where) {
      clauses.push(`WHERE ${buildWhereClause(this.db, where, params)}`);
    }
    if (orderBy) {
      clauses.push(`ORDER BY ${buildOrderBy(this.db, orderBy)}`);
    }
    if (limit !== undefined) {
      clauses.push('LIMIT ?');
      params.push(limit);
    }
    if (offset !== undefined) {
      clauses.push('OFFSET ?');
      params.push(offset);
    }

    return this.db.raw<T[]>(clauses.join(' '), params);
  }

  /** 统计行数 */
  async count(where?: Where<T>): Promise<number> {
    const params: unknown[] = [];
    const whereClause = where
      ? ` WHERE ${buildWhereClause(this.db, where, params)}`
      : '';
    const rows = await this.db.raw<Array<{ n: number | string }>>(
      `SELECT COUNT(*) AS n FROM ${this.#quote(this.name)}${whereClause}`,
      params
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** 是否存在匹配行 */
  async exists(where?: Where<T>): Promise<boolean> {
    return (await this.count(where)) > 0;
  }

  // ---- 写入 ----

  /**
   * 插入一行并返回插入后的行（含数据库生成的默认值 / 自增主键）。
   * 方言不支持 RETURNING 时通过主键回查；主键缺省假设为 `id`。
   */
  async insert(row: InsertRow<T, PK>): Promise<T | null> {
    const entries = Object.entries(row);
    if (entries.length === 0) {
      throw new BackoneDbError(
        `insert into "${this.name}" requires at least one column`,
        'DB_EMPTY_WRITE'
      );
    }

    const columns = entries.map(([key]) => this.#quote(key)).join(', ');
    const values = entries.map(() => '?').join(', ');
    const params = entries.map(([, value]) => value);
    const insertSql = `INSERT INTO ${this.#quote(this.name)} (${columns}) VALUES (${values})`;

    if (this.db.dialectSupportsReturning()) {
      const rows = await this.db.raw<T[]>(`${insertSql} RETURNING *`, params);
      return rows[0] ?? null;
    }

    await this.db.raw(insertSql, params);
    const pk = String(this.primaryKey);
    const rows = await this.db.raw<T[]>(
      `SELECT * FROM ${this.#quote(this.name)} WHERE ${this.#quote(pk)} = LAST_INSERT_ID()`
    );
    return rows[0] ?? null;
  }

  /**
   * 批量插入。列集合取所有行的并集（首次出现顺序），缺失列填 NULL。
   * 方言支持 RETURNING 时返回全部插入行，否则 rows 为空数组、count 为插入条数。
   */
  async insertMany(
    rows: readonly InsertRow<T, PK>[]
  ): Promise<InsertResult<T>> {
    if (rows.length === 0) {
      return { rows: [], count: 0 };
    }

    const keys: string[] = [];
    const seen = new Set<string>();
    const entriesByRow = rows.map((row) => Object.entries(row));
    for (const entries of entriesByRow) {
      for (const [key] of entries) {
        if (!seen.has(key)) {
          seen.add(key);
          keys.push(key);
        }
      }
    }

    const params: unknown[] = [];
    const tuples = entriesByRow.map((entries) => {
      const byKey = new Map(entries);
      const values = keys.map((key) => byKey.get(key) ?? null);
      params.push(...values);
      return `(${values.map(() => '?').join(', ')})`;
    });

    const columns = keys.map((key) => this.#quote(key)).join(', ');
    const insertSql = `INSERT INTO ${this.#quote(this.name)} (${columns}) VALUES ${tuples.join(', ')}`;

    if (this.db.dialectSupportsReturning()) {
      const result = await this.db.raw<T[]>(`${insertSql} RETURNING *`, params);
      return { rows: result, count: result.length };
    }

    await this.db.raw(insertSql, params);
    return { rows: [], count: rows.length };
  }

  /**
   * 按条件更新。返回受影响 / 匹配行数；方言支持 RETURNING 时同时返回更新后的行。
   * where 必须非空（防全表误更新）。
   */
  async update(partial: Partial<T>, where: Where<T>): Promise<MutateResult<T>> {
    const entries = Object.entries(partial);
    if (entries.length === 0) {
      throw new BackoneDbError(
        `update on "${this.name}" requires at least one column`,
        'DB_EMPTY_WRITE'
      );
    }
    this.#assertWhere(where);

    const params: unknown[] = [];
    const setClause = entries
      .map(([key]) => `${this.#quote(key)} = ?`)
      .join(', ');
    params.push(...entries.map(([, value]) => value));
    const updateSql = `UPDATE ${this.#quote(this.name)} SET ${setClause} WHERE ${buildWhereClause(this.db, where, params)}`;

    if (this.db.dialectSupportsReturning()) {
      const rows = await this.db.raw<T[]>(`${updateSql} RETURNING *`, params);
      return { count: rows.length, rows };
    }

    // mysql/mariadb：以更新前匹配行数作为 count（当前版本非原子口径，事务内使用更稳妥）
    const before = await this.count(where);
    await this.db.raw(updateSql, params);
    return { count: before, rows: [] };
  }

  /**
   * 按条件删除。返回删除行数；方言支持 RETURNING 时同时返回被删行。
   * where 必须非空（防全表误删除）。
   */
  async delete(where: Where<T>): Promise<MutateResult<T>> {
    this.#assertWhere(where);

    const params: unknown[] = [];
    const deleteSql = `DELETE FROM ${this.#quote(this.name)} WHERE ${buildWhereClause(this.db, where, params)}`;

    if (this.db.dialectSupportsReturning()) {
      const rows = await this.db.raw<T[]>(`${deleteSql} RETURNING *`, params);
      return { count: rows.length, rows };
    }

    const before = await this.count(where);
    await this.db.raw(deleteSql, params);
    return { count: before, rows: [] };
  }

  #quote(name: string): string {
    return this.db.quoteIdent(name);
  }

  #assertWhere(where: Where<T>): void {
    const hasCondition = Object.keys(where).some((key) => {
      if (key === 'AND' || key === 'OR') {
        const group = (where as Record<string, unknown>)[key] as
          readonly Where<T>[] | undefined;
        return group !== undefined && group.length > 0;
      }
      return true;
    });
    if (!hasCondition) {
      throw new BackoneDbError(
        `update/delete on "${this.name}" requires a non-empty where`,
        'DB_EMPTY_WHERE'
      );
    }
  }
}
