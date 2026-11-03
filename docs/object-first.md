# 对象优先开发

BackOne 推荐按业务划分 Module，将同一业务的路由、服务、数据访问、模型和校验
就近放在 `modules/<feature>/`。模块用 `@Module` 声明组成，依赖通过构造函数显式组合。

```text
Application（组装与资源所有权）
  ├─ Module（业务边界）
  │    └─ Controller / Gateway（HTTP / WebSocket 协议）
  │         └─ Service（业务规则与协调）
  │              └─ Repository（业务数据访问）
  │                   └─ Database / Table（数据库能力）
  └─ initialize → start → stop（资源生命周期）
```

框架已经提供 `BackOneServer`，工具包已经提供 `DatabaseManager`、`Database`
和 `Table`，业务 Repository 直接组合这些类。无需继承框架基类、使用反射容器
或添加没有行为的 `@Service` / `@Repository` 装饰器。

## 从模板开始

```sh
bunx @geektech/backone-cli init my-api --template rest-api
cd my-api
bun run typecheck
bun run dev
```

所有模板默认使用类和业务模块。`minimal` 的 `modules/home` 包含 HomeModule
和 HomeController；`rest-api` 的 `modules/users` 提供 UsersModule、用户 CRUD
和 SQLite；`websocket` 的 `modules/chat` 提供 ChatModule、ChatGateway、ChatService 和
浏览器客户端。`--style controller` 仍可使用，单独指定时兼容选择 REST；
旧 `--style functional` 会在写文件前提示迁移。框架的 `createServer`、
`app.get()`、`app.ws()` 等 API 仍然可用。

要求 Bun >=1.3.10、TypeScript >=5.2。保持 `experimentalDecorators` 和
`emitDecoratorMetadata` 关闭，使用标准装饰器。

REST 目录：

```text
src/
  index.ts                       # new Application().start()
  app.ts                         # 显式组装所有对象，管理生命周期
  modules/users/
    users-module.ts
    users-controller.ts
    users-service.ts
    users-repository.ts
    user.ts
    user-schema.ts
  middlewares/request-id.ts
```

## 各层职责

| 对象        | 负责                                             | 依赖                        |
| ----------- | ------------------------------------------------ | --------------------------- |
| Application | 创建、连接、注册、关闭，配置端口和数据库         | Server、数据库、业务对象    |
| Module      | 组合一个业务的对象、导入子模块、声明挂载前缀     | Controller、Gateway、子模块 |
| Controller  | 路径、参数、校验、状态码、业务错误到 HTTP 的映射 | Service、Context            |
| Gateway     | 升级策略与 WebSocket 生命周期                    | Service、WebSocket          |
| Service     | 业务规则、对象不存在等领域错误、跨数据访问协调   | Repository                  |
| Repository  | SQL / Table 操作、数据库结果到领域数据的转换     | Database、Table             |

Controller 保持简短，例如模板中 POST 方法通过 `@Validate` 读取输入，调用
注入的 Service，并通过 `@Status(201)` 声明响应状态。Service 不接收 Context，
Repository 不抛 HttpError。Controller 把业务错误转换为 HTTP 错误。

实例可以跨请求复用；当前请求的主体、参数、请求 ID 放在 `ctx`，WebSocket
连接状态放在 `ws.data`。不要把这些值写进 Controller / Service 的共享字段。

标准装饰器的参数在类定义时求值，不能直接读取构造器稍后注入的 `this`。
如果认证、缓存、限流后端属于单个应用，可像 demo 一样用小型类工厂绑定
Service 提供的策略配置，再由 Application 注册实例。工厂只负责声明配置，
业务逻辑和可变状态仍放在注入的 Service / Repository 中。

## 通过 Module 包装业务

Module 的 selector 在注册时读取当前实例，因此可以使用已注入的依赖。构造器
负责组装 Service 和 Repository，装饰器只声明哪些端点和子模块属于该业务。
下面的内存例子可以独立运行：

