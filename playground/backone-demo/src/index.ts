/**
 * BackOne 服务端框架 playground 示例。
 *
 * 启动：
 *   bun run dev    # 监听文件变化自动重启
 *   bun run start  # 单次启动
 *
 * 访问 http://127.0.0.1:5390 开始体验各路由。
 *
 * 数据库演示（@geektech/backone-utils）：
 *   - 双库连接：主库 tasks（sqlite 内存库，可用 BACKONE_DEMO_DATABASE_URL
 *     切换 PostgreSQL / MySQL）+ 审计库 audit_logs
 *   - REST 增删改查：GET/POST/PUT/DELETE /api/tasks、事务 /api/tasks/batch、
 *     关键字搜索、审计日志与数据库状态
 */

import { createServer, HttpError, name, version } from '@geektech/backone';
import {
  createCache,
  createHttpClient,
  createId,
  createJwt,
  createRateLimiter,
  defineConfig,
  v,
} from '@geektech/backone-utils';
import { db, setupDatabases, writeAudit, type AuditLog, type Task } from './db';

const app = createServer({
  port: 5390,
  development: true,
});

// ---- 中间件（洋葱模型，按注册顺序执行） ----

// 内置：请求日志
app.useLogger();

// 内置：跨域
app.useCors();

// 内置：gzip 响应压缩（大于阈值的文本/JSON 自动压缩）
app.useGzip();

// 内置：安全响应头（helmet 风格）
app.useHelmet();

// 内置：请求超时（5 秒未完成返回 504）
app.useTimeout({ ms: 5000 });

// 自定义：记录耗时并注入响应头
app.use(async (ctx, next) => {
  const start = performance.now();
  ctx.state.requestId = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const response = await next();
  if (response instanceof Response) {
    response.headers.set(
      'x-server-timing',
      `${(performance.now() - start).toFixed(2)}ms`
    );
    response.headers.set('x-request-id', String(ctx.state.requestId));
  }
  return response;
});

// ---- 静态文件：/static/* -> ./public（Bun.file 零拷贝流式发送） ----

app.serveStatic('/static', './public', {
  cacheControl: 'public, max-age=3600',
  index: 'index.html',
});

// ---- 基础路由 ----

app.get('/', () => 'BackOne playground is running');

// 动态路径参数
app.get('/hello/:name', (ctx) => `hello, ${ctx.params.name}`);

// 类型化路由：泛型 params 提供 IDE 类型提示
app.get<{ id: string }>('/typed/:id', (ctx) =>
  ctx.json({ id: ctx.params.id, typed: true })
);

// gzip 压缩演示：大于 1024 字节的文本响应会被自动压缩
app.get('/large', () => 'backone-gzip-demo-'.repeat(256));

// 通配段：剩余路径写入 ctx.params.wildcard
app.get('/files/*', (ctx) => ctx.json({ wildcard: ctx.params.wildcard }));

// JSON 响应（包名与版本直接来自框架导出，避免硬编码）
app.get('/json', (ctx) =>
  ctx.json({
    framework: name,
    version,
    timestamp: Date.now(),
  })
);

// query 参数（惰性解析并缓存）
app.get('/search', (ctx) => {
  const q = ctx.query.get('q') ?? '';
  const page = Number(ctx.query.get('page') ?? '1');
  return ctx.json({ q, page });
});

// ---- 请求体（惰性解析） ----

app.post('/echo', async (ctx) => {
  const body = await ctx.bodyJson<{ message?: string }>();
  return ctx.json({ echoed: body.message ?? null });
});

app.post('/text', async (ctx) => ctx.text(await ctx.bodyText()));

// 表单请求体（multipart / urlencoded，惰性解析并缓存）
app.post('/form', async (ctx) => {
  const form = await ctx.bodyForm();
  return ctx.json(Object.fromEntries(form));
});

// ctx.state：中间件写入的数据可在处理器中读取
app.get('/request-id', (ctx) => ctx.json({ requestId: ctx.state.requestId }));

// ---- 响应头 / 状态码 / Cookie ----

app.get('/status', (ctx) => {
  ctx.status = 202;
  ctx.set('x-powered-by', 'backone');
  return ctx.json({ accepted: true });
});

