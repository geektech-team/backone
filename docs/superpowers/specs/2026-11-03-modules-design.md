# Business Modules

## Intent

业务代码按功能就近存放 modules/<feature>/，Module 类显式组合 Controller/Gateway、
Service、Repository，Application 负责模块组装和资源生命周期。复用标准装饰器入口，
零运行时依赖，保留现有直接注册与函数式 API，不引入自动扫描和反射 DI。

## API

`Module<T extends object>(options: ModuleOptions<T> = {})` 是标准类装饰器。
ModuleOptions 包含可选静态 prefix，以及 imports/controllers/gateways 三个可选
selector `(module: T) => readonly object[]`。selector 在注册时读取当前模块实例，
让构造器注入的依赖可用于声明，不创建模块级共享业务单例。prefix 可多段，
不能含 query/hash、动态段或通配符。空 prefix 和 / 归一为空字符串。重复装饰和旧装饰器用法报错。

`registerModules(app, instances)` 显式挂载实例，返回冻结 ModuleRegistration：
modules: readonly ModuleDescription[]（name、包含app前缀的prefix），
routes: readonly ControllerRoute[]，gateways: readonly WebSocketGateway[]。

每个实例必须具有自己的 @Module 元数据，不能靠继承自动成为模块。导入按声明
顺序深度优先，先子模块后当前模块；prefix 叠加 app/父module/当前module/
Controller 或 Gateway 的前缀。同一实例同一有效前缀去重，跨调用幂等；同一
实例不同有效前缀报错。不同实例即使同类也允许，但实际重复路由照常报错。
循环导入报错。只有未注册模块出现在本次清单，清单不暴露可变实例。

整个模块图先展平，selector每个新实例最多执行一次，校验所有 HTTP、WS 和
模块声明后统一写入；循环、错误selector、重复路由、重复WS路径和冲突参数名
不得留下部分路由或模块登记。与 registerControllers/registerWebSockets 共用
原检测注册状态。注册不能永久改变 app.prefix。selectors 是同步可信业务代码，
负责返回数组；框架不回滚 selector 自己产生的外部副作用。

模块只声明组成与挂载，不隐式初始化或关闭。数据库连接归 Application，
模块/Repository 借用；模块可以有显式业务 initialize 方法由 Application 调用。
Use/Authorize等策略仍声明在 Controller/Gateway，模块不接管策略执行阶段。

## Templates and demo

三个模板默认包含 modules：minimal 的 modules/home；REST 的 modules/users
就近包含 module/controller/service/repository/model/schema，以及跨模块通用
middlewares；websocket 的 modules/chat 包含 module/gateway/service。
Application 调用 registerModules，保留原initialize/start/stop与接口、SQLite测试。

Demo 按框架能力、tasks、tools、装饰器策略分模块；保留所有原路径和
registerControllerDemo 兼容包装，生命周期和事务继续由原对象负责。
文档同步 API、目录、构造注入和资源所有权；不改版本、不提交、不发布。

## Validation

先RED后GREEN测试嵌套前缀、构造注入、HTTP和真实WS、diamond去重与重复注册、
循环/同实例多挂载/坏selector、整批失败不写入、直接注册冲突、元数据继承。
生成模板继续验证SQLite CRUD/持久化/隔离与编译输出，demo验证原接口与资源释放。
完成全量测试、类型检查、构建、Lint、格式、文档静态产物和包dry-run验证。
