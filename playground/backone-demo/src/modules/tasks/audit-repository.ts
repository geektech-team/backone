import { type Database, type Table } from '@geektech/backone-utils';
import type { AuditLog } from './models';

export class AuditRepository {
  private readonly table: Table<AuditLog>;

  constructor(private readonly database: Database) {
    this.table = database.table<AuditLog>('audit_logs');
  }

  async initialize(): Promise<void> {
    await this.database.raw(`CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      task_id INTEGER,
      created_at TEXT NOT NULL
    )`);
  }

  list(): Promise<AuditLog[]> {
    return this.table.findMany({ orderBy: { id: 'desc' }, limit: 20 });
  }

  record(action: string, taskId: number | null): Promise<AuditLog | null> {
    return this.table.insert({
      action,
      task_id: taskId,
      created_at: new Date().toISOString(),
    });
  }
}
