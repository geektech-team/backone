# BackOne

[English](./README.md) | 简体中文

基于 Bun 的轻量级纯 TypeScript 服务端框架。零运行时依赖，提供路由、中间件、
请求上下文与静态文件服务。

## 特性

- TypeScript 优先，零运行时依赖
- Bun 原生：基于 `Bun.serve`，流式响应、静态文件零拷贝
- 分段基数树（segment radix-tree）路由，支持 `:param` 与 `*` 通配
- 类型化路由：泛型 params 提供 IDE 补全与类型检查
- 洋葱模型中间件链，配合类型化的每请求 `Context`
- query / body 惰性解析并缓存
- 直接返回 `Response` 即可零开销直通
- 内置中间件：`logger`、`cors`、`gzip`、`serveStatic`、`timeout`、`helmet`
- 静态文件自动携带 ETag、Last-Modified，支持 If-None-Match 304 与 Range 206
- WebSocket 支持：`app.ws(path, handler)` 基于 Bun 原生升级
- 路由组：`app.group(prefix, callback)` 统一前缀批量注册
- 路由前缀：`app.usePrefix(prefix, callback?)` 为后续路由统一加前缀，支持持久替换与作用域叠加，可与 group 组合
- 优雅关闭：等待进行中请求完成，超时后强制关闭
- 业务模块：`@Module` 显式组织与导入业务对象，统一预检 HTTP/WS 注册
- 推荐类路由与显式对象组合：Controller / Gateway、Service、Repository
- 标准装饰器：HTTP 路由、校验、策略与局部中间件

## 环境要求

- Bun >= 1.3

## 快速开始

推荐按业务模块组织类，由 @Module 包装，并通过 Application 显式组装。此示例要求 Bun >=1.3.10、
TypeScript >=5.2，使用标准装饰器。

```ts
import { BackOneServer, type Context } from '@geektech/backone';
import {
  Controller,
  Get,
  Module,
  registerModules,
} from '@geektech/backone/decorators';

@Controller()
class HomeController {
  @Get('/')
  index() {
    return 'Hello, BackOne!';
  }

  @Get('/hello/:name')
  hello(ctx: Context) {
    return `hello, ${ctx.params.name}`;
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
await application.start();
```

业务项目推荐 `Module → Controller/Gateway → Service → Repository → Database/Table`，
依赖通过构造函数注入，资源由 Application 初始化并关闭。
[开发指南](../../docs/object-first.md)与[类模板](../backone-cli/README.md)包含
SQLite、事务及不监听端口的测试示例。`createServer` 和函数式路由仍然兼容。

## 业务模块

同一业务的 Controller、Gateway、Service、Repository、模型与 Schema 放在
`modules/<feature>/`，模块类负责显式组装，Application 调用 `registerModules`：

```ts
@Module<UsersModule>({
  prefix: '/api',
  controllers: (module) => [module.controller],
  // imports: (module) => [module.childModule],
  // gateways: (module) => [module.gateway],
})
class UsersModule {
  readonly controller: UsersController;
  constructor(database: Database) {
    const repository = new UsersRepository(database);
    this.controller = new UsersController(new UsersService(repository));
  }
}

const registration = registerModules(app, [new UsersModule(database)]);
```

该片段中的业务类由项目定义，完整可运行例子见[开发指南](../../docs/object-first.md)。
`Module`、`registerModules` 与类型 `ModuleOptions<T>`、`ModuleDescription`、
`ModuleRegistration` 从 `@geektech/backone/decorators` 导入。
Selectors 是注册期读取当前实例的同步函数，返回对象数组；不会自动创建依赖。
前缀叠加 app、父模块、当前模块和 Controller/Gateway，模块 prefix 只能是静态路径。

导入按声明顺序深度优先，子模块优先注册。整个模块图及 HTTP/WS 声明先预检后
写入，循环、错误 selector、重复端点或参数名冲突不会留下部分注册。同一 app
内，同一实例同一有效前缀去重且跨调用幂等；同一实例不同前缀报错，不同实例
的实际路由仍需互不冲突。每个模块需自己的 @Module，装饰元数据不隐式继承。

