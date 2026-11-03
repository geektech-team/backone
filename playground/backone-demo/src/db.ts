import { DatabaseManager } from '@geektech/backone-utils';

export type { Task, AuditLog } from './modules/tasks/models';

/** 应用拥有连接；Repository 仅借用，不负责关闭。业务 DDL 和种子由模块初始化。 */
export class DemoDatabases {
  readonly manager = new DatabaseManager();

  constructor(private readonly url?: string) {}

  async initialize(): Promise<void> {
    this.manager.register('main', {
      url: this.url ?? process.env.BACKONE_DEMO_DATABASE_URL ?? ':memory:',
    });
    this.manager.register('audit', { url: ':memory:' });
  }

  status() {
    return {
      databases: this.manager.names(),
      status: Object.fromEntries(
        this.manager
          .list()
          .map((database) => [
            database.name,
            { dialect: database.dialect, closed: database.isClosed },
          ])
      ),
    };
  }

  close(): Promise<void> {
    return this.manager.close();
  }
}