app.get('/theme', (ctx) =>
  ctx.json({ theme: ctx.cookie('theme') ?? 'default' })
);

app.post('/theme', (ctx) => {
  ctx.setCookie('theme', 'dark', {
    httpOnly: true,
    path: '/',
    maxAge: 3600,
  });
  return ctx.json({ ok: true });
});

// 重定向与空响应
app.get('/old-path', (ctx) => ctx.redirect('/'));
app.delete('/cleanup', (ctx) => ctx.noContent());

// ---- SSE（Server-Sent Events）流式推送 ----

// 基本 SSE：发送多条带 id/event 的消息后关闭
app.get('/events', (ctx) => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const messages = [
        { id: 1, event: 'greeting', data: 'hello from backone' },
        {
          id: 2,
          event: 'update',
          data: JSON.stringify({ status: 'ok', ts: Date.now() }),
        },
        { id: 3, event: 'done', data: 'stream complete' },
      ];
      for (const msg of messages) {
        controller.enqueue(
          encoder.encode(
            `id: ${msg.id}\nevent: ${msg.event}\ndata: ${msg.data}\n\n`
          )
        );
      }
      controller.close();
    },
  });
  return ctx
    .set('content-type', 'text/event-stream')
    .set('cache-control', 'no-cache')
    .stream(stream);
});

// 实时时钟：每秒推送当前时间，客户端断开时自动清理定时器
app.get('/clock', (ctx) => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        const data = JSON.stringify({
          time: new Date().toISOString(),
          local: new Date().toLocaleTimeString(),
        });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };
      send();
      const timer = setInterval(send, 1000);
      ctx.request.signal.addEventListener('abort', () => {
        clearInterval(timer);
        controller.close();
      });
    },
  });
  return ctx
    .set('content-type', 'text/event-stream')
    .set('cache-control', 'no-cache')
    .stream(stream);
});

// ---- 多处理器与错误处理 ----

app.get(
  '/admin',
  (ctx, next) => {
    if (!ctx.request.headers.has('authorization')) {
      throw new HttpError(401, 'Missing authorization header');
    }
    return next();
  },
  (ctx) => ctx.json({ admin: true })
);

// 开发模式（development: true）下会输出堆栈并在响应中携带 message
app.get('/boom', () => {
  throw new Error('intentional error, see console');
});

// ---- 匹配任意方法 ----

app.all('/ping', () => 'pong');

// ---- 路由组：统一前缀 ----

app.group('/api/v1', (api) => {
  api.get('/users', () => 'users list');
  api.get<{ id: string }>('/users/:id', (ctx) =>
    ctx.json({ id: ctx.params.id, version: 'v1' })
  );
});

// ---- WebSocket ----

app.ws('/ws', {
  open: (ws) => ws.send('connected to backone websocket'),
  message: (ws, message) => ws.send(`echo: ${message}`),
  close: () => console.log('ws client closed'),
});

// 未注册的路径返回 404；路径存在但方法不匹配返回 405 + Allow 头，均由框架兜底。

// ---- 数据库工具包演示（@geektech/backone-utils）----

// 任务列表：?q= 关键字过滤（like）+ ?limit 分页
app.get('/api/tasks', async (ctx) => {
  const q = ctx.query.get('q');
  const limit = Math.min(Number(ctx.query.get('limit') ?? '50') || 50, 200);
  const items = await tasks.findMany({
    where: q ? { title: { like: `%${q}%` } } : undefined,
    orderBy: { id: 'desc' },
    limit,
  });
  return ctx.json({ total: items.length, items });
});

// 按主键查询
app.get('/api/tasks/:id', async (ctx) => {
  const item = await tasks.findById(Number(ctx.params.id));
  if (!item) {
    throw new HttpError(404, `task ${ctx.params.id} not found`);
  }
  return ctx.json(item);
});

// 创建任务：写入主库，并在审计库记一条日志（一次请求操作两个库）
app.post('/api/tasks', async (ctx) => {
  const body = await ctx.bodyJson<{ title?: string; done?: boolean }>();
  const title = body.title?.trim() ?? '';
  if (!title) {
    throw new HttpError(400, 'title is required');
  }
  const created = await tasks.insert({
    title,
    done: body.done ? 1 : 0,
    created_at: new Date().toISOString(),
  });
  await writeAudit('task.create', created?.id ?? null);
  return ctx.json(created);
});

