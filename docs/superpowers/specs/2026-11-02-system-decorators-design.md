# System decorators

用户确认将上一轮列出的全部能力加入系统装饰器，并同步文档。

## Contract

- Existing standard Controller/HTTP/Use decorators remain compatible. Method
  declarations use standard decorator metadata keyed by member name, so wrapping
  method decorators work in either stacking order. The entry initializes missing
  Symbol.metadata for TypeScript-emitted consumers. TypeScript >=5.2 is required.
- Add Validate, validatedBody/validatedQuery/validatedParams, Status, Header,
  Authorize/getPrincipal, RateLimit, Timeout, Cache and WebSocket lifecycle
  decorators. All are exported from @geektech/backone/decorators.
- Existing Use middleware remains the outer chain (base, derived, method).
  System phases inside it are timeout, authorize, rateLimit, validate, response,
  cache, business method. This prevents a cache hit from bypassing security.
  Method timeout/cache replace inherited defaults; authorization and rate limits
  accumulate. Status/header defaults apply base first then method.
- Schema/limiter/cache/authentication are injected through structural interfaces;
  no published package runtime dependencies. Preserve current dirty changes and
  user-updated versions; no publish or commit in this task.

## HTTP APIs

- Validate({ body?, query?, params? }) accepts schemas with parse(unknown): T.
  Query values remain strings; repeated keys become string arrays. Conversion and
  normalization are explicit parser responsibilities. Parse failures return 400.
  validatedBody(ctx, schema), validatedQuery, validatedParams retrieve typed data
  only after successful validation using that schema; raw inputs stay unchanged.
- Status(code) sets a default before invoking business code. Explicit Response
  status and business ctx.status win. 204/205/304 plain returns become empty.
- Header(name, value) supplies a default header. Business ctx/Response values
  win. Header handling also covers direct/immutable Response results.
- Timeout(optionsOrMs) uses existing timeout behavior: 504 response, work is not
  automatically cancelled. Positive finite milliseconds required.
- Authorize({ authenticate, authorize? }) resolves a principal (object or null).
  Missing/rejected authentication gives 401, failed policy gives 403; explicit
  HttpError is preserved. getPrincipal<P>(ctx) reads the established principal.
- RateLimit(limiter, { key }) requires an explicit key function. consume(key)
  may be sync or async; rejection returns 429 and Retry-After from resetAt.
- Cache({ store, key, scope, ttlMs, maxBodyBytes?, snapshotTimeoutMs? }) caches
  successful GET results. scope is explicit 'public' or a user/tenant key resolver.
  Store uses get/set with a CachedResponse snapshot, never a live Response. Keys
  include app, route, scope, custom key. Skip no-store, public/private mismatch,
  Set-Cookie, SSE, oversized or slow response bodies. Cache hits reconstruct a
  fresh Response; errors and unsafe HTTP methods are not cached. Default bound:
  1 MiB, snapshot read deadline 100ms. Invalidation is backend-controlled (clear
  or expiration; namespace keys are internal). Auth/rate checks run on every hit.
- Capture before global compression, defer writes until the final HTTP response
  passes privacy/status checks. Async backend writes are detached with rejection
  containment; they must not extend request deadlines or replace business output.
  Header reconstruction transfers the existing stream without an orphan tee.

## WebSocket APIs

- WebSocket(path) declares a gateway; OnOpen/OnMessage/OnClose/OnDrain declare
  public instance callbacks. registerWebSockets(app, instances) explicitly mounts
  gateways and returns readonly descriptions. Paths are exact, no params/wildcard.
- Add optional WebSocketOptions.middlewares to app.ws. Run these middleware before
  upgrade, honor short circuits/errors, and copy ctx.state into ws.data.state.
  Global HTTP middleware behavior remains unchanged for WebSocket upgrades.
- Gateway class Use, Timeout, Authorize and RateLimit run once per upgrade.
  HTTP-only policies and policies on event methods are rejected at registration.
  Asynchronous event failures close the connection with 1011 and do not create
  unhandled rejections. Existing functional app.ws remains usable.

## Delivery

Update bilingual README, full docs-site APIs and examples, controller CLI scaffold,
and playground (HTTP policies plus an authenticated gateway). Verify source and
built exports, independent generated project typecheck, real WS handshakes/events,
all tests, root/docs types, builds, lint and package contents. Leave uncommitted.
