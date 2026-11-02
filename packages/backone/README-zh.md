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
- 可选的标准装饰器：Controller、HTTP 路由与局部中间件

## 环境要求

- Bun >= 1.3

## 快速开始

```ts
import { createServer } from '@geektech/backone';

const app = createServer({ port: 3000 });

app.useLogger();
app.get('/users/:id', (ctx) => ctx.json({ id: ctx.params.id }));
app.post('/echo', async (ctx) => ctx.json(await ctx.bodyJson()));
app.serveStatic('/public', './public');

await app.listen();
```

## API

### createServer(options)

创建服务端应用。选项：`port`（默认 3000，传 `0` 使用随机端口）、
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

### Controller 装饰器

通过可选入口 `@geektech/backone/decorators` 使用标准装饰器，要求
`Bun >=1.3.10`、TypeScript >=5.0。保持 `experimentalDecorators` 和
`emitDecoratorMetadata` 关闭，方法仍使用现有 `Context`。

```ts
import { createServer, type Context } from '@geektech/backone';
import {
  Controller,
  Get,
  Use,
  registerControllers,
} from '@geektech/backone/decorators';

@Controller('/users')
@Use((ctx, next) => {
  ctx.set('x-request-id', crypto.randomUUID());
  return next();
})
class UsersController {
  @Get('/:id')
  detail(ctx: Context) {
    return { id: ctx.params.id };
  }
}

const app = createServer();
app.usePrefix('/api', (api) => {
  console.table(registerControllers(api, [new UsersController()]));
});
await app.listen();
```

- `@Controller(prefix = '')` 声明前缀；`@Get`、`@Post`、`@Put`、`@Patch`、
  `@Delete`、`@Options`、`@Head`、`@All` 的路径默认 `''`，同一方法可声明
  多个不同路由。
- `@Use(...middlewares)` 可用于类和方法。进入顺序为全局、基类、派生类、
  方法中间件、处理方法，退出时反向；多个 `@Use` 从上到下进入，参数从左到右。
- `registerControllers(app, instances)` 在注册期绑定方法，返回本批只读路由
  清单 `{ method, path, controller, handler }[]`，路径包含当前 app 前缀。
  service 等依赖由业务端显式构造传入；实例会复用，请求状态放在 `ctx`。
- 仅支持公开实例方法。构造函数中的方法 bind 保留原型路由声明。继承方法会
  注册，派生类同名原型方法覆盖会隐藏基类路由，覆盖后需
  重新声明装饰器；每个派生 Controller 需自己的 `@Controller`，类中间件基类优先。
- 整批校验通过后才注册。同一 app 的装饰器路由禁止重复方法和匹配路径，
  不同 app 独立；共享动态路径段需使用一致参数名，如 `/users/:id/view`
  与 `/users/:id/edit`。与函数式路由混用时需自行确保路径不冲突。
- 当前 Bun 1.4.0 在装饰过的方法中直接更新 `#private` 字段会触发转译错误，
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
