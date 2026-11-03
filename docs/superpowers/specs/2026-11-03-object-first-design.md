# BackOne 对象优先架构

## 目标与边界

将类作为业务开发的首选组织方式：路由使用 Controller / Gateway，业务规则放在
Service，数据库访问放在 Repository，Application 显式组装对象并管理资源。
初始化的 minimal、rest-api、websocket 模板和现有 demo 均遵循此约定；同步
中英文 README、CLI 帮助和文档站。

框架已有 BackOneServer、DatabaseManager、Database、Table 和实例路由装饰器，
继续复用。保留框架函数式 API，不加入运行时依赖、自动扫描、反射 DI 容器、
无行为的 Service/Repository 装饰器或新的 CRUD 基类。不修改既有版本号，
不提交或发布，保留工作区已有装饰器改动。

## 分层与生命周期

- Application 拥有 BackOneServer、数据库和业务对象，构造函数不监听端口；
  initialize 初始化资源，start 监听，stop 释放监听与数据库。
- start 自动等待 initialize；并发 initialize 共享同一 Promise，重复 stop 幂等。
  stop 协调尚未完成的初始化/启动并释放资源，关闭后不支持重启，明确报 closed。
- Controller 负责 HTTP 参数、校验与状态，依赖 Service；Gateway 负责 WS 生命周期。
- Service 负责业务规则、未命中处理和跨 Repository 协调，不持有 Context。
- Repository 组合 Database/Table 或内存集合，暴露业务数据操作，不依赖 HTTP。
- 依赖通过构造函数传入。实例属于应用，单次请求状态属于 ctx，WS 状态属于 ws.data。
- 事务 Repository 必须重新绑定事务提供的 Database；Repository 不关闭借用的连接。

## 模板

所有模板默认并统一使用类。保留 --style controller 的显式兼容入口，适用于
三个模板；--style functional 提前报迁移错误，未指定模板继续交互选择或在
非 TTY 下使用 minimal。显式 --style controller 且未指定模板时，兼容旧行为
选择 rest-api。保留逐文件覆盖确认和非 TTY 保留已有文件的行为。

minimal 使用 Application + HomeController。websocket 使用 Application +
ChatGateway + ChatService，保留浏览器客户端。rest-api 使用 Application +
UsersController + UsersService + UsersRepository + Database/Table，默认 SQLite
内存库，也可显式指定文件持久化。REST 包依赖 backone-utils，模板版本范围由
发布脚本同步。初始化/建表/种子数据不在导入时执行。应用可用 server.handle 测试。
标准装饰器要求 Bun >=1.3.10、TypeScript >=5.2。

## Demo

DemoApplication 为唯一组装与资源管理入口。拆分原 index.ts 里的路由、服务和
双库数据访问，保留所有现有 HTTP/WS 路径及主要响应、状态和工具演示。保留
registerControllerDemo 的兼容包装，但组装实现使用类。数据库实例按应用隔离，
启动失败释放资源，重复初始化不得重复注册路由或插入种子。SQLite 本地演练
不依赖外部数据库。原 PostgreSQL/MySQL 环境变量说明必须保留方言 DDL 限制。

标准装饰器参数在类定义期求值，不能直接访问构造器稍后注入的 this。
策略示例允许使用极小的专用类工厂，将应用拥有的认证/缓存/限流配置绑定到
装饰类；实际状态和业务方法仍由显式注入的 Service/Repository 持有。

## 验收

真实生成三个模板并类型检查、运行 HTTP/WS 行为。REST 通过真实 SQLite 验证
CRUD、校验、实例隔离、文件持久化和资源释放。Demo 通过真实 SQLite 验证任务
CRUD、审计、事务及主要既有接口；验证 Controller 示例和 WS。全量测试、根与
文档类型检查、构建、Lint、格式与打包检查通过。说明未运行的外部 DB 验证。
