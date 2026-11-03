# BackOne Utils（BackOne 通用工具包）

[English](./README.md) | 简体中文

[BackOne](https://github.com/geektech-team/backone/tree/main/packages/backone) 的通用工具包。

**零运行时依赖** —— 全部构建在 Bun 内置能力与标准 Web API 之上。

模块一览：

- `db` —— 数据库连接管理（**支持多库连接**）与类型安全增删改查，基于 `Bun.SQL`
- `id` —— ID 生成器（uuidv4 / uuidv7 / nanoid / snowflake）
- `cache` —— 内存缓存（TTL 过期 / LRU 淘汰），支持 `getOrSet`
- `jwt` —— HMAC JWT 签发与验证（HS256 / HS384 / HS512）
- `http` —— fetch 封装：超时、指数退避重试、请求头合并、JSON 解析
- `rate-limit` —— 限流器（固定窗口 / 滑动窗口 / 令牌桶）
- `schema` —— 轻量 schema 校验器（zod 风格，含类型推导）
- `config` —— 全局配置（从环境变量读取强类型配置，启动期 fail-fast 校验）

支持方言：**SQLite**、**PostgreSQL**、**MySQL**、**MariaDB**。

## 特性

- 零运行时依赖（构建在 Bun 的 `Bun.SQL` 与标准 Web API 之上）
- `DatabaseManager` 多库连接管理：`register` / `get` / `has` / `remove` / `close`
- `Table` 类型安全增删改查：`findById`、`findOne`、`findMany`、`count`、`exists`、`insert`、`insertMany`、`update`、`delete`
- 丰富的 `where` DSL：比较、`like`、`in` / `notIn`、`isNull`、`between`、`AND` / `OR` 组合
- 方言策略模式：标识符引用与 `RETURNING` 支持按方言区分（SQLite / PostgreSQL 直接返回变更行；MySQL / MariaDB 回退到 `LAST_INSERT_ID` / 前置 COUNT）
- `db.transaction(fn)` 事务，失败自动回滚
- 原生查询：标签模板（`db.query\`...\``）与参数化字符串（`db.raw(sql, params)`）
- 所有值经 `?` 占位符参数化，表名 / 列名按方言引用，杜绝字符串拼接注入
- 策略化 ID 生成、内存 TTL/LRU 缓存、WebCrypto JWT、可重试 fetch 客户端、三种限流策略、zod 风格校验器
- `defineConfig` 从环境变量读取强类型配置：命名空间前缀、自动类型转换、默认值、启动期聚合报错、深冻结结果

## 环境要求

- Bun >= 1.3

## 快速开始

同一业务的 Repository、Service、Controller、模型和 Schema 就近放在
`modules/<feature>/`。BackOne 的 `@Module` 类显式组合业务对象，Application
注入 Database 并负责关闭。模块注册不会自动初始化或关闭数据库连接。

推荐用业务 Repository 类组合 Database/Table，再通过构造函数注入 Service。
Repository 借用连接，创建连接的 Application 负责关闭。

```ts
import { Database, type Table } from '@geektech/backone-utils';

interface User {
  id: number;
  name: string;
}

class UsersRepository {
  private readonly users: Table<User>;

  constructor(database: Database) {
    this.users = database.table<User>('users');
  }

  list(): Promise<User[]> {
    return this.users.findMany({ orderBy: { id: 'asc' } });
  }

  create(name: string): Promise<User | null> {
    return this.users.insert({ name });
  }
}

const database = new Database({ url: ':memory:' });
try {
  await database.raw(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )`);
  const users = new UsersRepository(database);
  await users.create('Alice');
  console.log(await users.list());

  await database.transaction(async (tx) => {
    const transactionalUsers = new UsersRepository(tx);
    await transactionalUsers.create('Bob');
  });
} finally {
  await database.close();
}
```

事务内必须使用 tx 创建 Repository，避免继续访问事务外连接。建表 DDL 为
SQLite 语法，其他方言需替换。多库连接可由 Application 持有的 DatabaseManager
统一管理。完整分层示例见[对象优先指南](../../docs/object-first.md)。

## 多库连接管理（DatabaseManager）

| 方法                      | 说明                                               |
| ------------------------- | -------------------------------------------------- |
| `register(name, options)` | 注册具名连接并返回 `Database` 实例                 |
| `get(name)`               | 解析已注册的 `Database`（未注册抛 `DB_NOT_FOUND`） |
| `has(name)`               | 是否已注册                                         |
| `names()` / `list()`      | 已注册的名称 / 实例列表                            |
| `remove(name)`            | 关闭并移除单个数据库                               |
| `close()`                 | 关闭全部数据库                                     |

`DatabaseManager` 相关错误携带稳定 `code`：`DB_ALREADY_REGISTERED`、
`DB_NOT_FOUND`、`DB_CLOSED`、`DB_MISSING_URL`、`DB_EMPTY_WRITE`、
`DB_EMPTY_WHERE`（见 `BackoneDbError`）。

## Database

### 连接配置

```ts
interface DbConnectionOptions {
  name?: string; // 库的业务名称（默认 'default'）
  url?: string | URL; // 连接串，见下方示例
  dialect?: 'sqlite' | 'postgres' | 'mysql' | 'mariadb'; // 缺省按 url 推断
  readonly?: boolean; // 只读标记（当前版本不强制拦截写入）
  max?: number; // 连接池大小（服务端方言）
  idleTimeout?: number;
  connectionTimeout?: number;
  tls?: boolean | string | Record<string, unknown>;
  bigint?: boolean;
}
```

`url` 示例：

- `postgres://user:pass@localhost:5432/mydb`
- `mysql://user:pass@localhost:3306/mydb`
- `:memory:` / `sqlite://:memory:` —— SQLite 内存库
- `./data/app.db` / `sqlite://./data/app.db` —— SQLite 文件库