// 更新任务（部分字段更新，返回更新后的行）
app.put('/api/tasks/:id', async (ctx) => {
  const id = Number(ctx.params.id);
  const body = await ctx.bodyJson<{ title?: string; done?: boolean }>();
  const partial: Partial<Task> = {};
  if (body.title !== undefined) {
    partial.title = body.title;
  }
  if (body.done !== undefined) {
    partial.done = body.done ? 1 : 0;
  }
  const result = await tasks.update(partial, { id });
  if (result.count === 0) {
    throw new HttpError(404, `task ${id} not found`);
  }
  await writeAudit('task.update', id);
  return ctx.json({ count: result.count, rows: result.rows });
});

// 删除任务
app.delete('/api/tasks/:id', async (ctx) => {
  const id = Number(ctx.params.id);
  const result = await tasks.delete({ id });
  if (result.count === 0) {
    throw new HttpError(404, `task ${id} not found`);
  }
  await writeAudit('task.delete', id);
  return ctx.json({ deleted: result.count });
});

// 事务演示：一次插入多条任务，任一失败整体回滚
app.post('/api/tasks/batch', async (ctx) => {
  const body = await ctx.bodyJson<{ titles?: string[] }>();
  const titles = (body.titles ?? []).map((t) => t.trim()).filter(Boolean);
  if (titles.length === 0) {
    throw new HttpError(400, 'titles is required');
  }
  const inserted = await db.get('main').transaction(async (tx) => {
    const table = tx.table<Task>('tasks');
    const rows: Task[] = [];
    for (const title of titles) {
      const row = await table.insert({
        title,
        done: 0,
        created_at: new Date().toISOString(),
      });
      if (row) {
        rows.push(row);
      }
    }
    return rows;
  });
  await writeAudit('task.batch', null);
  return ctx.json({ inserted: inserted.length, items: inserted });
});

// 审计日志（第二个数据库，与业务数据分离）
app.get('/api/audit', async (ctx) => {
  const logs = await auditLogs.findMany({ orderBy: { id: 'desc' }, limit: 20 });
  return ctx.json({ total: logs.length, logs });
});

// 数据库状态（多库 + 方言信息）
app.get('/api/db', (ctx) =>
  ctx.json({
    databases: db.names(),
    status: Object.fromEntries(
      db
        .list()
        .map((database) => [
          database.name,
          { dialect: database.dialect, closed: database.isClosed },
        ])
    ),
  })
);

// ---- 路由前缀演示（usePrefix 内置快捷方法）----

// 持久形式：替换当前前缀，影响后续注册的路由（注册期生效，注册时捕获）
app.usePrefix('/api/v2');
const v2Prefix = app.prefix;
app.get('/hello', (ctx) =>
  ctx.json({ message: 'hello from prefixed route', prefix: v2Prefix })
);

// 作用域形式：相对当前前缀临时叠加，结束后自动恢复（回到 /api/v2）
app.usePrefix('/admin', (api) => {
  api.get('/ping', () => 'admin pong under /api/v2/admin');
});
app.usePrefix(); // 重置：无前缀

// ---- 通用工具演示（@geektech/backone-utils：id / cache / jwt / rate-limit / http / schema）----

// ID 生成：uuidv7（默认）/ nanoid / snowflake
app.get('/api/tools/ids', (ctx) =>
  ctx.json({
    uuidv7: createId(),
    nanoid: createId('nanoid', { length: 12 }),
    snowflake: createId('snowflake'),
  })
);

// 配置：脱敏展示（密钥不完整回显），演示 defineConfig 读取与深冻结
app.get('/api/tools/config', (ctx) =>
  ctx.json({
    prefix: 'BACKONE_DEMO_',
    debug: demoConfig.debug,
    jwtSecretMasked: `${demoConfig.jwtSecret.slice(0, 3)}***`,
    adminToken: demoConfig.adminToken === undefined ? 'unset' : 'set',
    frozen: Object.isFrozen(demoConfig),
  })
);

