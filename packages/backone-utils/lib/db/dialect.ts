/**
 * 方言策略：封装各数据库在 SQL 语法上的差异。
 *
 * 参数占位符由 Bun.SQL 统一规范为 `?`，这里主要处理两处差异：
 * 1. 标识符（表名 / 列名）的引用方式：SQLite / PostgreSQL 用双引号，
 *    MySQL / MariaDB 用反引号；
 * 2. 是否支持 `INSERT / UPDATE / DELETE ... RETURNING` 语法：
 *    PostgreSQL / SQLite 支持，MySQL / MariaDB 不支持（需以
 *    LAST_INSERT_ID / 前置 COUNT 回查）。
 *
 * 新增方言时实现 SqlDialect 接口并在 createDialect 注册即可，查询构建
 * 逻辑无需改动（开闭原则）。
 */

import type { DbDialect } from './types';

export interface SqlDialect {
  readonly name: DbDialect;
  /** 按方言规则引用标识符，并转义内部特殊字符 */
  quoteIdent(name: string): string;
  /** 是否支持 `... RETURNING *` 语法 */
  readonly supportsReturning: boolean;
}

class PostgresDialect implements SqlDialect {
  readonly name: DbDialect = 'postgres';
  readonly supportsReturning = true;

  quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }
}

class SqliteDialect implements SqlDialect {
  readonly name: DbDialect = 'sqlite';
  readonly supportsReturning = true;

  quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }
}

/** MySQL 与 MariaDB 语法一致，共享同一策略实现 */
class MysqlDialect implements SqlDialect {
  readonly name: DbDialect;
  readonly supportsReturning = false;

  constructor(name: DbDialect = 'mysql') {
    this.name = name;
  }

  quoteIdent(name: string): string {
    return `\`${name.replace(/`/g, '``')}\``;
  }
}

export function createDialect(name: DbDialect): SqlDialect {
  switch (name) {
    case 'postgres':
      return new PostgresDialect();
    case 'mysql':
      return new MysqlDialect('mysql');
    case 'mariadb':
      return new MysqlDialect('mariadb');
    case 'sqlite':
      return new SqliteDialect();
  }
}

/** 根据连接串推断方言；无法推断时按 sqlite 处理 */
export function inferDialect(url: string | URL | undefined): DbDialect {
  if (url === undefined) {
    return 'sqlite';
  }
  const text = typeof url === 'string' ? url : url.toString();
  if (/^postgres(ql)?:\/\//i.test(text)) {
    return 'postgres';
  }
  if (/^mysql:/i.test(text)) {
    return 'mysql';
  }
  if (/^mariadb:/i.test(text)) {
    return 'mariadb';
  }
  return 'sqlite';
}