### 查询

```ts
// 标签模板（安全参数绑定）
const row = await db.query<User>`SELECT * FROM users WHERE id = ${id}`;

// 原始 SQL + `?` 占位符（Bun 统一参数化）
const rows = await db.raw<User[]>('SELECT * FROM users WHERE age > ?', [18]);

// 事务（出错自动回滚）
const [a, b] = await db.transaction(async (tx) => {
  const t = tx.table<User>('users');
  return [await t.insert({ name: 'a' }), await t.insert({ name: 'b' })];
});

await db.close();
```

## Table（增删改查）

```ts
const users = db.get('primary').table<User>('users');
// 自定义主键：db.table<Row>('orders', { primaryKey: 'order_id' })

await users.findById(1); // T | null
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

await users.insert({ name: 'bob', age: 25 }); // 返回插入后的行（含自增主键）
await users.insertMany([{ name: 'a' }, { name: 'b' }]); // { rows, count }
await users.update({ age: 26 }, { name: 'bob' }); // { count, rows }
await users.delete({ name: 'bob' }); // { count, rows }
```

说明：

- 方言支持 `RETURNING`（SQLite / PostgreSQL）时，`insert` / `insertMany`
  直接返回插入后的行；MySQL / MariaDB 下 `insert` 按主键回查
  （`LAST_INSERT_ID`，默认主键 `id`），`insertMany` 返回 `rows: []` 与
  影响条数 `count`。
- `update` / `delete` 要求 `where` 非空（否则抛 `DB_EMPTY_WHERE`），防止
  误全表更新 / 删除。
- MySQL / MariaDB 下 `update` / `delete` 的 `count` 为语句执行前匹配的行数
  （非原子口径，事务内使用更稳妥）。

### where DSL

```ts
where: {
  // 裸值 = 等值；null = IS NULL
  name: 'alice',
  // 操作符
  age: { gte: 18, lt: 65 },
  status: { in: ['active', 'pending'] },
  bio: { like: '%engineer%' },
  deleted_at: { isNull: true },
  score: { between: [80, 100] },
  id: { ne: 1 },
  // 组合（AND 优先级高于 OR）
  AND: [{ a: 1 }, { b: 2 }],
  OR: [{ role: 'admin' }, { role: 'editor' }],
}
```

## 包导出

```ts
import {
  Database, // 单连接封装
  DatabaseManager, // 多库连接管理
  createDatabase, // 独立 Database 工厂
  Table, // 单表增删改查句柄
  BackoneDbError, // 带稳定错误码的类型化错误
  createId, // 快捷生成 ID（默认 uuidv7）
  createIdGenerator, // 策略化 ID 生成器工厂
  createCache, // TTL / LRU 缓存工厂
  createJwt, // JWT 签发 / 验证服务
  createHttpClient, // 带重试 / 超时的 fetch 封装
  createRateLimiter, // 固定 / 滑动 / 令牌桶限流工厂
  v, // schema 校验器工厂（zod 风格）
  defineConfig, // 从环境变量读取强类型配置（前缀 + 转换 + fail-fast）
  EnvSource, // 环境变量读取源（Bun.env + process.env）
  ConfigError, // 配置错误（稳定错误码）
  BackoneError, // 统一错误基类（稳定错误码）
  name,
  version,
} from '@geektech/backone-utils';
```

