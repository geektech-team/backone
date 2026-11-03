import { DemoError } from '../../errors';
import type { Task } from './models';
import type { AuditRepository } from './audit-repository';
import type { TasksRepository } from './tasks-repository';

export interface TaskInput {
  title?: string;
  done?: boolean;
}

export class TasksService {
  constructor(
    private readonly tasks: TasksRepository,
    private readonly audit: AuditRepository
  ) {}

  async list(query?: string, limit = 50) {
    const items = await this.tasks.list(query, limit);
    return { total: items.length, items };
  }

  async find(id: number): Promise<Task> {
    const task = await this.tasks.find(id);
    if (!task) throw new DemoError('NOT_FOUND', `task ${id} not found`);
    return task;
  }

  async create(input: TaskInput) {
    const title = input.title?.trim() ?? '';
    if (!title) throw new DemoError('INVALID_INPUT', 'title is required');
    const created = await this.tasks.create({
      title,
      done: input.done ? 1 : 0,
      created_at: new Date().toISOString(),
    });
    await this.audit.record('task.create', created?.id ?? null);
    return created;
  }

  async update(id: number, input: TaskInput) {
    const partial: Partial<Task> = {};
    if (input.title !== undefined) partial.title = input.title;
    if (input.done !== undefined) partial.done = input.done ? 1 : 0;
    const result = await this.tasks.update(id, partial);
    if (result.count === 0)
      throw new DemoError('NOT_FOUND', `task ${id} not found`);
    await this.audit.record('task.update', id);
    return result;
  }

  async remove(id: number) {
    const result = await this.tasks.remove(id);
    if (result.count === 0)
      throw new DemoError('NOT_FOUND', `task ${id} not found`);
    await this.audit.record('task.delete', id);
    return { deleted: result.count };
  }

  async batch(input: readonly string[]) {
    const titles = input.map((title) => title.trim()).filter(Boolean);
    if (titles.length === 0)
      throw new DemoError('INVALID_INPUT', 'titles is required');
    const items = await this.tasks.transaction(async (tasks) => {
      const rows: Task[] = [];
      for (const title of titles) {
        const row = await tasks.create({
          title,
          done: 0,
          created_at: new Date().toISOString(),
        });
        if (row) rows.push(row);
      }
      return rows;
    });
    // 主库事务结束后记录第二个库；两个库之间不是分布式事务。
    await this.audit.record('task.batch', null);
    return { inserted: items.length, items };
  }

  async logs() {
    const logs = await this.audit.list();
    return { total: logs.length, logs };
  }
}