返回冻结的 `{ modules, routes, gateways }`，只包含本次新增注册；modules 是
`{ name, prefix }[]`，前缀包含 app，根前缀为空字符串，清单不暴露可变实例。
Module 不隐式初始化/关闭，资源继续由 Application 拥有。策略仍声明在
Controller/Gateway；直接注册和函数式 API 保持兼容。

## API

### BackOneServer / createServer(options)

`new BackOneServer(options)` 创建服务端对象，`createServer(options)` 是等价工厂。
选项：`port`（默认 3000，传 `0` 使用随机端口）、
`hostname`（默认 `0.0.0.0`）、`development`（输出错误详情并在错误响应中
携带 message）、`maxRequestBodySize`、`idleTimeout`。

### 路由

`app.get / post / put / patch / delete / options / head / all(path, ...handlers)`
注册处理器。路径支持静态段、`:param` 与 `*` 通配；同一路由可注册多个处理器，
按注册顺序执行。

所有路由方法支持泛型参数，实现类型化 params：

```ts
app.get<{ id: string }>('/users/:id', (ctx) => {
  // ctx.params.id 类型为 string，IDE 可补全
  return ctx.json({ id: ctx.params.id });
});
```

路由组可在统一前缀下批量注册：

```ts
app.group('/api/v1', (api) => {
  api.get('/users', handler);
  api.post('/users', handler);
});
```

`usePrefix` 为之后注册的路由统一增加前缀，支持持久替换与作用域临时叠加，
可与 group 组合：

```ts
app.usePrefix('/api');
app.get('/users', handler); // GET /api/users

app.usePrefix('/v2', (api) => {
  api.get('/users', handler); // GET /api/v2/users
}); // 结束后恢复为 /api

app.usePrefix(); // 重置：无前缀
```

### Controller 与系统装饰器

通过可选入口 `@geektech/backone/decorators` 使用标准装饰器，要求
`Bun >=1.3.10`、TypeScript >=5.2。保持 `experimentalDecorators` 和
`emitDecoratorMetadata` 关闭，公开实例方法仍使用现有 `Context`。入口会在
缺失时初始化 `Symbol.metadata`，支持 TypeScript 编译后的标准元数据，
不需要反射库或参数装饰器。

下面的示例由业务端维护会话，并选择性使用 utils 的 schema、限流器与缓存。
核心包不会在运行时导入这些后端，也可替换为满足结构化接口的业务适配器。

