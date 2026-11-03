import { BackOneServer, type AppOptions } from '@geektech/backone';
import { registerModules } from '@geektech/backone/decorators';
import { DemoDatabases } from './db';
import { FrameworkModule } from './modules/framework/framework-module';
import { StreamsService } from './modules/framework/streams-service';
import { TasksModule } from './modules/tasks/tasks-module';
import { ToolsModule } from './modules/tools/tools-module';
import { ControllerDemoModule } from './modules/controller-demo/controller-demo-module';
import { requestTiming } from './middlewares/request-timing';
import { domainErrors } from './middlewares/domain-errors';

export interface DemoApplicationOptions extends AppOptions {
  databaseUrl?: string;
  logger?: boolean;
}

/** 唯一组装入口，拥有 server/数据库/流的生命周期；构造时不打开资源。 */
export class DemoApplication {
  readonly server: BackOneServer;
  readonly databases: DemoDatabases;
  private readonly streams = new StreamsService();
  private readonly controllerDemo = new ControllerDemoModule();
  private initializing?: Promise<this>;
  private starting?: Promise<number>;
  private stopping?: Promise<void>;
  private disposing?: Promise<void>;
  private stopped = false;

  constructor(private readonly options: DemoApplicationOptions = {}) {
    const { databaseUrl, ...serverOptions } = options;
    this.server = new BackOneServer({
      port: 5390,
      development: true,
      ...serverOptions,
    });
    this.databases = new DemoDatabases(databaseUrl);
  }

  initialize(): Promise<this> {
    if (this.stopped)
      return Promise.reject(new Error('DemoApplication is closed'));
    if (this.initializing) return this.initializing;
    this.initializing = this.initializeResources();
    return this.initializing;
  }

  private async initializeResources(): Promise<this> {
    try {
      await this.databases.initialize();
      if (this.stopped) throw new Error('DemoApplication is closed');
      const server = this.server;
      server.use(domainErrors);
      if (this.options.logger !== false) server.useLogger();
      server.useCors();
      server.useGzip();
      server.useHelmet();
      server.useTimeout({ ms: 5000 });
      server.use(requestTiming);
      server.serveStatic('/static', `${import.meta.dir}/../public`, {
        cacheControl: 'public, max-age=3600',
        index: 'index.html',
      });
      const tasks = new TasksModule(this.databases);
      await tasks.initialize();
      if (this.stopped) throw new Error('DemoApplication is closed');
      const tools = new ToolsModule(() => {
        const port = server.port;
        if (port === null)
          throw new Error(
            'Start DemoApplication before using the HTTP client demo'
          );
        return `http://127.0.0.1:${port}`;
      });
      registerModules(server, [
        new FrameworkModule(this.streams),
        tasks,
        tools,
        this.controllerDemo,
      ]);
      return this;
    } catch (error) {
      this.stopped = true;
      await this.dispose();
      throw error;
    }
  }

  start(): Promise<number> {
    if (this.stopped)
      return Promise.reject(new Error('DemoApplication is closed'));
    if (this.starting) return this.starting;
    this.starting = (async () => {
      try {
        await this.initialize();
        if (this.stopped) throw new Error('DemoApplication is closed');
        return await this.server.listen();
      } catch (error) {
        this.stopped = true;
        await this.dispose();
        throw error;
      }
    })();
    return this.starting;
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopped = true;
    this.stopping = (async () => {
      await this.initializing?.catch(() => {});
      await this.starting?.catch(() => {});
      await this.dispose();
    })();
    return this.stopping;
  }

  private dispose(): Promise<void> {
    if (this.disposing) return this.disposing;
    this.disposing = (async () => {
      this.streams.close();
      try {
        await this.server.close();
      } finally {
        await this.databases.close();
      }
    })();
    return this.disposing;
  }
}
