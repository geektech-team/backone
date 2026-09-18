import type { VNode } from '@geektech/tsone';
import { h } from '@geektech/tsone';
import {
  codeblock,
  h2,
  h3,
  p,
  ul,
  table,
  callout,
  inline,
  hr,
} from '../components';
import type { PageContext } from '../content';

/* ------------------------------------------------------------------ */
/* 概览                                                                 */
/* ------------------------------------------------------------------ */

export function renderUtilsOverview(ctx: PageContext): VNode | VNode[] {
  return [
    p([
      '@geektech/backone-utils 是 BackOne 的通用工具包：零运行时依赖，全部构建在 Bun 内置能力与标准 Web API 之上。包含数据库（多库 CRUD）、ID 生成、缓存、JWT、HTTP 客户端、限流、Schema 校验与全局配置八个模块。',
    ]),
    h2('特性'),
    ul([
      [
        inline('零运行时依赖'),
        '：数据库基于 Bun.SQL，JWT 基于 WebCrypto，HTTP 基于 fetch。',
      ],
      [
        inline('多库方言'),
        '：SQLite / PostgreSQL / MySQL / MariaDB 一套 API 统一读写。',
      ],
      [
        inline('策略模式'),
        '：ID 生成、缓存、限流均通过工厂按策略创建，可互换。',
      ],
      [
        inline('类型安全'),
        '：Schema 校验器带类型推导，配置读取后深冻结并推导完整类型。',
      ],
      [inline('稳定错误码'), '：各模块错误统一携带稳定 code，便于程序化处理。'],
    ]),
    h2('安装'),
    codeblock('bun add @geektech/backone-utils'),
    h2('模块一览'),
    table(
      ['模块', '核心导出', '说明'],
      [
        [
          [inline('db')],
          [inline('DatabaseManager / Database / Table')],
          ['多库连接管理与增删改查，基于 Bun.SQL'],
        ],
        [
          [inline('id')],
          [inline('createId / createIdGenerator')],
          ['uuidv4 / uuidv7 / nanoid / snowflake'],
        ],
        [
          [inline('cache')],
          [inline('createCache')],
          ['TTL 惰性过期 / LRU 容量淘汰，含 getOrSet'],
        ],
        [
          [inline('jwt')],
          [inline('createJwt')],
          ['HMAC JWT 签发与验证（HS256/384/512）'],
        ],
        [
          [inline('http')],
          [inline('createHttpClient')],
          ['fetch 封装：超时、指数退避重试、JSON'],
        ],
        [
          [inline('rate-limit')],
          [inline('createRateLimiter')],
          ['固定窗口 / 滑动窗口 / 令牌桶'],
        ],
        [
          [inline('schema')],
          [inline('v')],
          ['zod 风格轻量校验器，含类型推导与 safeParse'],
        ],
        [
          [inline('config')],
          [inline('defineConfig')],
          ['从环境变量读取强类型配置，启动期 fail-fast'],
        ],
      ]
    ),
    codeblock(
      [
        'import {',
        '  DatabaseManager, createId, createCache, createJwt,',
        '  createHttpClient, createRateLimiter, v, defineConfig,',
        "} from '@geektech/backone-utils';",
      ].join('\n')
    ),
    hr(),
    p([
      '按需阅读：',
      h('a', { href: ctx.href('/utils/db') }, ['数据库']),
      ' · ',
      h('a', { href: ctx.href('/utils/config') }, ['全局配置']),
      ' · ',
      h('a', { href: ctx.href('/utils/schema') }, ['Schema 校验']),
      ' 是最常用的三个模块。',
    ]),
  ];
}

/* ------------------------------------------------------------------ */
/* 数据库                                                                */
/* ------------------------------------------------------------------ */

