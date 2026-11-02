# Controller decorators 首版

用户已确认本聊天中的首版方案并要求开始实现。

- 可选入口 `@geektech/backone/decorators`，使用标准装饰器，零运行时依赖。
- `Controller(prefix = '')`、`Get/Post/Put/Patch/Delete/Options/Head/All(path = '')`
  和支持类、方法的 `Use(...middlewares)`。
- `registerControllers(app, instances)` 显式传入实例，返回本次注册的只读路由清单
  `{ method, path, controller, handler }[]`。元数据使用 WeakMap；启动期绑定方法，
  复用 `app.add()`、现有中间件和序列化。
- 顺序：全局、基类、派生类、方法中间件、业务方法；退出时反向。
  单次 Use 内和多个 Use 间均按从上到下、从左到右顺序进入。
- Controller 复用传入实例，请求状态存在 ctx；支持公开实例方法及继承方法，
  同名原型方法覆盖隐藏基类路由，派生类需显式 Controller，类中间件基类优先。
  构造函数 bind 等实例可调用替换保留原型声明并执行替换后的方法。
- 注册前完成校验，失败不留下本批部分路由；同一 app 的装饰器路由禁止相同
  method + 实际匹配路径（参数名视为等价），不同 app 独立。检测范围是装饰器
  注册，不改变函数式重复注册多处理器的语义。
- 路由树共享动态节点，装饰器注册时要求共享节点的参数名一致，避免后注册的
  不同命名覆盖原有路由参数；别名冲突在批量提交前报错。
- CLI style 默认 functional；controller 仅支持 rest-api，未指定 template
  时选 rest-api。不兼容或未知值在写文件前报错，沿用已有文件覆盖确认。
- Controller REST 模板包含显式依赖注入的 service、controller、middleware、
  app 工厂和启动入口，Bun 要求 >=1.3.10；框架函数式入口维持 >=1.3.0。
- 同步中英文 README、文档站及 playground。自动 DI、参数装饰器、校验装饰器
  留待后续版本；本轮不发布、不提交。

验收：真实 Request 驱动的测试、模板运行验证、包子路径消费、全量测试、
类型检查、构建与相关 lint 通过。
