# System Decorators Implementation Plan

> Agent workflow: implement in this checkout using TDD, with independent modules delegated per dispatching-parallel-agents. No commits or publication.

**Goal:** Deliver every approved system decorator and synchronized documentation.
**Architecture:** Shared standard metadata and staged middleware compilation; injected policy backends; explicit WebSocket gateways with upgrade middleware.
**Tech stack:** strict TypeScript >=5.2, Bun >=1.3.10, bun:test, zero runtime dependencies.
**Spec:** `docs/superpowers/specs/2026-11-02-system-decorators-design.md`

## Tasks

- [x] Metadata/registration: member-based standard metadata, wrapper composition,
      policy ordering, inherited defaults, app/route runtime scope; regression tests.
- [x] Validation/response: Validate and typed helpers, Status, Header, Timeout;
      real request tests for bad input, explicit responses, headers, bodyless statuses.
- [x] Authentication/rate/cache: injected structural backends; security before
      cache; isolation, expiry, clone, errors, bounded stream tests.
- [x] WebSocket: gateway/events, upgrade middleware, state and async lifecycle;
      real handshake rejection, success, events and failure tests.
- [x] Integration: optional entry exports, shared build chunks for HttpError
      identity, built consumers, CLI template and playground policy examples.
- [x] Docs: both README languages, docs-site complete reference and CLI usage,
      execution order, version floor, cache/timeout/upgrade semantics.
- [x] Verify all tests, types, builds, lint and package contents; independent review.

## Shared module interfaces

- metadata.ts: `PolicyPhase = 'timeout' | 'authorize' | 'rateLimit' | 'validate' | 'response' | 'cache'`;
  `SystemPolicy { phase; handler: Handler; httpOnly?: boolean }`;
  `policyDecorator(policy: SystemPolicy): SystemDecorator`;
  `SystemDecorator` accepts class or public method;
  `classMetadata(target, context)` and `methodMetadata(target, context)` record
  standard metadata. `findClassMetadata(constructor)` returns own definition;
  ClassMetadata has prefix?, webSocket?, middlewares, policies, methods map;
  MethodMetadata has routes, middlewares, policies, events (`open/message/close/drain`).
- runtime.ts: `setRouteRuntime(ctx, app, method, path)` and
  `getRouteRuntime(ctx): { namespace: string }` for opaque per-app/route cache keys.
- register.ts: `compilePolicies(policies): Handler[]` orders phases, selecting
  last timeout/cache. Shared by HTTP and gateway registration.
- validation.ts, responses.ts, access.ts, cache.ts and websocket.ts export their
  public decorators/types; root integrates index.ts. Each module owns its tests.

## Review focus

- Cache cannot bypass authorization, share users/apps, consume returned bodies,
  hang on streams, replay cookies or cache failures.
- Standard wrappers and inheritance must not lose routes or mix metadata.
- Typed validation must preserve raw input and expose the schema's output type.
- Response defaults must preserve explicit status/headers and bodyless semantics.
- Failed WS authentication must never upgrade; async event failure must be contained.
- Source and built subpaths must share HttpError class identity.

## Execution record

- User authorized all listed decorators and requested synchronized documentation.
- Existing uncommitted core/CLI version changes are preserved.

- Implementation complete in current checkout; all approved decorators exported.
- Source policies, method wrappers, inherited metadata, real WebSocket upgrade and
  lifecycle checks, generated source/tsc-emitted consumers, and built package entry
  identity verified. Final full suite: 295 pass, 0 fail, 25 files.
- Root and docs typechecks, full package build, docs build, package dry-run and
  formatting/diff checks pass. Affected framework/CLI lint is clean; utility
  package retains its 18 pre-existing warnings.
- Independent read-only review completed. All three material findings reproduced
  and fixed by RED/GREEN tests: detached/contained async cache writes prevent
  post-timeout hangs; Header transfers a single stream instead of orphaning a tee;
  plain return Content-Type defaults survive serialization. Explicit 200 and
  equal-value status assignments also retain priority through mutation versions.
- Cache candidate bodies remain before global gzip, while final success/privacy
  checks gate writes. Async writes are best-effort and may publish after response;
  they cannot hold request completion or replace the successful response.
- Documentation includes EN/ZH API reference, source examples checked with both
  Bun-only and DOM types, current displayed package versions, lifecycle semantics,
  cache invalidation and single-consumption streaming behavior.
- OnDrain declaration/registration is tested; real forced-backpressure drain was
  not triggered. Existing Bun1.4.0 decorated-private-field reassignment limitation
  remains documented. No real remote cache or rate backend was contacted; injected
  asynchronous adapters are exercised in tests.
- Existing user version updates preserved. No commit or publication performed.