export function renderUtilsDb(_ctx: PageContext): VNode | VNode[] {
  return [
    p([
      'db 模块基于 Bun 内置的 ',
      inline('Bun.SQL'),
      '（零运行时依赖），统一支持 SQLite / PostgreSQL / MySQL / MariaDB 四种方言。核心是三个类：',
      inline('Database'),
      '（单连接）、',
      inline('DatabaseManager'),
      '（多库管理）与 ',
      inline('Table'),
      '（单表 CRUD）。',
    ]),
    h2('建立连接'),
    codeblock(
      [
        "import { Database } from '@geektech/backone-utils';",
        '',
        '// SQLite 内存库（缺省 url 时）',
        'const db = new Database();',
        '',
        '// SQLite 文件',
        "const db2 = new Database({ url: './data/app.db' });",
        '',
        '// PostgreSQL / MySQL / MariaDB',
        "const pg = new Database({ url: 'postgres://user:pass@localhost:5432/mydb' });",
        "const my = new Database({ url: 'mysql://user:pass@localhost:3306/mydb' });",
      ].join('\n')
    ),
    callout(
      '说明',
      p([
        '方言缺省时按 url 推断，无法推断时按 sqlite 处理；也支持 ',
        inline("url: ':memory:'"),
        '、',
        inline('sqlite://:memory:'),
        ' 等形式。',
      ])
    ),
    h2('多库管理 DatabaseManager'),
    codeblock(
      [
        'const db = new DatabaseManager();',
        "db.register('main', { url: process.env.PRIMARY_DB_URL });",
        "db.register('analytics', { url: process.env.ANALYTICS_DB_URL, dialect: 'mysql' });",
        '',
        "const users = db.get('main').table<User>('users');",
        'db.has("main");       // true',
        'db.names();           // ["main", "analytics"]',
        'await db.remove("main"); // 关闭并移除',
        'await db.close();     // 关闭全部',
      ].join('\n')
    ),
    p([
      '重复注册同名库抛 ',
      inline('DB_ALREADY_REGISTERED'),
      '，读取未注册库抛 ',
      inline('DB_NOT_FOUND'),
      '。',
    ]),
    h2('原生查询'),
    p([
      inline('query'),
      ' 支持标签模板（安全参数绑定）与纯字符串；',
      inline('raw'),
      ' 用 ',
      inline('?'),
      ' 占位符（Bun 统一参数化）：',
    ]),
    codeblock(
      [
        '// 标签模板：自动参数绑定',
        'const rows = await db.query<Task[]>`SELECT * FROM tasks WHERE id = ${id}`;',
        '',
        '// 原生 SQL（? 占位符）',
        "const rows2 = await db.raw<Row[]>('SELECT * FROM tasks WHERE done = ?', [0]);",
      ].join('\n')
    ),
    h2('Table CRUD'),
    codeblock(
      [
        "const tasks = db.table<Task>('tasks');",
        '',
        '// 查询',
        'await tasks.findById(1);',
        "await tasks.findOne({ where: { title: { like: '%报表%' } } });",
        'await tasks.findMany({ where: { done: 0 }, orderBy: { created_at: "desc" }, limit: 20 });',
        'await tasks.count({ done: 1 });',
        'await tasks.exists({ id: 5 });',
        '',
        '// 写入',
        'await tasks.insert({ title: "写周报", done: 0 });',
        'await tasks.update({ done: 1 }, { id: 5 });',
        'await tasks.delete({ id: 5 });',
      ].join('\n')
    ),
    h3('where 条件 DSL'),
    p([
      '裸值表示等值（null 表示 IS NULL）；操作符对象支持比较 / 模糊 / 集合 / 空值 / 范围；AND / OR 数组组合子条件：',
    ]),
    codeblock(
      [
        'const where = {',
        '  age: { gte: 18 },',
        "  status: { in: ['active', 'pending'] },",
        "  name: { like: '%a%' },",
        '  deletedAt: { isNull: true },',
        "  OR: [{ city: 'x' }, { city: 'y' }],",
        '};',
      ].join('\n')
    ),
    table(
      ['操作符', '说明'],
      [
        [[inline('eq / ne')], ['等于 / 不等于']],
        [[inline('gt / gte / lt / lte')], ['比较']],
        [[inline('like / notLike')], ['模糊匹配']],
        [[inline('in / notIn')], ['集合']],
        [[inline('isNull')], ['空值判断']],
        [[inline('between')], ['范围 [min, max]']],
      ]
    ),
    h3('排序与投影'),
    codeblock(
      [
        '// 字符串 = 升序；对象支持多列',
        'orderBy: { created_at: "desc", id: "asc" }',
        '',
        '// 投影列',
        'select: ["id", "title"] as const,',
      ].join('\n')
    ),
    h2('事务'),
    p([
      '回调中的查询在同一连接内原子执行，任一失败自动回滚；回调收到绑定到当前事务连接的 Database：',
    ]),
    codeblock(
      [
        'const [a, b] = await db.transaction(async (tx) => {',
        "  const table = tx.table<Item>('items');",
        '  const a = await table.insert({ v: 1 });',
        '  const b = await table.insert({ v: 2 });',
        '  return [a, b];',
        '});',
      ].join('\n')
    ),
    h2('方言差异'),
    callout(
      '说明',
      p([
        'PostgreSQL / SQLite 直接使用 ',
        inline('RETURNING *'),
        ' 返回变更后的行；MySQL / MariaDB 通过 LAST_INSERT_ID / 前置 COUNT 回查，写入类操作返回的 rows 为空数组，count 表示匹配行数。',
        ' 可调用 ',
        inline('db.dialectSupportsReturning()'),
        ' 判断当前方言。',
      ])
    ),
    h2('连接选项'),
    table(
      ['选项', '说明'],
      [
        [[inline('name')], ['库的业务名称（默认 "default"）']],
        [[inline('url')], ['连接串；未传时按 sqlite 内存库处理']],
        [[inline('dialect')], ['sqlite / postgres / mysql / mariadb']],
        [[inline('readonly')], ['只读标记（业务语义）']],
        [
          [inline('max / idleTimeout / connectionTimeout / tls')],
          ['连接池参数（仅服务端方言生效）'],
        ],
        [[inline('bigint')], ['int8 等大整数按 BigInt 返回（默认按字符串）']],
        [[inline('onconnect / onclose')], ['连接建立 / 关闭回调']],
      ]
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* ID                                                                  */
/* ------------------------------------------------------------------ */

export function renderUtilsId(_ctx: PageContext): VNode | VNode[] {
  return [
    p([
      'id 模块提供四种 ID 生成策略，遵循策略模式：通过 ',
      inline('createIdGenerator'),
      ' 工厂按名称创建，便于配置驱动；默认 uuidv7（时间有序，适合做数据库主键）。',
    ]),
    h2('快捷生成'),
    codeblock(
      [
        "import { createId } from '@geektech/backone-utils';",
        '',
        'const id = createId();                    // uuidv7（默认）',
        "const id2 = createId('nanoid', { length: 12 });",
      ].join('\n')
    ),
    h2('按策略创建生成器'),
    codeblock(
      [
        'const ids = createIdGenerator("snowflake", { machineId: 1 });',
        'const id = ids.generate();',
      ].join('\n')
    ),
    h2('策略一览'),
    table(
      ['策略', '生成器', '说明'],
      [
        [[inline('uuidv4')], [inline('UuidV4Generator')], ['随机 UUID v4']],
        [
          [inline('uuidv7')],
          [inline('UuidV7Generator')],
          ['时间有序 UUID v7（默认）'],
        ],
        [
          [inline('nanoid')],
          [inline('NanoIdGenerator')],
          ['URL 安全短 ID，可配长度与字符表'],
        ],
        [
          [inline('snowflake')],
          [inline('SnowflakeGenerator')],
          ['雪花 ID，可配纪元与机器 ID'],
        ],
      ]
    ),
    h3('NanoId 选项'),
    table(
      ['选项', '默认', '说明'],
      [
        [[inline('alphabet')], ['URL 安全字母数字 64 字符'], ['字符表']],
        [[inline('length')], [inline('21')], ['生成长度（碰撞概率约 2^-126）']],
      ]
    ),
    h3('Snowflake 选项'),
    table(
      ['选项', '默认', '说明'],
      [
        [[inline('epoch')], ['2024-01-01T00:00:00.000Z'], ['纪元毫秒时间戳']],
        [[inline('machineId')], ['随机分配'], ['机器 / 进程 ID（0-1023）']],
      ]
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* 缓存                                                                 */
/* ------------------------------------------------------------------ */

export function renderUtilsCache(_ctx: PageContext): VNode | VNode[] {
  return [
    p([
      'cache 模块是纯内存缓存：',
      inline('TtlCache'),
      '（TTL 惰性过期、无容量限制）与 ',
      inline('LruCache'),
      '（容量上限 + LRU 淘汰，可选过期）实现同一 ',
      inline('Cache'),
      ' 接口，可互换使用（依赖倒置），通过 ',
      inline('createCache'),
      ' 工厂按选项选择策略。',
    ]),
    h2('创建缓存'),
    codeblock(
      [
        "import { createCache } from '@geektech/backone-utils';",
        '',
        '// TTL 缓存：10 分钟过期',
        'const cache = createCache({ ttlMs: 10 * 60 * 1000 });',
        '',
        '// LRU 缓存：最多 100 条，逐出最久未访问',
        'const lru = createCache({ capacity: 100, ttlMs: 60_000 });',
      ].join('\n')
    ),
    h2('基本操作'),
    codeblock(
      [
        "cache.set('key', { user: 'alice' });",
        "cache.get('key');            // 命中返回值；未命中或已过期返回 undefined",
        "cache.has('key');            // 是否存在未过期的条目",
        "cache.delete('key');         // 删除，返回是否删除成功",
        'cache.clear();               // 清空全部',
        'cache.size;                  // 当前条目数',
      ].join('\n')
    ),
    h2('getOrSet'),
    p([
      '命中则直接返回，未命中则执行工厂并写入（工厂可为异步，适合缓存数据库查询等耗时结果）：',
    ]),
    codeblock(
      [
        'const user = await cache.getOrSet(`user:${id}`, async () => {',
        '  return await db.query`SELECT * FROM users WHERE id = ${id}`;',
        '});',
      ].join('\n')
    ),
    h2('接口说明'),
    table(
      ['成员', '说明'],
      [
        [
          [inline('get / set')],
          ['读写；set 可传 ttlMs 覆盖默认过期，都不传则永不过期'],
        ],
        [
          [inline('has / delete / clear / size')],
          ['存在判断 / 删除 / 清空 / 条目数'],
        ],
        [[inline('getOrSet')], ['未命中执行工厂并写入']],
      ]
    ),
    callout(
      '注意',
      p(['值不允许为 undefined：undefined 视为未命中。']),
      'warn'
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* JWT                                                                 */
/* ------------------------------------------------------------------ */

export function renderUtilsJwt(_ctx: PageContext): VNode | VNode[] {
  return [
    p([
      'jwt 模块基于 WebCrypto HMAC 实现（HS256 / HS384 / HS512），零运行时依赖。载荷为 ',
      inline('Record<string, unknown>'),
      ' 与标准声明的交叉类型，允许携带任意自定义字段。',
    ]),
    h2('创建服务'),
    codeblock(
      [
        "import { createJwt } from '@geektech/backone-utils';",
        '',
        'const jwt = createJwt({',
        '  secret: process.env.JWT_SECRET ?? "",',
        "  algorithm: 'HS256',",
        '});',
      ].join('\n')
    ),
    h2('签发与验证'),
    codeblock(
      [
        '// 签发：expiresIn 秒后过期',
        "const token = await jwt.sign({ sub: '42', role: 'admin' }, { expiresIn: 3600 });",
        '',
        '// 验证：校验签名、过期时间与 issuer',
        "const payload = await jwt.verify(token, { issuer: 'city-index' });",
        'payload.sub;   // "42"',
      ].join('\n')
    ),
    h2('标准声明'),
    table(
      ['字段', '说明'],
      [
        [[inline('iss / sub / aud')], ['签发方 / 主题 / 受众']],
        [[inline('exp / nbf')], ['过期时间 / 生效时间（Unix 秒）']],
        [[inline('iat / jti')], ['签发时间 / 唯一标识']],
      ]
    ),
    h2('签发选项'),
    table(
      ['选项', '说明'],
      [
        [[inline('algorithm')], ['签名算法（默认使用服务构造时的 algorithm）']],
        [[inline('expiresIn')], ['过期秒数：相对当前时间写入 exp']],
        [[inline('notBefore')], ['生效秒数：相对当前时间写入 nbf']],
      ]
    ),
    h2('验证选项'),
    table(
      ['选项', '说明'],
      [
        [[inline('issuer')], ['必须匹配的 issuer（缺失或不一致则失败）']],
        [[inline('audience')], ['必须匹配的 audience']],
        [
          [inline('clockTolerance')],
          ['时钟容差（秒）：校验 exp/nbf 时的宽松量，默认 0'],
        ],
      ]
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* HTTP 客户端                                                           */
/* ------------------------------------------------------------------ */

export function renderUtilsHttp(_ctx: PageContext): VNode | VNode[] {
  return [
    p([
      'http 模块是基于 fetch 的轻量封装：超时、指数退避重试、请求 / 响应头合并、JSON 自动序列化与解析，零运行时依赖。',
    ]),
    h2('创建客户端'),
    codeblock(
      [
        "import { createHttpClient } from '@geektech/backone-utils';",
        '',
        'const api = createHttpClient({',
        "  baseUrl: 'https://api.example.com',",
        '  timeoutMs: 5_000,',
        '  retry: { maxRetries: 3, baseDelayMs: 100 },',
        '});',
      ].join('\n')
    ),
    h2('发起请求'),
    codeblock(
      [
        "const { data } = await api.get<{ total: number }>('/stats', { query: { year: 2026 } });",
        '',
        "const { data: created } = await api.post('/users', { body: { name: 'alice' } });",
        '',
        "const res = await api.request('/upload', { method: 'PUT', body: formData });",
      ].join('\n')
    ),
    h2('响应结构'),
    table(
      ['字段', '说明'],
      [
        [[inline('status / ok')], ['状态码 / 是否 2xx']],
        [[inline('headers')], ['响应头']],
        [[inline('data')], ['解析后的 JSON（非 JSON 响应则原样为文本）']],
        [[inline('text')], ['原始文本']],
        [[inline('url')], ['最终请求 URL']],
      ]
    ),
    h2('请求选项'),
    table(
      ['选项', '说明'],
      [
        [[inline('query')], ['查询参数，自动拼接（undefined 值跳过）']],
        [[inline('headers')], ['请求头（覆盖默认头）']],
        [[inline('timeoutMs')], ['超时毫秒（覆盖客户端默认）']],
        [[inline('retry')], ['重试配置；传 false 关闭本次重试']],
        [[inline('body')], ['对象自动 JSON 序列化，字符串原样发送']],
        [[inline('signal')], ['外部取消信号（与超时信号合并）']],
      ]
    ),
    h2('重试配置'),
    table(
      ['选项', '默认', '说明'],
      [
        [
          [inline('maxRetries')],
          [inline('2')],
          ['最大重试次数（额外的请求次数）'],
        ],
        [
          [inline('baseDelayMs')],
          [inline('200')],
          ['基础退避毫秒（指数退避：baseDelay * 2^attempt）'],
        ],
        [
          [inline('retryableStatuses')],
          ['408/429/500/502/503/504'],
          ['可重试的响应状态码'],
        ],
        [
          [inline('retryOnNetworkError')],
          [inline('true')],
          ['是否重试网络错误与超时'],
        ],
      ]
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* 限流                                                                 */
/* ------------------------------------------------------------------ */

export function renderUtilsRateLimit(_ctx: PageContext): VNode | VNode[] {
  return [
    p([
      'rate-limit 模块提供三种限流策略（固定窗口 / 滑动窗口 / 令牌桶），实现同一 ',
      inline('RateLimiter'),
      ' 接口，可互换使用；通过 ',
      inline('createRateLimiter'),
      ' 工厂按策略创建。纯内存实现，零运行时依赖，适合单进程内的接口限流 / 防刷。',
    ]),
    h2('创建限流器'),
    codeblock(
      [
        "import { createRateLimiter } from '@geektech/backone-utils';",
        '',
        '// 固定窗口：每分钟最多 60 次',
        'const limiter = createRateLimiter({',
        '  limit: 60,',
        '  windowMs: 60_000,',
        "  strategy: 'fixed-window',",
        '});',
      ].join('\n')
    ),
    h2('消费配额'),
    codeblock(
      [
        'const result = limiter.consume(ip); // 按 key 隔离，如 IP、用户 ID',
        '',
        'if (!result.allowed) {',
        "  throw new HttpError(429, 'Too many requests');",
        '}',
      ].join('\n')
    ),
    h2('消费结果'),
    table(
      ['字段', '说明'],
      [
        [[inline('allowed')], ['本次消费是否被允许']],
        [[inline('remaining')], ['剩余配额（本次消费后）']],
        [[inline('resetAt')], ['配额重置 / 下一个可用时刻（毫秒时间戳）']],
      ]
    ),
    h2('策略对比'),
    table(
      ['策略', '特点'],
      [
        [
          [inline('fixed-window')],
          ['固定时间窗计数，实现简单，窗口边界可能突发'],
        ],
        [[inline('sliding-window')], ['滑动窗口平滑限流，边界更均匀']],
        [
          [inline('token-bucket')],
          ['令牌桶：按速率补充，允许一定突发，适合流量整形'],
        ],
      ]
    ),
    h2('选项'),
    table(
      ['选项', '说明'],
      [
        [[inline('limit')], ['窗口内允许的最大请求数 / 令牌桶容量']],
        [[inline('windowMs')], ['窗口时长（毫秒）；令牌桶下作为补充周期基准']],
        [
          [inline('strategy')],
          ['fixed-window（默认）/ sliding-window / token-bucket'],
        ],
        [
          [inline('refillPerSecond')],
          ['令牌桶每秒补充的令牌数（默认按 limit 在 windowMs 内补满计算）'],
        ],
      ]
    ),
    callout(
      '提示',
      p([
        '与中间件结合：在 backone 的自定义中间件里按 ',
        inline('ctx.request.headers.get("x-forwarded-for")'),
        ' 或 IP 取 key 即可实现接口限流。',
      ]),
      'tip'
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

export function renderUtilsSchema(ctx: PageContext): VNode | VNode[] {
  return [
    p([
      'schema 模块是 zod 风格的轻量校验器：通过 ',
      inline('v'),
      ' 工厂构建 schema，支持类型推导（',
      inline('InferType'),
      '）与 ',
      inline('safeParse'),
      '，零运行时依赖。',
    ]),
    h2('基本用法'),
    codeblock(
      [
        "import { v, ValidationError } from '@geektech/backone-utils';",
        '',
        'const userSchema = v.object({',
        '  name: v.string({ minLength: 2, maxLength: 32 }),',
        '  age: v.number({ integer: true, min: 0, max: 150 }),',
        '  email: v.string({ pattern: /^[^@]+@[^@]+$/ }),',
        '  role: v.enum(["admin", "user"] as const),',
        '});',
        '',
        'type User = InferType<typeof userSchema>; // 类型自动推导',
        '',
        "const parsed = userSchema.safeParse({ name: 'alice', age: 30, email: 'a@b.co', role: 'admin' });",
        'if (!parsed.success) {',
        '  console.error(parsed.error.issues); // 结构化问题列表',
        '}',
      ].join('\n')
    ),
    h2('v 工厂一览'),
    table(
      ['方法', '说明'],
      [
        [
          [inline('v.string(options)')],
          ['字符串：minLength / maxLength / pattern'],
        ],
        [[inline('v.number(options)')], ['数字：min / max / integer']],
        [[inline('v.boolean()')], ['布尔']],
        [[inline('v.literal(value)')], ['字面量：仅接受指定值']],
        [[inline('v.enum(values)')], ['枚举']],
        [[inline('v.array(item, options)')], ['数组：元素 schema + 长度约束']],
        [[inline('v.object(shape)')], ['对象：形状校验，返回类型化对象']],
        [[inline('v.record(value)')], ['记录：任意字符串键 → 同构值']],
        [[inline('v.optional(schema)')], ['可选：undefined 通过']],
        [[inline('v.nullable(schema)')], ['可空：null 通过']],
        [[inline('v.union(schemas)')], ['联合']],
      ]
    ),
    h2('safeParse'),
    table(
      ['字段', '说明'],
      [
        [[inline('success')], ['是否通过']],
        [[inline('data')], ['通过时的类型化数据']],
        [
          [inline('error')],
          ['失败时的 ValidationError，含 issues 列表与格式化路径'],
        ],
      ]
    ),
    callout(
      '提示',
      p([
        '可以结合 config 模块使用：defineConfig 内部就用 v 的 object schema 做配置校验。',
        h('a', { href: ctx.href('/utils/config') }, ['见全局配置']),
        '。',
      ]),
      'tip'
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* 全局配置                                                              */
/* ------------------------------------------------------------------ */

export function renderUtilsConfig(_ctx: PageContext): VNode | VNode[] {
  return [
    p([
      'config 模块从环境变量（或自定义读取源）读取强类型配置，启动期 fail-fast 校验：缺失或非法配置立即抛出 ',
      inline('ConfigError'),
      '，返回的配置对象深冻结（不可变）且类型完整推导。',
    ]),
    h2('基本用法'),
    codeblock(
      [
        "import { defineConfig, v } from '@geektech/backone-utils';",
        '',
        'const config = defineConfig(',
        '  v.object({',
        '    port: v.number({ integer: true, min: 0, max: 65535 }),',
        '    jwtSecret: v.string({ minLength: 8 }),',
        '    debug: v.boolean(),',
        '  }),',
        "  { prefix: 'APP_' }",
        ');',
        '',
        '// 读取 APP_PORT / APP_JWT_SECRET / APP_DEBUG',
        'config.port;      // number，类型已推导',
        'config.jwtSecret; // string',
      ].join('\n')
    ),
    h2('字段名 → 环境变量名'),
    p([
      '字段名先转 UPPER_SNAKE_CASE 再拼接前缀：',
      inline('jwtSecret'),
      ' → ',
      inline('APP_JWT_SECRET'),
      '；前缀自动大写，缺末尾下划线自动补（',
      inline("'app'"),
      ' → ',
      inline("'APP_'"),
      '）。',
    ]),
    h2('选项'),
    table(
      ['选项', '说明'],
      [
        [[inline('prefix')], ['环境变量前缀，如 "APP_"']],
        [
          [inline('source')],
          ['读取源，默认 EnvSource（Bun.env + process.env）'],
        ],
        [[inline('defaults')], ['缺省值（native 类型），env 未设置时使用']],
      ]
    ),
    h2('自定义读取源'),
    p([
      '实现 ',
      inline('ConfigSource'),
      ' 接口即可接入自定义配置来源（如内存、文件）：',
    ]),
    codeblock(
      [
        "import { defineConfig, MemorySource } from '@geektech/backone-utils';",
        '',
        'const config = defineConfig(',
        '  v.object({ port: v.number() }),',
        '  { source: new MemorySource({ PORT: "8080" }) }',
        ');',
        'config.port; // 8080',
      ].join('\n')
    ),
    callout(
      '说明',
      p([
        '非法前缀抛 ',
        inline('CONFIG_PREFIX_INVALID'),
        '，校验失败抛 ',
        inline('CONFIG_INVALID'),
        '（携带 issues 列表）；配置对象深冻结，值为 JSON 形态数据，无循环引用。',
      ])
    ),
  ];
}