```ts
import { createServer, type Context } from '@geektech/backone';
import {
  Authorize,
  Cache,
  Controller,
  Delete,
  Get,
  Header,
  Post,
  RateLimit,
  Status,
  Timeout,
  Use,
  Validate,
  getPrincipal,
  registerControllers,
  validatedBody,
  validatedParams,
  validatedQuery,
  type CachedResponse,
} from '@geektech/backone/decorators';
import { createCache, createRateLimiter, v } from '@geektech/backone-utils';

const bodySchema = v.object({ name: v.string({ minLength: 1 }) });
const paramsSchema = v.object({ id: v.string({ minLength: 1 }) });
const rawQuery = v.object({ page: v.optional(v.string()) });
const querySchema = {
  parse(input: unknown) {
    const raw = rawQuery.parse(input);
    const page = Number(raw.page ?? '1');
    if (!Number.isInteger(page) || page < 1) throw new Error('Invalid page');
    return { page };
  },
};
const store = createCache<CachedResponse>({ capacity: 100 });
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
const sessions = new Map([['demo-token', { id: 'u1', role: 'reader' }]]);
type Principal = { id: string; role: string };

@Controller('/users')
@Use((ctx, next) => {
  ctx.set('x-request-id', crypto.randomUUID());
  return next();
})
@Timeout(1500)
@Authorize({
  authenticate: (ctx) =>
    sessions.get(ctx.getHeader('authorization')?.replace(/^Bearer /, '') ?? ''),
  authorize: (principal) => principal.role === 'reader',
})
@RateLimit(limiter, { key: (ctx) => getPrincipal<Principal>(ctx).id })
@Header('x-api-version', '1')
class UsersController {
  @Get('/:id')
  @Validate({ params: paramsSchema, query: querySchema })
  @Cache({
    store,
    scope: (ctx) => getPrincipal<Principal>(ctx).id,
    key: (ctx) =>
      JSON.stringify([
        validatedParams(ctx, paramsSchema).id,
        validatedQuery(ctx, querySchema).page,
      ]),
    ttlMs: 10_000,
  })
  detail(ctx: Context) {
    const { id } = validatedParams(ctx, paramsSchema);
    const { page } = validatedQuery(ctx, querySchema);
    return { id, page, owner: getPrincipal<Principal>(ctx).id };
  }

  @Post()
  @Validate({ body: bodySchema })
  @Status(201)
  create(ctx: Context) {
    const input = validatedBody(ctx, bodySchema);
    store.clear();
    return { id: crypto.randomUUID(), name: input.name };
  }

  @Delete('/:id')
  @Validate({ params: paramsSchema })
  @Status(204)
  remove(ctx: Context) {
    const { id } = validatedParams(ctx, paramsSchema);
    store.clear();
    return { removed: id }; // 204 discards this plain return value.
  }
}

const app = createServer();
app.usePrefix('/api', (api) => {
  console.table(registerControllers(api, [new UsersController()]));
});
await app.listen();
```

