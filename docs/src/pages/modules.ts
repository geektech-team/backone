import type { VNode } from '@geektech/tsone';
import { h } from '@geektech/tsone';
import { codeblock, h2, inline, p, table, ul } from '../components';
import type { PageContext } from '../content';

export function renderBackoneModules(ctx: PageContext): VNode | VNode[] {
  return [
    p(
      '模块是业务边界。同一业务的 Controller、Gateway、Service、Repository、模型和 Schema 放在 modules/<feature>/ 内；Module 类显式组装这些对象，Application 通过 registerModules 统一挂载。'
    ),
    h2('目录按业务组织'),
    codeblock(
      `src/
  app.ts
  modules/
    users/
      users-module.ts
      users-controller.ts
      users-service.ts
      users-repository.ts
      user.ts
      user-schema.ts
    chat/
      chat-module.ts
      chat-gateway.ts
      chat-service.ts
  middlewares/request-id.ts`,
      'text'
    ),
    p(
      '业务内的文件就近引用。只有真正跨模块通用的中间件、配置或基础设施放在公共目录；模块之间通过构造函数传入需要的对象，避免依赖另一个模块的内部文件。'
    ),
    h2('完整示例'),
    p(
      '以下例子不监听端口，可直接运行。Repository 使用实例内存数据，实际数据库 Repository 可组合 Database/Table。模块的 selectors 在注册时取得当前实例，能读取构造函数已经注入的依赖。'
    ),
    codeblock(moduleExample),
    h2('ModuleOptions<T>'),
    codeblock(`interface ModuleOptions<T extends object> {
  readonly prefix?: string;
  readonly imports?: (module: T) => readonly object[];
  readonly controllers?: (module: T) => readonly object[];
  readonly gateways?: (module: T) => readonly object[];
}

// 均从 @geektech/backone/decorators 导入
// Module、registerModules
// 类型：ModuleOptions、ModuleDescription、ModuleRegistration`),
    table(
      ['字段', '约定'],
      [
        [
          [inline('prefix')],
          [
            '可选的静态挂载前缀，可含多段；空字符串和 / 均表示无前缀。禁止 query/hash、动态参数和通配符。',
          ],
        ],
        [
          [inline('imports')],
          [
            '返回显式构造的子模块实例，按数组顺序深度优先注册，子模块先于当前模块。',
          ],
        ],
        [
          [inline('controllers')],
          ['返回本模块的 @Controller 实例。框架不自动 new、不推断构造参数。'],
        ],
        [
          [inline('gateways')],
          ['返回本模块的 @WebSocket 实例，沿用网关的精确路径和生命周期约定。'],
        ],
      ]
    ),
    p(
      '每个 selector 都是同步函数，对每个新模块实例最多求值一次，返回对象数组。Promise、非数组、非对象成员会在写入路由前报错。不要在 selector 中打开连接、注册路由或产生其他外部副作用；框架无法回滚这些业务副作用。'
    ),
    h2('嵌套与前缀'),
    codeblock(`@Module<AppModule>({
  prefix: '/v1',
  imports: (module) => [module.users],
})
class AppModule {
  constructor(readonly users: UsersModule) {}
}

// 延续上例的 UsersModule(prefix: /api) 和 UsersController(/users)
registerModules(app, [
  new AppModule(new UsersModule(new UsersRepository(['Bob']))),
]);
// 新增 GET /v1/api/users；导入并不自动复用之前创建的实例。`),
    p(
      '最终路径依次叠加：app 当前前缀 → 父模块 prefix → 当前模块 prefix → Controller/Gateway 路径。注册结束或失败后 app.prefix 恢复原值；模块不会永久修改 Application 的后续路由前缀。'
    ),
    h2('去重、冲突与失败行为'),
    ul([
      '每个模块实例必须有自己的 @Module 声明；继承已装饰类不会自动获得模块身份。重复 @Module 声明报错。',
      '同一 app 中，同一实例以同一有效前缀导入会去重；跨 registerModules 调用也是幂等的。菱形导入共享实例只挂载一次。',
      '同一实例以不同有效前缀挂载会报错。需要两个挂载点时显式创建两个模块实例；同类的不同实例允许注册，实际路由冲突仍然报错。',
      '循环导入会报错，不会被去重隐藏。模块实例去重不等于 Controller/Gateway 去重；重复声明的端点仍由原有检测规则处理。',
      '先检查整个模块图及所有 HTTP/WS 声明，再统一写入。循环、错误 selector、重复路由、冲突参数名或重复 WS 路径不会留下部分注册。',
      '模块注册与 registerControllers/registerWebSockets 共用检测状态。HTTP 与既有函数式路由的冲突边界沿用直接注册 API，避免混合声明同一个端点。',
    ]),
    h2('返回清单'),
    codeblock(`const registration = registerModules(app, instances);

registration.modules;  // readonly { name: string; prefix: string }[]
registration.routes;   // readonly ControllerRoute[]
registration.gateways; // readonly WebSocketGateway[]`),
    p(
      '返回的对象、数组和描述项均冻结，只含本次新增注册。modules 按子模块优先顺序列出类名和包含 app 前缀的有效 prefix；没有前缀时 prefix 为空字符串。routes 和 gateways 沿用既有清单格式，path 是完整路径。清单不暴露可变模块实例；幂等重复挂载返回空清单。'
    ),
    h2('依赖与生命周期'),
    p(
      'Module 声明组成和挂载，不提供自动扫描、providers 容器或隐式初始化/关闭。Service、Repository 在模块构造函数中显式创建和注入；Application 拥有数据库及服务器，负责 initialize/start/stop。模块可以暴露显式 initialize 方法，由 Application 调用。'
    ),
    p(
      'Controller/Gateway 继续声明 @Use、@Authorize、@RateLimit 等策略，执行顺序不变。模块、服务和控制器可跨请求复用，请求状态放在 ctx，连接状态放在 ws.data。推荐每个 Application 创建独立模块实例；显式跨 app 共享实例时，其业务状态也会共享。'
    ),
    p([
      '三个 CLI 模板和 demo 均按业务模块组织。继续阅读 ',
      h('a', { href: ctx.href('/cli/templates') }, ['模板结构']),
      '、',
      h('a', { href: ctx.href('/backone/architecture') }, ['对象优先开发']),
      ' 和 ',
      h('a', { href: ctx.href('/backone/decorators') }, [
        'Controller/Gateway 装饰器',
      ]),
      '。',
    ]),
  ];
}

export const moduleExample = `import { BackOneServer } from '@geektech/backone';
import {
  Controller, Get, Module, registerModules,
} from '@geektech/backone/decorators';

class UsersRepository {
  constructor(private readonly names: readonly string[]) {}
  list(): string[] { return [...this.names]; }
}

class UsersService {
  constructor(private readonly users: UsersRepository) {}
  list(): string[] { return this.users.list(); }
}

@Controller('/users')
class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  list(): string[] { return this.users.list(); }
}

@Module<UsersModule>({
  prefix: '/api',
  controllers: (module) => [module.controller],
})
class UsersModule {
  readonly controller: UsersController;
  constructor(repository: UsersRepository) {
    this.controller = new UsersController(new UsersService(repository));
  }
}

const app = new BackOneServer();
const users = new UsersModule(new UsersRepository(['Alice']));
const registration = registerModules(app, [users]);
const response = await app.handle(new Request('http://localhost/api/users'));
console.log(await response.json()); // ['Alice']
console.table(registration.modules);
await app.close();`;
