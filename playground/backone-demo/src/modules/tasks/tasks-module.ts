import { Module } from '@geektech/backone/decorators';
import type { DemoDatabases } from '../../db';
import { AuditRepository } from './audit-repository';
import { TasksController } from './tasks-controller';
import { TasksRepository } from './tasks-repository';
import { TasksService } from './tasks-service';

@Module<TasksModule>({
  prefix: '/api',
  controllers: (module) => [module.controller],
})
export class TasksModule {
  readonly controller: TasksController;
  private readonly tasks: TasksRepository;
  private readonly audit: AuditRepository;
  private initializing?: Promise<void>;

  constructor(databases: DemoDatabases) {
    this.tasks = new TasksRepository(databases.manager.get('main'));
    this.audit = new AuditRepository(databases.manager.get('audit'));
    this.controller = new TasksController(
      new TasksService(this.tasks, this.audit),
      databases
    );
  }

  /** 模块只借用应用的连接；由 Application 显式调用初始化。 */
  initialize(): Promise<void> {
    return (this.initializing ??= (async () => {
      await this.tasks.initialize();
      await this.audit.initialize();
    })());
  }
}
