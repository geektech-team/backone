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
- Business modules via `@Module`, explicit imports and atomic HTTP/WS registration
- Class routes and explicit composition with Controllers, Gateways, Services and Repositories
- Standard decorators for HTTP routes, validation, policies and local middleware

## Requirements

- Bun >= 1.3

## Quick Start

Group business classes in a Module and compose its instances in an Application. This example
requires Bun >=1.3.10 and TypeScript >=5.2 with standard decorators.

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

For business applications, use `Module → Controller/Gateway → Service → Repository →
Database/Table`, inject dependencies through constructors, and let Application
own resource initialization and shutdown. See the [architecture guide](../../docs/object-first.md)
and [class templates](../backone-cli/README.md) for SQLite, transactions and tests
without a listener. `createServer` and functional routing remain supported.

## Business modules

Keep a feature's Controller, Gateway, Service, Repository, model and schema in
`modules/<feature>/`. The module class composes instances explicitly; Application
mounts them with `registerModules`:

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

Business classes in this fragment belong to your project. The [guide](../../docs/object-first.md)
has a runnable example. Import `Module`, `registerModules`, `ModuleOptions<T>`,
`ModuleDescription` and `ModuleRegistration` from `@geektech/backone/decorators`.
Selectors run synchronously at registration against the injected module instance,
return object arrays, and never construct dependencies automatically. Prefixes
stack from app to parent/child module to Controller/Gateway; module prefixes must
be static paths without query/hash, dynamic parameters or wildcards.

Imports are traversed in declaration order, children first. The complete module
graph and all HTTP/WS declarations are validated before any registration. Cycles,
invalid selectors, duplicate endpoints and conflicting parameter names leave no
partial registration. On one app, the same instance at the same effective prefix
is deduplicated across calls; mounting it at another prefix fails. Distinct
instances are allowed but their endpoints must not conflict. Every module needs
its own `@Module`; decoration is not implicitly inherited.

The frozen result `{ modules, routes, gateways }` describes only newly registered
items. `modules` contains `{ name, prefix }`, including the app prefix, with `''`
for the root. No mutable module instance is exposed. Modules do not initialize or
close resources implicitly: Application owns that lifecycle. Policies remain on
Controllers/Gateways; direct registration and functional APIs stay available.

## API

### BackOneServer / createServer(options)