```ts
import { BackOneServer } from '@geektech/backone';
import {
  Controller,
  Get,
  Module,
  registerModules,
} from '@geektech/backone/decorators';

class UsersRepository {
  constructor(private readonly names: readonly string[]) {}
  list(): string[] {
    return [...this.names];
  }
}

class UsersService {
  constructor(private readonly users: UsersRepository) {}
  list(): string[] {
    return this.users.list();
  }
}

@Controller('/users')
class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  list(): string[] {
    return this.users.list();
  }
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
await app.close();
```

Application 用 `registerModules` 替代逐个注册端点。`imports` selector 返回
子模块实例，`controllers` 返回 Controller，`gateways` 返回 WebSocket Gateway。
每个模块必须有自己的 `@Module` 声明；不自动扫描目录，也不自动构造依赖。

注册先检查完整模块图和 HTTP/WS 声明，再统一写入。循环导入、错误 selector、
重复路由、参数名冲突和重复网关不会留下部分注册。同一 app 内，同一模块实例
在同一有效前缀下去重，跨调用幂等；不同前缀需创建新实例。Controller/Gateway
的重复声明不会因模块去重而被隐藏。

前缀依次叠加 app、父模块、当前模块和 Controller/Gateway。空前缀与 `/` 相同；
模块前缀只允许静态路径。Selector 是同步函数，返回对象数组，每个新实例最多
执行一次；其自身外部副作用不在框架回滚范围内。

`registerModules` 返回冻结的 `{ modules, routes, gateways }` 清单，只描述本次
新增注册；`modules` 按子模块优先顺序记录 `{ name, prefix }`，prefix 包含 app
前缀，根前缀为空字符串。routes/gateways 的 path 也是完整路径，不暴露实例。

Module 不隐式初始化或关闭资源，Application 仍负责数据库和服务器生命周期。
需要建表时，可显式调用 `usersModule.initialize()`，再注册模块。模块/Repository
借用数据库连接。`@Use`、`@Authorize` 等策略仍放在 Controller/Gateway。
推荐每个应用创建新的模块实例；显式跨 app 共享实例也会共享它的业务状态。

## 数据库 Repository 与事务

下面是可以独立运行的 SQLite 例子。Repository 借用连接；创建它的调用方
负责关闭。实际项目可将类拆到各自文件。

```ts
import { Database, type Table } from '@geektech/backone-utils';

interface Note {
  id: number;
  title: string;
}

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
  await database.raw(`CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL
  )`);

  const service = new NotesService(new NotesRepository(database));
  await service.create('First note');

  await database.transaction(async (tx) => {
    const notes = new NotesRepository(tx);
    await notes.create('Second note');
    await notes.create('Third note');
    // 此处抛错会回滚本事务两次写入。
  });

  console.log(await new NotesRepository(database).list());
} finally {
  await database.close();
}
```

事务内必须注入回调提供的 `tx`；事务外创建的 Repository 仍然绑定原连接。
多个数据库之间的写入不是一个原子事务，demo 的主库与审计库也遵循此限制。
以上建表 SQL 使用 SQLite 语法，切换到其他数据库需提供对应 DDL。

## 应用生命周期与测试

生成的 REST 应用可以不监听端口直接处理请求：

```ts
import { Application } from './src/app';

const application = new Application({ databaseUrl: ':memory:' });
try {
  await application.initialize();
  const response = await application.server.handle(
    new Request('http://localhost/api/users')
  );
  console.log(await response.json());
} finally {
  await application.stop();
}
```

默认 SQLite 内存库在关闭后清空。需要持久化时用
`new Application({ databaseUrl: './app.db' })`。每个应用拥有独立对象；显式使用
相同文件路径的实例会访问同一个数据库。导入和构造不会监听或建表，
`initialize()` 准备表与种子，`start()` 自动等待初始化并监听。

并发初始化复用同一结果，重复关闭安全。`stop()` 释放服务和数据库；关闭后
不支持重新启动，应创建新的 Application。

完整演练使用 [DemoApplication](../playground/backone-demo/README.md)，保留
任务 CRUD、双库审计、事务、缓存、JWT、限流、SSE 与 WebSocket 示例。
