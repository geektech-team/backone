# BackOne

English | [简体中文](./README-zh.md)

A lightweight server-side framework written entirely in TypeScript, built on
Bun. Zero runtime dependencies — routing, middleware, request context, and
static file serving.

## Features

- TypeScript-first with zero runtime dependencies
- Bun-native: built on `Bun.serve`, streaming responses, zero-copy static files
- Segment radix-tree router with `:param` and `*` wildcard support
- Typed routes: generic params give IDE autocompletion and type checking
- Onion-model middleware chain with a typed per-request `Context`
- Lazy query / body parsing with caching
- Return a `Response` directly for zero-overhead passthrough
- Built-in middleware: `logger`, `cors`, `gzip`, `serveStatic`, `timeout`, `helmet`
- Static files with ETag, Last-Modified, If-None-Match 304 and Range 206
- WebSocket support via `app.ws(path, handler)` on Bun native upgrade
- Route groups with `app.group(prefix, callback)` for shared prefixes
- Route prefix with `app.usePrefix(prefix, callback?)`: persistent replacement or scoped stacking for later routes, composable with `group`
- Graceful shutdown: wait for in-flight requests, force-close after timeout
- Optional standard decorators for Controllers and local middleware

## Requirements

- Bun >= 1.3

## Quick Start

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

Create a server application. Options: `port` (default 3000, `0` for a random
port), `hostname` (default `0.0.0.0`), `development` (log error details and
expose messages in error responses), `maxRequestBodySize`, `idleTimeout`.

### Routing

`app.get / post / put / patch / delete / options / head / all(path, ...handlers)`
register handlers. Paths support static segments, `:param`, and `*` wildcards.
Multiple handlers on one route run in order.

All route methods accept a generic type for typed params:

```ts
app.get<{ id: string }>('/users/:id', (ctx) => {
  // ctx.params.id is typed as string
  return ctx.json({ id: ctx.params.id });
});
```

Route groups register multiple routes under a shared prefix:

```ts
app.group('/api/v1', (api) => {
  api.get('/users', handler);
  api.post('/users', handler);
});
```

`usePrefix` adds a prefix to routes registered afterwards — persistent or
scoped, composable with `group`:

```ts
app.usePrefix('/api');
app.get('/users', handler); // GET /api/users

app.usePrefix('/v2', (api) => {
  api.get('/users', handler); // GET /api/v2/users
}); // prefix restored to /api afterwards

app.usePrefix(); // reset: no prefix
```

### Controller decorators

Use the optional `@geektech/backone/decorators` entry with Bun >=1.3.10 and
TypeScript >=5.0. Leave `experimentalDecorators` and `emitDecoratorMetadata`
disabled; handlers receive the existing `Context`.

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

- `@Controller(prefix = '')` declares a prefix. `@Get`, `@Post`, `@Put`,
  `@Patch`, `@Delete`, `@Options`, `@Head`, `@All` take an optional path
  (default `''`). Multiple distinct route decorators may share one method.
- `@Use(...middlewares)` works on classes and methods. Entry order is global,
  base class, derived class, method, handler; exit order is reversed. Stacked
  `@Use` declarations run top to bottom, arguments left to right.
- `registerControllers(app, instances)` binds methods once and returns a frozen
  list of `{ method, path, controller, handler }` for this batch. Paths include
  the current app prefix. Construct service dependencies explicitly and pass
  them to your controllers. Instances are reused; keep request state in `ctx`.
- Only public instance methods are supported. Constructor method binding keeps
  the prototype route declaration. Inherited methods are included; derived
  prototype-method overrides hide base routes and need new decorators. Each derived controller
  needs its own `@Controller`; class middleware is inherited base first.
- The complete batch is checked before registration. Duplicate method/matching
  paths are rejected across decorator registrations on the same app; separate
  apps are independent. Shared dynamic segments must use the same parameter
  name (for example `:id` in both `/users/:id/view` and `/users/:id/edit`).
  When mixing functional routes, ensure they do not conflict with Controllers.
- Bun 1.4.0 currently fails to transpile direct updates to `#private` fields
  inside decorated methods. Put those updates in a service or an undecorated
  helper. Reading private dependencies and bound instance methods are tested.

Generate a complete REST example with
`backone init my-api --template rest-api --style controller`. The playground
also exposes GET/POST `/controller-api/users` and GET `/controller-api/users/:id`.

### Context

Each request gets a `Context`:

- `ctx.params`, `ctx.query` — path / query parameters (query is lazily parsed)
- `ctx.bodyJson<T>()`, `ctx.bodyText()` — lazily parsed and cached body
- `ctx.json / text / html / stream / redirect / noContent` — response builders
- `ctx.status`, `ctx.set(name, value)`, `ctx.headers`
- `ctx.cookie(name)`, `ctx.setCookie(name, value, options)`

Handlers may return a `Response` directly (passthrough) or a primitive / object
which the framework serializes.

### Middleware

`app.use(...handlers)` installs middleware; the chain follows the onion model.
Built-in: `logger`, `cors`, `gzip`, `timeout`, `helmet`, `serveStatic` (also
available as `app.useLogger()`, `app.useCors()`, `app.useGzip()`,
`app.useTimeout()`, `app.useHelmet()`, `app.serveStatic()`).

`serveStatic` serves files via `Bun.file` with zero-copy streaming. Responses
carry `ETag`, `Last-Modified` and `Accept-Ranges: bytes`; `If-None-Match` /
`If-Modified-Since` return `304`, and `Range` requests return `206` partial
content.

`helmet` sets common security headers (X-Content-Type-Options, X-Frame-Options,
Referrer-Policy, etc.), each overridable or disablable via options. `timeout`
returns `504` when a handler exceeds the specified milliseconds.

### WebSocket

Register a WebSocket handler on a path with `app.ws(path, handler)`. Requests
with `Upgrade: websocket` on a registered path are automatically upgraded via
Bun native `server.upgrade()`.

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

### Errors

Throw `HttpError` from `@geektech/backone` to control the status code; unknown
errors become `500 Internal Server Error` without leaking internals.

## Development

```sh
bun test          # run tests
bun run build     # build dist (Bun.build + type declarations)
bun run lint      # eslint
```

## Repository Structure

This package lives at `packages/backone` in the BackOne monorepo
(`@geektech/backone` is the server-side framework; `@geektech/backone-utils`
is its general-purpose toolkit; `@geektech/backone-cli` scaffolds server
applications). Publish checks follow the same discipline:
`bun test && bunx tsc --noEmit && bun run build && bun pm pack --dry-run`.

## License

MIT