| API                                                                                         | 约定                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@Controller(prefix = '')`                                                                  | 声明前缀，与当前 app 前缀叠加。                                                                                                      |
| `@Get/@Post/@Put/@Patch/@Delete/@Options/@Head/@All(path = '')`                             | 声明公开实例方法的路由，同一方法可声明多个不同路由。                                                                                 |
| `@Use(...middlewares)`                                                                      | 类或方法局部中间件，接受现有 `Handler`/`Middleware`，支持提前返回 `Response`。                                                       |
| `registerControllers(app, instances)`                                                       | 绑定显式构造的实例，返回本批冻结的 `ControllerRoute[]`：`{ method, path, controller, handler }`，路径含当前 app 前缀。               |
| `@Validate({ body?, query?, params? })`                                                     | 类或方法校验，接受提供同步 `parse(unknown): T` 的 `InputSchema<T>`；解析失败返回 400。                                               |
| `validatedBody(ctx, schema)`、`validatedQuery(ctx, schema)`、`validatedParams(ctx, schema)` | 读取同一 schema 实例成功校验后推导的 `T`，未成功校验时抛错。                                                                         |
| `@Status(code)`                                                                             | 业务执行前设置缺省状态。业务 `ctx.status` 和直接返回的 `Response` 状态优先；204/205/304 下普通返回值转为空响应。                     |
| `@Header(name, value)`                                                                      | 设置缺省头部，业务 Context/`Response` 同名头优先，兼容直接或不可变响应。                                                             |
| `@Timeout(ms)` / `@Timeout({ ms?, status?, message? })`                                     | 复用 `TimeoutOptions`，默认 5000ms、504、`Gateway Timeout`；预算需有限且大于零，超时后后台任务不会自动取消。                         |
| `@Authorize({ authenticate, authorize? })`                                                  | 同步或异步取得主体对象；缺失主体或认证拒绝返回 401，授权策略返回 false 或拒绝返回 403，显式 `HttpError` 保留原状态。                 |
| `getPrincipal<P extends object>(ctx)`                                                       | 按 `P` 读取已建立的主体，不存在时抛出 401；主体也位于 `ctx.state.principal`。                                                        |
| `@RateLimit(limiter, { key })`                                                              | 必须提供同步或异步 `key(ctx)`，`consume(key)` 可同步或异步。`allowed: false` 返回 429，按 `resetAt` 设置以秒为单位的 `Retry-After`。 |
| `@Cache(options)`                                                                           | 使用显式 store、key、scope 与 TTL 缓存成功的 GET 响应，选项见下文。                                                                  |

可选入口还导出 `RouteDecorator`、`SystemDecorator`，用于标注标准路由装饰器
或类/公开方法装饰器。`TimeoutOptions`、`WebSocketOptions`、`WebSocketData`
和 `BackOneWebSocket` 从核心入口 `@geektech/backone` 导入。

`ValidateOptions` 可分别指定 JSON body、query 和 params schema。query 值保持
字符串，重复 key 得到 `string[]`，例如 `?tag=a&tag=b`；params 也保持字符串。
数字转换、缺省值和归一化由 `parse` 显式完成，结果不会覆盖 Context 原始输入。

`AuthorizeOptions<P>` 要求 `authenticate(ctx): P | null | undefined`（或 Promise），
可选 `authorize(principal, ctx): boolean`（或 Promise）。
`RateLimitBackend.consume(key)` 返回 `RateLimitResult`：
`{ allowed: boolean, remaining: number, resetAt: number }`，`resetAt` 是毫秒时间戳。
装饰器的 `RateLimitOptions` 提供显式 key 函数。utils 的 schema、
`createRateLimiter` 和 `createCache<CachedResponse>()` 可直接接入，也支持业务端
同步或异步适配器，核心仍为零运行时依赖。

**顺序与继承。** HTTP 进入顺序固定为：

```text
全局中间件 → 基类 Use → 派生类 Use → 方法 Use
→ timeout → authorize → rateLimit → validate → response → cache → 业务方法
```

回程反向退出。多个 `@Use` 从上到下进入，单个声明参数从左到右进入；不同种类
系统装饰器的书写位置不改变阶段顺序。`Use` 位于系统阶段外层，所以系统超时从
`Use` 调用 `next()` 后开始计时。方法 Timeout/Cache 替换继承默认值，认证和
限流累加，缓存命中时也执行。Status/Header 按基类、派生类、方法应用默认值，
业务显式值优先。超时会返回响应，但不撤回写入或取消后台工作。

实例与 service 等依赖由业务端显式构造并复用，请求状态放在 `ctx`。元数据按
成员名关联，标准方法包装装饰器放在路由或事件装饰器上方、下方均保留声明。
构造函数 bind 和实例上的可调用方法替换保留原型声明。继承方法会注册，同名
原型覆盖会隐藏基类声明，需重新装饰；不可调用的实例属性和 getter 不会被调用。
每个派生 Controller 需自己的 `@Controller`。

**响应缓存。** `CacheOptions` 包含：

| 选项 / 类型                 | 约定                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `store: ResponseCacheStore` | `get(key)` 返回快照、null、undefined 或 Promise；`set(key, snapshot, ttlMs)` 可同步或异步，后端负责到期。 |
| `key(ctx)`                  | 必填，同步或异步字符串 key；需包含影响响应的 params、query、语言等维度，路由隔离本身不区分参数值。        |
| `scope`                     | 必填，明确 `'public'` 或同步/异步 `(ctx) => string` 用户、租户标识；个性化结果使用隔离 scope。            |
| `ttlMs`                     | 必填，有限正毫秒数，传给存储后端。                                                                        |
| `maxBodyBytes?`             | 有限正数，快照大小默认上限 1 MiB。                                                                        |
| `snapshotTimeoutMs?`        | 有限正数，响应体快照读取时限默认 100ms。                                                                  |

内部 key 自动隔离 app、HTTP 方法/路由、scope 与业务 key。`CachedResponse`
保存 `{ status, statusText, headers, body }`，headers 为只读头部键值对，body 为
`Uint8Array | null`，不存活的 `Response`。命中时重建独立响应，快照读取不会
消费交给调用方的原响应体；认证与限流每次都执行。

快照在全局压缩前读取，只有完整中间件链成功且最终响应的状态、隐私头部允许时
才写入缓存。同步存储立即更新；异步存储在后台完成，写入失败不会替换业务响应，
因此远程写入可能在响应返回后才可见。

非 GET、错误或非成功响应、请求/响应 `no-store`、公共 scope 下的 `private`
响应、`Set-Cookie`、SSE、已消费的响应体、过大或读取过慢的快照均跳过缓存。
缓存失效由后端控制，可等待到期、清空专用存储或改变业务版本 key。内部 namespace
不透明，不能仅用自定义业务 key 删除完整条目；示例写操作通过 `store.clear()`
清空专用缓存。

Header 装饰器复制头部元数据，不额外分叉响应流；流式响应保持正常的单次消费
语义。若应用需要复用响应体，应显式复制或缓冲。

**WebSocket 网关。** 生命周期装饰器和注册函数也来自同一可选入口：

```ts
import {
  createServer,
  type BackOneWebSocket,
  type WebSocketData,
} from '@geektech/backone';
import {
  Authorize,
  OnClose,
  OnDrain,
  OnMessage,
  OnOpen,
  RateLimit,
  Timeout,
  Use,
  WebSocket as Gateway,
  getPrincipal,
  registerWebSockets,
} from '@geektech/backone/decorators';
import { createRateLimiter } from '@geektech/backone-utils';

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
const sessions = new Map([['demo-session', { id: 'u1' }]]);
const connections = new Set<BackOneWebSocket<WebSocketData>>();

