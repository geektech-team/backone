# BackOne 类应用演练

启动：在仓库根执行 `bun run build`、`bun run dev`，访问
http://127.0.0.1:5390/static/。要求 Bun >=1.3.10、TypeScript >=5.2。

应用按 `Application → Module → Controller/Gateway → Service → Repository → Database/Table`
组装，依赖由构造函数传入。`src/index.ts` 仅负责启动和信号关闭；
`src/app.ts` 的 `DemoApplication` 拥有服务器、双库连接和 SSE 流的生命周期。
Controller 和 Service 实例跨请求复用，请求状态放在 `ctx`，WS 状态放在 `ws.data`。

```ts
import { DemoApplication } from './src/app';

const app = new DemoApplication({ port: 0, logger: false });
await app.initialize(); // 只初始化数据库和路由，不监听
const response = await app.server.handle(
  new Request('http://localhost/api/tasks')
);
console.log(await response.json());
await app.start(); // 自动等待 initialize，返回实际端口
await app.stop(); // 幂等，等待初始化结束并关闭服务器、流和数据库
```

`initialize()`、`start()` 可并发调用并共享各自结果；`stop()` 后实例不可重启，
请新建应用。导入和构造不创建数据库连接或监听端口。

同一业务的文件放进同一个 `modules/<feature>/` 目录，不按 Controller/Service/
Repository 在全应用横向拆散。应用通过 `registerModules()` 一次挂载模块图：

```text
src/
  app.ts
  index.ts
  db.ts
  middlewares/
  modules/
    framework/
      framework-module.ts
      framework-controller.ts
      echo-gateway.ts
      streams-service.ts
    tasks/
      tasks-module.ts
      tasks-controller.ts
      tasks-service.ts
      tasks-repository.ts
      audit-repository.ts
      models.ts
    tools/
      tools-module.ts
      tools-controller.ts
      tools-service.ts
    controller-demo/
      controller-demo-module.ts
      decorators-controller.ts
      controller-policy-service.ts
      demo-users-service.ts
      demo-users-repository.ts
      policy-chat-gateway.ts
```

- `@Module<T>({ prefix, imports, controllers, gateways })` 用注册期 selector
  读取当前模块实例的依赖，构造函数仍显式创建 Service、Repository 和 Controller。
- `FrameworkModule` 导入 V1/V2 子模块；V2 再导入 admin 子模块，展示嵌套前缀。
- `TasksModule` 借用 `DemoDatabases` 的双库连接，显式 `initialize()` 调用同模块
  Repository 建表与种子；`/api` 前缀由模块统一声明。
- `ToolsModule` 聚合工具示例，`ControllerDemoModule` 聚合策略 Controller/Gateway。
- `db.ts` 只注册、展示和关闭数据库；连接所有权仍在 Application。
- `src/controller-demo.ts` 保留 `ControllerDemo` 别名及
  `registerControllerDemo(server)` 兼容入口，业务实现位于模块目录。

模块装饰器不自动创建依赖或调用生命周期。Application 显式初始化业务模块，
统一注册后才监听，并最终关闭拥有的连接和流。相同模块实例重复注册到相同
前缀会去重；循环导入、冲突前缀或重复路由会在整批写入前失败。

标准装饰器在类定义时求值。策略演示的两个小工厂仅将应用拥有的服务绑定到
`@Authorize`、`@RateLimit`、`@Cache` 元数据；实际业务方法和状态仍在顶层类中。
没有全局连接、服务定位器、自动扫描或 DI 容器。

主要接口保持原路径：

| 分组       | 接口                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| HTTP 能力  | `/`、`/hello/:name`、`/typed/:id`、`/large`、`/files/*`、`/json`、`/search`                                              |
| 请求与响应 | `/echo`、`/text`、`/form`、`/request-id`、`/status`、`/theme`、`/old-path`、`/cleanup`                                   |
| 流与错误   | `/events`、`/clock`、`/admin`、`/boom`、`/ping`                                                                          |
| 路由前缀   | `/api/v1/users`、`/api/v1/users/:id`、`/api/v2/hello`、`/api/v2/admin/ping`                                              |
| 数据库     | `/api/tasks`、`/api/tasks/:id`、`/api/tasks/batch`、`/api/audit`、`/api/db`                                              |
| 工具       | `/api/tools/ids`、`/config`、`/rank`、`/token`、`/me`、`/limited`、`/http`、`/city`（后七个同 `/api/tools` 前缀）        |
| 装饰器     | `/controller-api/users`、`/controller-api/session`、`/controller-api/policy/profile`、`/controller-api/policy/cached?q=` |
| WebSocket  | `/ws`、`/controller-api/chat?token=`                                                                                     |

默认主库和审计库均为独立 SQLite 内存库，每个应用实例隔离。可以通过
`new DemoApplication({ databaseUrl: './demo.sqlite' })` 或
`BACKONE_DEMO_DATABASE_URL` 指定主库地址。当前初始化 DDL 是 SQLite 语法；
切换 PostgreSQL/MySQL/MariaDB 时先替换对应 DDL。审计库仍为内存库。

事务内通过 `new TasksRepository(tx)` 创建绑定事务连接的 Repository，失败会回滚
主库任务；审计写入发生在主库成功后，两个库之间没有分布式事务。
Repository 借用连接，不负责关闭。SQLite 测试不代表已验证外部数据库。

演示中的 JWT 密钥、签发任意 role 的工具接口和固定会员身份只供本地演练。
