# BackOne Utils

[简体中文](./README-zh.md)

General-purpose toolkit for [BackOne](https://github.com/geektech-team/backone/tree/main/packages/backone).

**Zero runtime dependencies** — everything is built on Bun's built-in
capabilities and standard Web APIs.

Modules:

- `db` — multi-database connection management and type-safe CRUD on `Bun.SQL`
- `id` — ID generators (uuidv4 / uuidv7 / nanoid / snowflake)
- `cache` — in-memory cache (TTL expiry / LRU eviction) with `getOrSet`
- `jwt` — HMAC JWT signing & verification (HS256 / HS384 / HS512)
- `http` — fetch wrapper: timeouts, exponential-backoff retries, header merge, JSON parsing
- `rate-limit` — fixed-window / sliding-window / token-bucket limiters
- `schema` — lightweight zod-style validators with type inference
- `config` — typed global configuration read from environment variables (fail-fast validation)

Supported database dialects: **SQLite**, **PostgreSQL**, **MySQL**, **MariaDB**.

## Features

- Zero runtime dependencies (built on Bun's `Bun.SQL` and standard Web APIs)
- `DatabaseManager` for multiple named connections (`register` / `get` / `has` / `remove` / `close`)
- Type-safe CRUD via `Table`: `findById`, `findOne`, `findMany`, `count`, `exists`, `insert`, `insertMany`, `update`, `delete`
- Expressive `where` DSL: comparison, `like`, `in` / `notIn`, `isNull`, `between`, `AND` / `OR` groups
- Dialect strategy pattern: identifier quoting and `RETURNING` support differ per dialect (SQLite/PostgreSQL return mutated rows; MySQL/MariaDB fall back to `LAST_INSERT_ID` / pre-count)
- Transactions via `db.transaction(fn)` with automatic rollback
- Raw queries: tagged templates (`db.query\`...\``) and parameterized strings (`db.raw(sql, params)`)
- Every value is bound through `?` placeholders; table/column names are quoted by the dialect — no string-concatenated SQL
- Strategy-based ID generators, in-memory TTL/LRU cache, WebCrypto JWT, fetch client with retries, three rate-limiting strategies, zod-style validators

## Requirements

- Bun >= 1.3

## Quick Start

```ts
import { DatabaseManager } from '@geektech/backone-utils';

interface User {
  id: number;
  name: string;
  age: number | null;
}

const db = new DatabaseManager();
db.register('primary', { url: process.env.DATABASE_URL }); // postgres://... / mysql://...
db.register('audit', { url: ':memory:' }); // sqlite in-memory

const users = db.get('primary').table<User>('users');

const created = await users.insert({ name: 'alice', age: 30 });
const list = await users.findMany({
  where: { age: { gte: 18 }, OR: [{ name: { like: 'a%' } }, { city: 'x' }] },
  orderBy: { id: 'desc' },
  limit: 20,
});
await users.update({ age: 31 }, { name: 'alice' });
await users.delete({ name: 'alice' });

await db.close();
```

## Database Manager (multi-db)

| Method | Description |
| --- | --- |
| `register(name, options)` | Register a named connection and return its `Database` |
| `get(name)` | Resolve a registered `Database` (throws `DB_NOT_FOUND` if missing) |
| `has(name)` | Whether a name is registered |
| `names()` / `list()` | Registered names / instances |
| `remove(name)` | Close and remove one database |
| `close()` | Close all databases |

`DatabaseManager` errors carry a stable `code`: `DB_ALREADY_REGISTERED`,
`DB_NOT_FOUND`, `DB_CLOSED`, `DB_MISSING_URL`, `DB_EMPTY_WRITE`,
`DB_EMPTY_WHERE` (see `BackoneDbError`).

## Database

### Connection options

```ts
interface DbConnectionOptions {
  name?: string;       // business name (default 'default')
  url?: string | URL;  // connection string, see examples below
  dialect?: 'sqlite' | 'postgres' | 'mysql' | 'mariadb'; // inferred from url
  readonly?: boolean;  // read-only marker (not enforced yet)
  max?: number;        // pool size (server dialects)
  idleTimeout?: number;
  connectionTimeout?: number;
  tls?: boolean | string | Record<string, unknown>;
  bigint?: boolean;
}
```

`url` examples:

- `postgres://user:pass@localhost:5432/mydb`
- `mysql://user:pass@localhost:3306/mydb`
- `:memory:` / `sqlite://:memory:` — SQLite in-memory
- `./data/app.db` / `sqlite://./data/app.db` — SQLite file

### Queries

```ts
// tagged template (safe parameter binding)
const row = await db.query<User>`SELECT * FROM users WHERE id = ${id}`;

// raw SQL with ? placeholders (parameterized by Bun)
const rows = await db.raw<User[]>('SELECT * FROM users WHERE age > ?', [18]);

// transactions (auto rollback on error)
const [a, b] = await db.transaction(async (tx) => {
  const t = tx.table<User>('users');
  return [await t.insert({ name: 'a' }), await t.insert({ name: 'b' })];
});

await db.close();
```

## Table (CRUD)

```ts
const users = db.get('primary').table<User>('users');
// custom primary key: db.table<Row>('orders', { primaryKey: 'order_id' })

await users.findById(1);                       // T | null
await users.findOne({ where: { name: 'alice' } });
await users.findMany({
  where: { age: { between: [18, 30] } },
  orderBy: [{ age: 'desc' }, { id: 'asc' }],
  limit: 10,
  offset: 20,
  select: ['id', 'name'],
});
await users.count({ status: { in: ['active', 'pending'] } });
await users.exists({ name: 'alice' });

await users.insert({ name: 'bob', age: 25 });        // inserted row (with auto id)
await users.insertMany([{ name: 'a' }, { name: 'b' }]); // { rows, count }
await users.update({ age: 26 }, { name: 'bob' });     // { count, rows }
await users.delete({ name: 'bob' });                  // { count, rows }
```

Notes:

- `insert` / `insertMany` return the inserted rows when the dialect supports
  `RETURNING` (SQLite / PostgreSQL). On MySQL / MariaDB, `insert` re-selects by
  the primary key (`LAST_INSERT_ID`, default primary key `id`); `insertMany`
  returns `rows: []` with the affected `count`.
- `update` / `delete` require a non-empty `where` (throws `DB_EMPTY_WHERE`) to
  prevent full-table mistakes.
- On MySQL / MariaDB, `update` / `delete` report the matched row count computed
  before the statement (non-atomic unless run inside a transaction).

### Where DSL

```ts
where: {
  // bare value = equality; null = IS NULL
  name: 'alice',
  // operators
  age: { gte: 18, lt: 65 },
  status: { in: ['active', 'pending'] },
  bio: { like: '%engineer%' },
  deleted_at: { isNull: true },
  score: { between: [80, 100] },
  id: { ne: 1 },
  // groups (AND binds tighter than OR)
  AND: [{ a: 1 }, { b: 2 }],
  OR: [{ role: 'admin' }, { role: 'editor' }],
}
```

## Package exports

```ts
import {
  Database,          // single-connection wrapper
  DatabaseManager,   // multi-connection manager
  createDatabase,    // standalone Database factory
  Table,             // per-table CRUD handle
  BackoneDbError,    // typed errors with stable codes

  createId,          // quick ID generation (default uuidv7)
  createIdGenerator, // strategy-based ID generator factory
  createCache,       // TTL / LRU cache factory
  createJwt,         // JWT sign/verify service
  createHttpClient,  // fetch wrapper with retries/timeouts
  createRateLimiter, // fixed/sliding/token-bucket limiter factory
  v,                 // schema validator factory (zod style)
  defineConfig,      // typed config from env (prefix + coercion + fail-fast)
  EnvSource,         // env read source (Bun.env + process.env)
  ConfigError,       // config errors with stable codes
  BackoneError,      // shared error base with stable codes
  name, version,
} from '@geektech/backone-utils';
```

## ID generation (`id`)

Strategy-based ID generators behind one `IdGenerator` interface
(`createIdGenerator(strategy)` / `createId(strategy)`, default `uuidv7`):

| Strategy | Description |
| --- | --- |
| `uuidv4` | Random UUID (Web Crypto) |
| `uuidv7` | Time-ordered UUID (Bun built-in, DB-primary-key friendly) |
| `nanoid` | Short URL-safe IDs, configurable alphabet / length |
| `snowflake` | 41+10+12-bit snowflake IDs, monotonic, clock-drift safe |

```ts
import { createId, createIdGenerator } from '@geektech/backone-utils';
const id = createId('nanoid', { length: 12 });
const ids = createIdGenerator('snowflake');
await users.insert({ id: ids.generate(), name: 'alice' });
```

## Cache (`cache`)

In-memory caches implementing one `Cache` interface (dependency inversion):

- `TtlCache` — unbounded, lazy TTL expiry
- `LruCache` — capacity-bound LRU eviction, optional TTL
- `createCache({ ttlMs, capacity })` picks `LruCache` when capacity is set
- `cache.getOrSet(key, factory, ttlMs?)` — memoize async results (DB queries)

```ts
import { createCache } from '@geektech/backone-utils';
const rank = createCache<number>({ ttlMs: 60_000, capacity: 1000 });
const score = await rank.getOrSet('city:shanghai', () => loadScore('shanghai'));
```

## JWT (`jwt`)

HMAC-signed JWT with Web Crypto — `HS256 / HS384 / HS512`, zero dependencies.
`verify` checks structure, signature, `exp` / `nbf`, and optional `issuer` /
`audience`; failures carry stable codes (`JWT_EXPIRED`, `JWT_BAD_SIGNATURE`,
`JWT_MALFORMED`, `JWT_NOT_YET_VALID`, `JWT_CLAIM_MISMATCH`).

```ts
import { createJwt } from '@geektech/backone-utils';
const jwt = createJwt({ secret: process.env.JWT_SECRET });
const token = await jwt.sign({ sub: '42', role: 'admin' }, { expiresIn: 3600 });
const payload = await jwt.verify(token, { issuer: 'city-index' });
```

## HTTP client (`http`)

`fetch` wrapper: base URL + query merging, header merge, JSON auto
serialize/parse, timeout (merged with an external `AbortSignal`),
exponential-backoff retries (retryable statuses, network errors, timeouts;
per-request `retry: false` disables). Non-2xx responses throw `HttpError`
with the status.

```ts
import { createHttpClient } from '@geektech/backone-utils';
const api = createHttpClient({
  baseUrl: 'https://api.example.com',
  timeoutMs: 5000,
});
const { data } = await api.get<{ total: number }>('/stats', {
  query: { year: 2026 },
});
```

## Rate limiting (`rate-limit`)

Per-key in-memory limiters behind one `RateLimiter` interface:

- `fixed-window` — counter per window, reset at window end
- `sliding-window` — timestamp log, expiring requests dropped continuously
- `token-bucket` — refills at a rate, allows bursts

```ts
import { createRateLimiter } from '@geektech/backone-utils';
const limiter = createRateLimiter({
  limit: 60,
  windowMs: 60_000,
  strategy: 'token-bucket',
});
const { allowed, remaining, resetAt } = limiter.consume(clientIp);
```

## Validation (`schema`)

Lightweight zod-style validators with TypeScript inference:

```ts
import { v, type InferType } from '@geektech/backone-utils';

const citySchema = v.object({
  name: v.string({ minLength: 1 }),
  population: v.number({ min: 0, integer: true }),
  tags: v.array(v.string()),
  score: v.optional(v.number({ min: 0, max: 100 })),
});
type City = InferType<typeof citySchema>;

const result = citySchema.safeParse(body);
// { success: true, data: City } | { success: false, error: ValidationError }
```

Supported: `string` / `number` / `boolean` / `literal` / `enum` / `array` /
`object` / `record` / `optional` / `nullable` / `union`. Failures aggregate
all issues with field paths (`ValidationError.issues`).

## Development

```bash
bun run build      # emit dist (types + bundle)
bun test           # unit tests (SQLite in-memory)
bun run lint       # eslint + prettier
bunx tsc --noEmit  # type check
```

## Roadmap

- DB: upsert / batch delete, connection retry & health check, migration helpers
- Distributed cache / rate-limit backends (e.g. Redis adapters)

## License

MIT
