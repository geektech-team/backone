/**
 * 数据库演示：双库连接（主库 tasks + 审计库 audit_logs）。
 *
 * 默认使用 SQLite 内存库，零配置即可运行；设置环境变量
 * BACKONE_DEMO_DATABASE_URL 可将主库切换到 PostgreSQL / MySQL
 * （注意：下方建表 DDL 为 SQLite 语法，切换方言后需替换为对应 DDL）。
 */

import { DatabaseManager } from '@geektech/backone-utils';

export interface Task {
  id: number;
  title: string;
  done: number;
  created_at: string;
}

export interface AuditLog {
  id: number;
  action: string;
  task_id: number | null;
  created_at: string;
}

export const db = new DatabaseManager();

const TASK_TABLE = `
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )
`;

const AUDIT_TABLE = `
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    task_id INTEGER,
    created_at TEXT NOT NULL
  )
`;

/** 注册主库 + 审计库、建表并写入种子数据 */
export async function setupDatabases(): Promise<void> {
  db.register('main', {
    url: process.env.BACKONE_DEMO_DATABASE_URL ?? ':memory:',
  });
  db.register('audit', { url: ':memory:' });

  const main = db.get('main');
  const audit = db.get('audit');

  await main.raw(TASK_TABLE);
  await audit.raw(AUDIT_TABLE);

  const tasks = main.table<Task>('tasks');
  if ((await tasks.count()) === 0) {
    const now = new Date().toISOString();
    await tasks.insertMany([
      { title: '学习 backone-utils 的 CRUD', done: 1, created_at: now },
      { title: '演示多库连接（主库 + 审计库）', done: 0, created_at: now },
      { title: '体验 where DSL 与事务', done: 0, created_at: now },
    ]);
  }
}

/** 写入审计日志（独立于主库的第二个数据库） */
export function writeAudit(
  action: string,
  taskId: number | null
): Promise<AuditLog | null> {
  return db.get('audit').table<AuditLog>('audit_logs').insert({
    action,
    task_id: taskId,
    created_at: new Date().toISOString(),
  });
}
