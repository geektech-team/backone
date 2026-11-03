import {
  type Database,
  type InsertRow,
  type Table,
} from '@geektech/backone-utils';
import type { Task } from './models';

/** 组合 Table；事务内通过 new TasksRepository(tx) 使用事务连接。 */
export class TasksRepository {
  private readonly table: Table<Task>;

  constructor(private readonly database: Database) {
    this.table = database.table<Task>('tasks');
  }

  async initialize(): Promise<void> {
    await this.database.raw(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`);
    await this.database.transaction(async (tx) => {
      const tasks = new TasksRepository(tx);
      if ((await tasks.table.count()) === 0) {
        const now = new Date().toISOString();
        await tasks.table.insertMany([
          { title: '学习 backone-utils 的 CRUD', done: 1, created_at: now },
          { title: '演示多库连接（主库 + 审计库）', done: 0, created_at: now },
          { title: '体验 where DSL 与事务', done: 0, created_at: now },
        ]);
      }
    });
  }

  list(query?: string, limit = 50): Promise<Task[]> {
    return this.table.findMany({
      where: query ? { title: { like: `%${query}%` } } : undefined,
      orderBy: { id: 'desc' },
      limit,
    });
  }

  find(id: number): Promise<Task | null> {
    return this.table.findById(id);
  }

  create(input: InsertRow<Task, 'id'>): Promise<Task | null> {
    return this.table.insert(input);
  }

  update(id: number, input: Partial<Task>) {
    return this.table.update(input, { id });
  }

  remove(id: number) {
    return this.table.delete({ id });
  }

  transaction<T>(work: (tasks: TasksRepository) => Promise<T>): Promise<T> {
    return this.database.transaction((tx) => work(new TasksRepository(tx)));
  }
}
