/** Shared generated lifecycle; initialization/start/stop coordinate ownership. */
export const lifecycleFields = `  private initializing?: Promise<this>;
  private starting?: Promise<number>;
  private stopping?: Promise<void>;
  private disposing?: Promise<void>;
  private stopped = false;
`;

export const lifecycleMethods = `  initialize(): Promise<this> {
    if (this.stopped) return Promise.reject(new Error('Application is closed'));
    return this.initializing ??= this.initializeResources()
      .then(() => {
        if (this.stopped) throw new Error('Application is closed');
        return this;
      })
      .catch(async (error: unknown) => {
        this.stopped = true;
        await this.dispose();
        throw error;
      });
  }

  start(): Promise<number> {
    if (this.stopped) return Promise.reject(new Error('Application is closed'));
    return this.starting ??= (async () => {
      try {
        await this.initialize();
        if (this.stopped) throw new Error('Application is closed');
        return await this.server.listen();
      } catch (error) {
        this.stopped = true;
        await this.dispose();
        throw error;
      }
    })();
  }

  stop(): Promise<void> {
    this.stopped = true;
    return this.stopping ??= (async () => {
      await this.initializing?.catch(() => undefined);
      await this.starting?.catch(() => undefined);
      await this.dispose();
    })();
  }
`;

export const index = `import { Application } from './app';

const app = new Application();
const shutdown = () => { void app.stop(); };
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

try {
  const port = await app.start();
  console.log(\`Server running at http://127.0.0.1:\${port}\`);
} catch (error) {
  await app.stop();
  throw error;
}
`;

export const minimalApp = `import { BackOneServer, type AppOptions } from '@geektech/backone';
import { registerModules } from '@geektech/backone/decorators';
import { HomeModule } from './modules/home/home-module';

export type ApplicationOptions = AppOptions;

export class Application {
  readonly server: BackOneServer;
${lifecycleFields}
  constructor(options: ApplicationOptions = {}) {
    this.server = new BackOneServer({ port: 3000, ...options });
    registerModules(this.server, [new HomeModule()]);
  }

${lifecycleMethods}
  private async initializeResources(): Promise<void> {}

  private dispose(): Promise<void> {
    return this.disposing ??= this.server.close();
  }
}
`;

export const homeController = `import { Controller, Get } from '@geektech/backone/decorators';

@Controller()
export class HomeController {
  @Get()
  index(): string {
    return 'Hello, BackOne!';
  }
}
`;

export const homeModule = `import { Module } from '@geektech/backone/decorators';
import { HomeController } from './home-controller';

@Module<HomeModule>({ controllers: (module) => [module.controller] })
export class HomeModule {
  readonly controller = new HomeController();
}
`;
