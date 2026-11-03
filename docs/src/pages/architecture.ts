import type { VNode } from '@geektech/tsone';
import { h } from '@geektech/tsone';
import { codeblock, h2, inline, p, table, ul } from '../components';
import type { PageContext } from '../content';

export function renderBackoneArchitecture(ctx: PageContext): VNode | VNode[] {
  return [
    p(
      'BackOne 推荐把对象作为业务代码的基本单元。Application 拥有资源，Module 按业务边界组合对象；Controller/Gateway 声明协议入口，Service 承担业务规则，Repository 封装数据访问。'
    ),
    codeblock(
      'Application\n  ├─ Module\n  │    └─ Controller / Gateway\n  │         └─ Service\n  │              └─ Repository\n  │                   └─ Database / Table\n  └─ initialize → start → stop',
      'text'
    ),
    h2('职责与依赖'),
    table(
      ['对象', '负责', '依赖'],
      [
        [
          ['Application'],
          ['配置、组装、资源生命周期'],
          ['BackOneServer、数据库、业务对象'],
        ],
        [
          ['Module'],
          ['业务对象组合、子模块导入与前缀'],
          ['Controller/Gateway、子模块'],
        ],
        [
          ['Controller'],
          ['HTTP 路由、参数、校验、状态、业务错误映射'],
          ['Service、Context'],
        ],
        [
          ['Gateway'],
          ['升级策略与 WebSocket 生命周期'],
          ['Service、WebSocket'],
        ],
        [
          ['Service'],
          ['业务规则、领域错误、跨 Repository 协调'],
          ['Repository'],
        ],
        [['Repository'], ['业务查询、写入、数据映射'], ['Database、Table']],
      ]
    ),
    p(
      '依赖用构造函数传入。已有 BackOneServer、DatabaseManager、Database、Table 均可直接 new；业务 Repository 组合这些类即可，无须继承框架基类、自动扫描或反射 DI。Service 不接收 Context，Repository 不依赖 HTTP。'
    ),
    p(
      '标准装饰器参数在类定义期求值，不能读取构造器稍后注入的 this。应用拥有认证/限流/缓存后端时，可用小型类工厂绑定 Service 提供的策略配置；实际逻辑和可变状态仍放在注入的 Service/Repository。demo 的策略示例采用此方式。'
    ),
    h2('创建统一类模板'),
    codeblock(
      'bunx @geektech/backone-cli init my-api --template rest-api\ncd my-api\nbun run typecheck\nbun run dev',
      'sh'
    ),
    p(
      '三个模板统一使用类和业务模块：minimal 为 modules/home；rest-api 的 modules/users 就近包含 Module、Controller、Service、Repository、模型和 Schema；websocket 的 modules/chat 包含 Module、Gateway 和 Service，并提供浏览器客户端。要求 Bun >=1.3.10、TypeScript >=5.2，使用标准装饰器。'
    ),
    codeblock(
      'src/\n  index.ts\n  app.ts\n  modules/users/\n    users-module.ts\n    users-controller.ts\n    users-service.ts\n    users-repository.ts\n    user.ts\n    user-schema.ts\n  middlewares/request-id.ts',
      'text'
    ),
    p(
      '框架函数式 API 继续兼容。CLI 不再生成函数式模板；旧 --style functional 会在写文件前提示迁移，--style controller 仍可显式指定，单独使用时兼容选择 REST。'
    ),
    h2('用 @Module 声明业务组成'),
    p(
      'Module<T> 接受 prefix 和 imports/controllers/gateways selectors，注册时从当前实例取得组成对象。Application 通过 registerModules 一次挂载。Selector 只负责声明，构造器仍负责依赖注入，Application 仍负责资源生命周期。'
    ),
    codeblock(`@Module<UsersModule>({
  prefix: '/api',
  controllers: (module) => [module.controller],
})
class UsersModule {
  readonly controller: UsersController;
  constructor(database: Database) {
    const repository = new UsersRepository(database);
    this.controller = new UsersController(new UsersService(repository));
  }
}

registerModules(server, [new UsersModule(database)]);`),
    p([
      '此片段使用业务项目中定义的类；完整例子与嵌套、去重、失败行为见 ',
      h('a', { href: ctx.href('/backone/modules') }, ['业务模块']),
      '。',
    ]),
    h2('Repository 组合数据库对象'),
    codeblock(repositoryExample),
    p(
      'Repository 借用数据库，Application 才拥有连接并负责关闭。事务内必须使用回调提供的 tx 创建 Repository；复用事务外的实例仍会操作原连接。多个数据库之间的写入不是一个原子事务。以上 DDL 使用 SQLite 语法，其他方言需替换。'
    ),
    h2('应用生命周期与测试'),
    codeblock(`import { Application } from './src/app';

const application = new Application({ databaseUrl: ':memory:' });
try {
  await application.initialize();
  const response = await application.server.handle(
    new Request('http://localhost/api/users')
  );
  console.log(await response.json());
} finally {
  await application.stop();
}`),
    ul([
      '导入和构造不监听或建表。initialize 准备表与种子；start 自动等待初始化再监听。',
      '并发初始化共享结果；stop 可重复调用并释放服务和数据库，关闭后需创建新应用。',
      'REST 默认内存 SQLite；databaseUrl: ./app.db 可持久化。不同应用默认隔离；显式使用相同文件会共享数据。',
      '实例跨请求复用；请求状态保存在 ctx，连接状态保存在 ws.data，避免写入共享 Controller/Service 字段。',
    ]),
    h2('演练项目'),
    p([
      '仓库 ',
      inline('playground/backone-demo'),
      ' 使用 DemoApplication 组装 framework、tasks、tools 和装饰器策略模块，保留任务 CRUD、双库审计、事务、工具、SSE 和 WebSocket。导入 src/app.ts 后可通过 server.handle 验证接口，无需启动端口。',
    ]),
    p([
      '继续阅读 ',
      h('a', { href: ctx.href('/backone/modules') }, ['业务模块']),
      '、',
      h('a', { href: ctx.href('/backone/decorators') }, ['系统装饰器']),
      '、',
      h('a', { href: ctx.href('/utils/db') }, ['数据库']),
      ' 和 ',
      h('a', { href: ctx.href('/cli/templates') }, ['模板结构']),
      '。',
    ]),
  ];
}

const repositoryExample = `import { Database, type Table } from '@geektech/backone-utils';

interface Note { id: number; title: string }

class NotesRepository {
  private readonly notes: Table<Note>;
  constructor(database: Database) {
    this.notes = database.table<Note>('notes');
  }
  list(): Promise<Note[]> {
    return this.notes.findMany({ orderBy: { id: 'asc' } });
  }
  create(title: string): Promise<Note | null> {
    return this.notes.insert({ title });
  }
}

class NotesService {
  constructor(private readonly notes: NotesRepository) {}
  create(title: string): Promise<Note | null> {
    const normalized = title.trim();
    if (!normalized) throw new Error('title is required');
    return this.notes.create(normalized);
  }
}

const database = new Database({ url: ':memory:' });
try {
  await database.raw(\`CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL
  )\`);
  const service = new NotesService(new NotesRepository(database));
  await service.create('First note');
  await database.transaction(async (tx) => {
    const notes = new NotesRepository(tx);
    await notes.create('Second note');
    await notes.create('Third note');
  });
  console.log(await new NotesRepository(database).list());
} finally {
  await database.close();
}`;