## ID 生成（id）

统一 `IdGenerator` 接口下的策略化 ID 生成器
（`createIdGenerator(strategy)` / `createId(strategy)`，默认 `uuidv7`）：

| 策略        | 说明                                       |
| ----------- | ------------------------------------------ |
| `uuidv4`    | 随机 UUID（Web Crypto）                    |
| `uuidv7`    | 时间有序 UUID（Bun 内置，适合做主键）      |
| `nanoid`    | 短 URL 安全 ID，可配字符表与长度           |
| `snowflake` | 41+10+12 位雪花 ID，单调递增，时钟回拨安全 |

```ts
import { createId, createIdGenerator } from '@geektech/backone-utils';
const id = createId('nanoid', { length: 12 });
const ids = createIdGenerator('snowflake');
await users.insert({ id: ids.generate(), name: 'alice' });
```

## 缓存（cache）

实现同一 `Cache` 接口的内存缓存（依赖倒置，可互换）：

- `TtlCache` —— 无容量限制，惰性 TTL 过期
- `LruCache` —— 容量上限 + LRU 淘汰，可选 TTL
- `createCache({ ttlMs, capacity })`：设置 capacity 时自动选 LruCache
- `cache.getOrSet(key, factory, ttlMs?)` —— 缓存异步结果（如数据库查询）

```ts
import { createCache } from '@geektech/backone-utils';
const rank = createCache<number>({ ttlMs: 60_000, capacity: 1000 });
const score = await rank.getOrSet('city:shanghai', () => loadScore('shanghai'));
```

## JWT（jwt）

基于 WebCrypto 的 HMAC JWT —— `HS256 / HS384 / HS512`，零依赖。
`verify` 校验结构、签名、`exp` / `nbf` 与可选的 `issuer` / `audience`；
失败携带稳定错误码（`JWT_EXPIRED`、`JWT_BAD_SIGNATURE`、`JWT_MALFORMED`、
`JWT_NOT_YET_VALID`、`JWT_CLAIM_MISMATCH`）。

```ts
import { createJwt } from '@geektech/backone-utils';
const jwt = createJwt({ secret: process.env.JWT_SECRET });
const token = await jwt.sign({ sub: '42', role: 'admin' }, { expiresIn: 3600 });
const payload = await jwt.verify(token, { issuer: 'city-index' });
```

## HTTP 客户端（http）

`fetch` 封装：baseUrl 拼接与 query 合并、请求头合并、JSON 自动序列化 /
解析、超时（与外部 `AbortSignal` 合并）、指数退避重试（可重试状态码 /
网络错误 / 超时；单次请求 `retry: false` 关闭）。非 2xx 抛携带状态的
`HttpError`。

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

## 限流（rate-limit）

统一 `RateLimiter` 接口下的按 key 内存限流器：

- `fixed-window` —— 窗口内计数，窗口结束重置
- `sliding-window` —— 时间戳日志，持续剔除过期请求
- `token-bucket` —— 按速率补充令牌，支持突发与平滑

```ts
import { createRateLimiter } from '@geektech/backone-utils';
const limiter = createRateLimiter({
  limit: 60,
  windowMs: 60_000,
  strategy: 'token-bucket',
});
const { allowed, remaining, resetAt } = limiter.consume(clientIp);
```

## 校验（schema）

轻量 zod 风格校验器，带 TypeScript 类型推导：

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

支持：`string` / `number` / `boolean` / `literal` / `enum` / `array` /
`object` / `record` / `optional` / `nullable` / `union`。校验失败会聚合全部
问题并带字段路径（`ValidationError.issues`）。

## 开发

```bash
bun run build      # 产出 dist（类型声明 + 打包）
bun test           # 单元测试（SQLite 内存库）
bun run lint       # eslint + prettier
bunx tsc --noEmit  # 类型检查
```

## 后续规划

- DB：upsert / 批量删除、连接重试与健康检查、迁移辅助
- 分布式缓存 / 限流后端（如 Redis 适配器）

## License

MIT