// 缓存：getOrSet 缓存"城市得分"查询，5 秒过期（x-cache 标注命中/未命中）
const scoreCache = createCache<number>({ ttlMs: 5_000, capacity: 100 });
app.get('/api/tools/rank', async (ctx) => {
  const city = ctx.query.get('city') ?? 'shanghai';
  const cached = scoreCache.has(`rank:${city}`);
  const score = await scoreCache.getOrSet(`rank:${city}`, () =>
    Promise.resolve(Math.floor(Math.random() * 100))
  );
  return ctx.json({ city, score, cached });
});

// 全局配置：从环境变量读取（BACKONE_DEMO_ 前缀），启动期 fail-fast
//   BACKONE_DEMO_JWT_SECRET（必填，≥8 字符）、BACKONE_DEMO_DEBUG、BACKONE_DEMO_ADMIN_TOKEN（可选）
const demoConfig = defineConfig(
  v.object({
    jwtSecret: v.string({ minLength: 8 }),
    debug: v.boolean(),
    adminToken: v.optional(v.string({ minLength: 4 })),
  }),
  {
    prefix: 'BACKONE_DEMO_',
    defaults: { jwtSecret: 'backone-demo-secret', debug: false },
  }
);

// JWT：签发 / 验证（Bearer 头），HS256 + issuer 校验
const jwt = createJwt({ secret: demoConfig.jwtSecret });
app.post('/api/tools/token', async (ctx) => {
  const body = await ctx.bodyJson<{ role?: string }>();
  const token = await jwt.sign(
    { iss: 'backone-demo', sub: 'demo-user', role: body.role ?? 'user' },
    { expiresIn: 3600 }
  );
  return ctx.json({ token, expiresIn: 3600 });
});
app.get('/api/tools/me', async (ctx) => {
  const header = ctx.request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (token === undefined) {
    throw new HttpError(401, 'Missing Bearer token');
  }
  try {
    const payload = await jwt.verify(token, { issuer: 'backone-demo' });
    return ctx.json(payload);
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
});

// 限流：固定窗口 5 次/10 秒（按客户端 IP 隔离），超限返回 429
const limiter = createRateLimiter({ limit: 5, windowMs: 10_000 });
app.get('/api/tools/limited', (ctx) => {
  const key = ctx.request.headers.get('x-forwarded-for') ?? 'local';
  const result = limiter.consume(key);
  if (!result.allowed) {
    throw new HttpError(429, `rate limited, retry after ${result.resetAt}`);
  }
  return ctx.json({ ok: true, remaining: result.remaining });
});

// HTTP 客户端：自请求自身 /api/tools/ids，演示 baseUrl + JSON 解析
const api = createHttpClient({
  baseUrl: `http://127.0.0.1:5390`,
  timeoutMs: 2000,
});
app.get('/api/tools/http', async (ctx) => {
  const { data } = await api.get<{ uuidv7: string; nanoid: string }>(
    '/api/tools/ids'
  );
  return ctx.json({ proxied: data });
});

// 校验：schema 校验 POST body（zod 风格），失败返回 400 与全部问题
const citySchema = v.object({
  name: v.string({ minLength: 1, maxLength: 20 }),
  population: v.number({ min: 0, integer: true }),
  score: v.optional(v.number({ min: 0, max: 100 })),
  tags: v.array(v.string()),
});
app.post('/api/tools/city', async (ctx) => {
  const result = citySchema.safeParse(await ctx.bodyJson());
  if (!result.success) {
    throw new HttpError(
      400,
      `invalid body: ${result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`
    );
  }
  return ctx.json(result.data);
});

// ---- 启动 ----

await setupDatabases();

const tasks = db.get('main').table<Task>('tasks');
const auditLogs = db.get('audit').table<AuditLog>('audit_logs');

const port = await app.listen();
console.log(`BackOne playground: http://127.0.0.1:${port}`);
console.log(
  `  db demo: /api/tasks /api/tasks/:id /api/tasks/batch /api/audit /api/db`
);
console.log(
  `  utils demo: /api/tools/config /api/tools/ids /api/tools/rank /api/tools/token /api/tools/me /api/tools/limited /api/tools/http /api/tools/city`
);
