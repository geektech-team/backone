/**
 * DatabaseManager：多库连接管理。
 *
 * 组合关系：DatabaseManager 聚合（持有）一组具名 Database，负责注册、
 * 解析与统一关闭。典型用法：
 *
 * ```ts
 * const db = new DatabaseManager();
 * db.register('primary', { url: process.env.PRIMARY_DB_URL });
 * db.register('analytics', { url: process.env.ANALYTICS_DB_URL, dialect: 'mysql' });
 *
 * const users = db.get('primary').table<User>('users');
 * ```
 */

import { BackoneDbError } from './errors';
import { Database } from './database';
import type { DbConnectionOptions } from './types';

export class DatabaseManager {
  readonly #databases = new Map<string, Database>();

  /**
   * 注册一个具名数据库并返回其实例。
   * 重复注册同名数据库会抛出 DB_ALREADY_REGISTERED。
   */
  register(name: string, options: DbConnectionOptions = {}): Database {
    if (this.#databases.has(name)) {
      throw new BackoneDbError(
        `database "${name}" is already registered`,
        'DB_ALREADY_REGISTERED'
      );
    }
    const db = new Database({ ...options, name });
    this.#databases.set(name, db);
    return db;
  }

  /** 获取具名数据库；未注册时抛出 DB_NOT_FOUND */
  get(name: string): Database {
    const db = this.#databases.get(name);
    if (db === undefined) {
      throw new BackoneDbError(
        `database "${name}" is not registered`,
        'DB_NOT_FOUND'
      );
    }
    return db;
  }

  /** 是否已注册 */
  has(name: string): boolean {
    return this.#databases.has(name);
  }

  /** 已注册的库名列表 */
  names(): string[] {
    return [...this.#databases.keys()];
  }

  /** 已注册的数据库实例列表 */
  list(): Database[] {
    return [...this.#databases.values()];
  }

  /** 关闭并移除单个数据库；未注册时返回 false */
  async remove(name: string): Promise<boolean> {
    const db = this.#databases.get(name);
    if (db === undefined) {
      return false;
    }
    this.#databases.delete(name);
    await db.close();
    return true;
  }

  /** 关闭并清空全部数据库 */
  async close(): Promise<void> {
    const databases = [...this.#databases.values()];
    this.#databases.clear();
    await Promise.all(databases.map((db) => db.close()));
  }
}

/** 创建单个（不注册进 Manager 的）数据库连接 */
export function createDatabase(options: DbConnectionOptions = {}): Database {
  return new Database(options);
}
