/**
 * 查询构建：把 where DSL / orderBy 翻译成参数化 SQL 片段。
 *
 * 所有值一律通过 `?` 占位符绑定（由 Bun.SQL 统一参数化，跨方言安全），
 * 表名 / 列名经方言 quoteIdent 引用，避免拼接注入。
 */

import type { OrderBy, SortOrder, Where, WhereOperator } from './types';

const OPERATOR_KEYS = new Set([
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'notLike',
  'in',
  'notIn',
  'isNull',
  'between',
]);

function isWhereOperator(value: unknown): value is WhereOperator {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => OPERATOR_KEYS.has(key));
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

/** 构建器只依赖「按方言引用标识符」能力，任何满足该接口的对象（如 Database）均可使用 */
export interface IdentQuoter {
  quoteIdent(name: string): string;
}

/**
 * 构建 `WHERE ...` 片段（不含 WHERE 关键字），并顺带把绑定值写入 params。
 */
export function buildWhereClause<T extends object>(
  dialect: IdentQuoter,
  where: Where<T>,
  params: unknown[]
): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(where)) {
    if (key === 'AND' || key === 'OR') {
      continue;
    }
    parts.push(buildCondition(dialect, key, value, params));
  }

  if (where.AND && where.AND.length > 0) {
    for (const group of where.AND) {
      parts.push(`(${buildWhereClause(dialect, group, params)})`);
    }
  }

  if (where.OR && where.OR.length > 0) {
    const orParts = where.OR.map(
      (group) => `(${buildWhereClause(dialect, group, params)})`
    );
    parts.push(`(${orParts.join(' OR ')})`);
  }

  return parts.join(' AND ');
}

function buildCondition(
  dialect: IdentQuoter,
  key: string,
  value: unknown,
  params: unknown[]
): string {
  const column = dialect.quoteIdent(key);

  if (isWhereOperator(value)) {
    const parts: string[] = [];

    if (Object.prototype.hasOwnProperty.call(value, 'eq')) {
      if (value.eq === null) {
        parts.push(`${column} IS NULL`);
      } else if (value.eq !== undefined) {
        parts.push(`${column} = ?`);
        params.push(value.eq);
      }
    }
    if (value.ne !== undefined) {
      parts.push(`${column} <> ?`);
      params.push(value.ne);
    }
    if (value.gt !== undefined) {
      parts.push(`${column} > ?`);
      params.push(value.gt);
    }
    if (value.gte !== undefined) {
      parts.push(`${column} >= ?`);
      params.push(value.gte);
    }
    if (value.lt !== undefined) {
      parts.push(`${column} < ?`);
      params.push(value.lt);
    }
    if (value.lte !== undefined) {
      parts.push(`${column} <= ?`);
      params.push(value.lte);
    }
    if (value.like !== undefined) {
      parts.push(`${column} LIKE ?`);
      params.push(value.like);
    }
    if (value.notLike !== undefined) {
      parts.push(`${column} NOT LIKE ?`);
      params.push(value.notLike);
    }
    if (value.in !== undefined) {
      if (value.in.length === 0) {
        parts.push('1 = 0');
      } else {
        parts.push(`${column} IN (${placeholders(value.in.length)})`);
        params.push(...value.in);
      }
    }
    if (value.notIn !== undefined) {
      if (value.notIn.length === 0) {
        parts.push('1 = 1');
      } else {
        parts.push(`${column} NOT IN (${placeholders(value.notIn.length)})`);
        params.push(...value.notIn);
      }
    }
    if (value.isNull !== undefined) {
      parts.push(value.isNull ? `${column} IS NULL` : `${column} IS NOT NULL`);
    }
    if (value.between !== undefined) {
      parts.push(`${column} BETWEEN ? AND ?`);
      params.push(value.between[0], value.between[1]);
    }

    return parts.join(' AND ');
  }

  if (value === null || value === undefined) {
    return `${column} IS NULL`;
  }

  params.push(value);
  return `${column} = ?`;
}

/** 构建 `ORDER BY ...` 片段（不含 ORDER BY 关键字） */
export function buildOrderBy<T extends object>(
  dialect: IdentQuoter,
  orderBy: OrderBy<T> | readonly OrderBy<T>[]
): string {
  const list = Array.isArray(orderBy) ? orderBy : [orderBy];
  return list
    .map((item) => {
      if (typeof item === 'string') {
        return `${dialect.quoteIdent(item)} ASC`;
      }
      return Object.entries(item)
        .map(
          ([column, direction]) =>
            `${dialect.quoteIdent(column)} ${normalizeSort(direction as SortOrder | undefined)}`
        )
        .join(', ');
    })
    .join(', ');
}

function normalizeSort(direction: SortOrder | undefined): SortOrder {
  return direction === 'desc' ? 'desc' : 'asc';
}