@Gateway('/chat')
@Use((ctx, next) => {
  ctx.state.requestId = crypto.randomUUID();
  return next();
})
@Timeout({ ms: 1000, status: 504, message: 'Upgrade timed out' })
@Authorize({ authenticate: (ctx) => sessions.get(ctx.cookie('session') ?? '') })
@RateLimit(limiter, { key: (ctx) => getPrincipal<{ id: string }>(ctx).id })
class ChatGateway {
  @OnOpen()
  open(ws: BackOneWebSocket<WebSocketData>) {
    connections.add(ws);
    ws.send(JSON.stringify(ws.data.state));
  }

  @OnMessage()
  async message(
    ws: BackOneWebSocket<WebSocketData>,
    message: string | Uint8Array
  ) {
    const principal = ws.data.state?.principal as { id: string } | undefined;
    ws.send(JSON.stringify({ userId: principal?.id, text: String(message) }));
  }

  @OnClose()
  close(ws: BackOneWebSocket<WebSocketData>, code: number, reason: string) {
    connections.delete(ws);
    console.log('closed', code, reason);
  }

  @OnDrain()
  drain(ws: BackOneWebSocket<WebSocketData>) {
    console.log('writable', ws.data.path);
  }
}

const app = createServer().usePrefix('/api');
console.table(registerWebSockets(app, [new ChatGateway()])); // /api/chat
await app.listen();
```

- `@WebSocket(path)` 声明精确路径，与当前 app 前缀叠加；拒绝参数、通配符、
  query 与 hash。派生网关需自己的声明。
- `@OnOpen()` 和 `@OnDrain()` 接收 `BackOneWebSocket<WebSocketData>`；
  `@OnMessage()` 额外接收 `string | Uint8Array`；`@OnClose()` 接收连接、
  number 类型 code 与 string 类型 reason。方法可同步或异步。
- `registerWebSockets(app, instances)` 整批校验后挂载，返回只读
  `WebSocketGateway[]`：`{ path, gateway, events: [{ event, handler }] }`。
  重复事件或路径（含现有函数式 `app.ws`）被拒绝。
- 网关类的 `Use`、`Timeout`、`Authorize`、`RateLimit` 仅在升级时执行一次，
  不逐消息执行。类上的 `Validate`、`Status`、`Header`、`Cache` 属于 HTTP-only，
  会被拒绝；事件方法不能声明 HTTP 路由、`Use` 或任何系统策略。
- 局部中间件完整执行后才握手，提前返回 `Response` 或抛出 `HttpError` 会拒绝
  升级。`ctx.state` 浅拷贝到可选 `ws.data.state`，包含 principal。已匹配升级
  路径上的全局 HTTP 中间件行为保持原样，不会自动加入升级链。
- 同步异常和异步回调拒绝会被收敛，活动连接以 1011 关闭，不产生未处理的
  Promise 拒绝；关闭回调本身的异常也被收敛。
- 现有 `app.ws(path, handler, options?)` 和 `RouteGroup.ws` 保持可用，
  `WebSocketOptions.middlewares?: readonly Handler[]` 只在升级前执行并传递状态。
  `app.hasWebSocket(path)` 检查当前前缀下是否已有 WebSocket 注册。

**注册校验。** 仅支持公开实例方法，拒绝 static、`#private` 方法和带 query/hash
的路径。整批校验通过后才注册，同一 app 的装饰器 HTTP 路由禁止重复方法与匹配
路径，不同 app 独立；共享动态路径段需一致参数名，如 `/users/:id/view` 与
`/users/:id/edit`。混用函数式 HTTP 路由时，业务端需自行确保不冲突。