`new BackOneServer(options)` constructs a server; `createServer(options)` is
an equivalent factory. Options: `port` (default 3000, `0` for a random
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

### Controller and system decorators

Use the optional `@geektech/backone/decorators` entry with Bun >=1.3.10 and
TypeScript >=5.2. Leave `experimentalDecorators` and `emitDecoratorMetadata`
disabled; public instance methods receive the existing `Context`. The entry
initializes a missing `Symbol.metadata` for TypeScript-emitted standard
metadata. No reflection library or parameter decorators are required.

The following example uses application-owned sessions and optional utils
schemas, a limiter and a cache. BackOne imports none of those backends at
runtime; compatible structural adapters can replace them.

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

| API                                                                                         | Contract                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@Controller(prefix = '')`                                                                  | Declare a prefix, combined with the current app prefix.                                                                                                                                             |
| `@Get/@Post/@Put/@Patch/@Delete/@Options/@Head/@All(path = '')`                             | Declare a public instance route. Several distinct routes may share one method.                                                                                                                      |
| `@Use(...middlewares)`                                                                      | Class or method middleware, using existing `Handler`/`Middleware`; supports early `Response` returns.                                                                                               |
| `registerControllers(app, instances)`                                                       | Bind explicitly constructed instances and return a frozen `ControllerRoute[]` of `{ method, path, controller, handler }`; paths include the current app prefix.                                     |
| `@Validate({ body?, query?, params? })`                                                     | Class or method validation using `InputSchema<T>`, a synchronous `parse(unknown): T`; parsing failures return 400.                                                                                  |
| `validatedBody(ctx, schema)`, `validatedQuery(ctx, schema)`, `validatedParams(ctx, schema)` | Retrieve the inferred output `T` after successful validation with the same schema instance; otherwise throw.                                                                                        |
| `@Status(code)`                                                                             | Supply a default status before business code. Explicit `ctx.status` and returned `Response` status win. Plain returns at 204/205/304 become empty responses.                                        |
| `@Header(name, value)`                                                                      | Supply a default header. Business context/`Response` headers win, including direct or immutable responses.                                                                                          |
| `@Timeout(ms)` / `@Timeout({ ms?, status?, message? })`                                     | Reuse `TimeoutOptions`: defaults are 5000ms, 504 and `Gateway Timeout`; the budget must be positive and finite. Work is not automatically cancelled after timeout.                                  |
| `@Authorize({ authenticate, authorize? })`                                                  | Resolve an object principal synchronously or asynchronously. Missing/rejected authentication returns 401; a false/rejected authorization policy returns 403. Explicit `HttpError` keeps its status. |
| `getPrincipal<P extends object>(ctx)`                                                       | Read the established principal as `P`; throws 401 if none exists. It is also available in `ctx.state.principal`.                                                                                    |
| `@RateLimit(limiter, { key })`                                                              | Require an explicit sync/async `key(ctx)` and sync/async `consume(key)`. `allowed: false` returns 429 with `Retry-After` seconds calculated from `resetAt`.                                         |
| `@Cache(options)`                                                                           | Cache successful GET responses using the explicit store, key, scope and TTL described below.                                                                                                        |

The optional entry also exports `RouteDecorator` and `SystemDecorator` for
typing standard route or class/public-method decorators. Import `TimeoutOptions`,
`WebSocketOptions`, `WebSocketData` and `BackOneWebSocket` from the core
`@geektech/backone` entry.

`ValidateOptions` accepts JSON body, query and params schemas. Query values stay
strings; repeated keys become `string[]` (for example `?tag=a&tag=b`). Params
stay strings too. Conversion, defaults and normalization belong in `parse`.
Validation results do not replace raw context inputs.

`AuthorizeOptions<P>` requires `authenticate(ctx): P | null | undefined` (or a
Promise) and optionally `authorize(principal, ctx): boolean` (or a Promise).
`RateLimitBackend.consume(key)` returns `RateLimitResult`:
`{ allowed: boolean, remaining: number, resetAt: number }`, where `resetAt` is a
millisecond timestamp. Decorator `RateLimitOptions` supplies the explicit key
function. Utils schemas, `createRateLimiter` and `createCache<CachedResponse>()`
meet these structural contracts; sync and async application adapters are also
supported. The core retains zero runtime dependencies.

**Order and inheritance.** The incoming HTTP chain is:

```text
global middleware → base Use → derived Use → method Use
→ timeout → authorize → rateLimit → validate → response → cache → method
```

Exit order is reversed. Stacked `@Use` runs top to bottom, with arguments left
to right. System phases keep this order regardless of decorator spelling
order; `Use` remains outside them, so the system timeout starts when `Use`
reaches `next()`. Method timeout/cache replace inherited defaults;
authorization and rate limits accumulate and run even on cache hits.
Status/header defaults apply base first, then derived, then method; business
values take precedence. A timeout returns its response but does not roll back
writes or cancel background work.

Instances and injected service dependencies are application-owned and reused;
keep request data in `ctx`. Metadata is keyed by member name, so standard
method-wrapping decorators work above or below route/event decorators.
Constructor binding and callable instance replacements keep prototype
declarations. Inherited methods are included; same-name prototype overrides
hide base declarations and must be decorated again. Non-callable own shadows
and getters are not invoked. Each derived controller needs its own
`@Controller`.

**Cache options and safety.** `CacheOptions` contains:

| Option / type               | Contract                                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store: ResponseCacheStore` | `get(key)` returns a snapshot, null, undefined or a Promise; `set(key, snapshot, ttlMs)` may be sync or async. The store implements expiry.                             |
| `key(ctx)`                  | Required sync/async string key. Include representation-changing params, query, language or other inputs. A route namespace alone does not distinguish parameter values. |
| `scope`                     | Required `'public'` or sync/async `(ctx) => string` user/tenant resolver. Use an isolated scope for personalized results.                                               |
| `ttlMs`                     | Required positive finite TTL in milliseconds, passed to the store.                                                                                                      |
| `maxBodyBytes?`             | Positive finite snapshot limit; default 1 MiB.                                                                                                                          |
| `snapshotTimeoutMs?`        | Positive finite response-body snapshot deadline; default 100ms.                                                                                                         |

Internal keys isolate app, HTTP method/route, scope and custom key.
`CachedResponse` stores `{ status, statusText, headers, body }`, with readonly
header pairs and `Uint8Array | null` bytes, rather than a live `Response`.
Every hit reconstructs an independent response; snapshotting does not consume
the original response returned to the caller. Authentication and rate checks
run on every hit.

Cache writes are committed only after the full middleware chain succeeds and
the final privacy headers/status are checked. Snapshots stay before global
compression. Synchronous stores are updated immediately; asynchronous writes
complete in the background and failures do not replace the business response.
A remote write may become visible after the response has returned.

Non-GET methods, errors/non-success responses, request/response `no-store`,
`private` responses under public scope, `Set-Cookie`, SSE, already-consumed
bodies, oversized bodies and slow snapshots are skipped. Invalidation belongs
to the backend: use expiry, clear a dedicated store, or change a business
version key. Internal namespace keys are opaque; deleting only the custom key
is insufficient. The example clears its dedicated store after writes.

Header decoration copies header metadata without creating a second stream
branch. A returned streaming body retains normal single-consumption semantics;
copy or buffer a response explicitly if the application intends to reuse it.

**WebSocket gateways.** All lifecycle decorators and registration functions
come from the same optional entry:

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

- `@WebSocket(path)` declares an exact gateway path, combined with the current
  app prefix. Params, wildcards, query and hash are rejected. Derived gateways
  need their own declaration.
- `@OnOpen()` and `@OnDrain()` receive `BackOneWebSocket<WebSocketData>`;
  `@OnMessage()` also receives `string | Uint8Array`; `@OnClose()` receives the
  socket, numeric code and string reason. Methods can be synchronous or async.
- `registerWebSockets(app, instances)` validates the complete batch before
  mounting and returns readonly `WebSocketGateway[]` descriptions:
  `{ path, gateway, events: [{ event, handler }] }`. Duplicate events or paths,
  including existing functional `app.ws` paths, are rejected.
- Gateway class `Use`, `Timeout`, `Authorize` and `RateLimit` run once per
  upgrade. They do not run per message. Class `Validate`, `Status`, `Header`
  and `Cache` are HTTP-only and rejected. Event methods cannot declare HTTP
  routes, `Use` or any system policy.
- Upgrade middleware finishes before accepting the connection; a short-circuit
  `Response` or `HttpError` rejects it. The framework shallow-copies `ctx.state`
  to optional `ws.data.state`, including `principal`. Existing global HTTP
  middleware behavior for matched upgrades is unchanged; it is not added to
  the upgrade chain.
- Synchronous exceptions and async callback rejections are contained; active
  connections close with 1011 without unhandled Promise rejections. Close
  callback failures are contained too.
- Functional `app.ws(path, handler, options?)` and `RouteGroup.ws` remain
  available. `WebSocketOptions.middlewares?: readonly Handler[]` runs only
  before upgrade and transports state in the same way.
  `app.hasWebSocket(path)` checks registration under the current prefix.

**Registration checks.** Only public instance methods are supported; static,
`#private` methods and paths containing query/hash are rejected. The complete
batch is validated before registration. Duplicate HTTP method/matching paths
are rejected across decorator registrations on the same app; separate apps
are independent. Shared dynamic segments must use the same parameter name,
for example `:id` in both `/users/:id/view` and `/users/:id/edit`. When mixing
functional HTTP routes, ensure they do not conflict with Controllers.

Bun 1.4.0 currently fails to transpile direct updates to `#private` fields
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
