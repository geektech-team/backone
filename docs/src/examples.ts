/** 可直接运行的类应用示例。 */
export const minimalClassExample = `import { BackOneServer, type Context } from '@geektech/backone';
import { Controller, Get, Module, registerModules } from '@geektech/backone/decorators';

@Controller()
class HomeController {
  @Get('/')
  index() {
    return 'Hello, BackOne!';
  }

  @Get('/hello/:name')
  hello(ctx: Context) {
    return \`hello, \${ctx.params.name}\`;
  }
}

@Module<HomeModule>({ controllers: (module) => [module.controller] })
class HomeModule {
  readonly controller = new HomeController();
}

class Application {
  readonly server = new BackOneServer({ port: 3000 });

  constructor() {
    this.server.useLogger();
    registerModules(this.server, [new HomeModule()]);
  }

  start(): Promise<number> {
    return this.server.listen();
  }

  stop(): Promise<void> {
    return this.server.close();
  }
}

const application = new Application();
await application.start();`;