当前 Bun 1.4.0 在装饰过的方法中直接更新 `#private` 字段会触发转译错误，
可将更新放到 service 或未装饰的方法。私有依赖读取及实例绑定已通过测试。

完整 REST 示例可用 `backone init my-api --template rest-api --style controller`
生成。playground 提供 GET/POST `/controller-api/users` 和
GET `/controller-api/users/:id`。

### Context

每个请求都会获得一个 `Context`：

- `ctx.params`、`ctx.query` — 路径与 query 参数（query 惰性解析）
- `ctx.bodyJson<T>()`、`ctx.bodyText()` — 惰性解析并缓存的请求体
- `ctx.json / text / html / stream / redirect / noContent` — 响应构建器
- `ctx.status`、`ctx.set(name, value)`、`ctx.headers`
- `ctx.cookie(name)`、`ctx.setCookie(name, value, options)`

处理器可以直接返回 `Response`（透传），也可以返回原始值 / 对象，由框架自动
序列化。

### 中间件

`app.use(...handlers)` 安装中间件，链路按洋葱模型执行。内置：`logger`、
`cors`、`gzip`、`timeout`、`helmet`、`serveStatic`（也提供 `app.useLogger()`、
`app.useCors()`、`app.useGzip()`、`app.useTimeout()`、`app.useHelmet()`、
`app.serveStatic()` 快捷方法）。

`serveStatic` 基于 `Bun.file` 零拷贝流式发送文件。响应自动携带 `ETag`、
`Last-Modified` 与 `Accept-Ranges: bytes`；`If-None-Match` / `If-Modified-Since`
条件请求返回 `304`，`Range` 请求返回 `206` 部分内容。

`helmet` 设置常见安全响应头（X-Content-Type-Options、X-Frame-Options、
Referrer-Policy 等），每项可通过选项覆盖或设为 false 禁用。`timeout`
在处理器超过指定毫秒数时返回 `504`。

### WebSocket

通过 `app.ws(path, handler)` 在路径上注册 WebSocket 处理器。携带
`Upgrade: websocket` 头且路径已注册的请求会自动通过 Bun 原生
`server.upgrade()` 升级。

```ts
app.ws('/echo', {
  open(ws) {
    ws.send('connected');
  },
  message(ws, message) {
    ws.send(`echo: ${message}`);
  },
  close(ws, code, reason) {
    console.log('closed', code, reason);
  },
});
```

### 错误处理

抛出 `@geektech/backone` 的 `HttpError` 可控制状态码；未知错误统一转为
`500 Internal Server Error`，不泄漏内部信息。

## 开发

```sh
bun test          # 运行测试
bun run build     # 构建 dist（Bun.build + 类型声明）
bun run lint      # eslint
```

## 仓库结构

本包位于 BackOne monorepo 的 `packages/backone`（`@geektech/backone` 是服务端
框架，`@geektech/backone-utils` 是通用工具包，`@geektech/backone-cli` 用于
脚手架生成服务端应用）。发布前检查遵循同一套规范：
`bun test && bunx tsc --noEmit && bun run build && bun pm pack --dry-run`。

## License

MIT
