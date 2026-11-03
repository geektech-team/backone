import type { VNode } from '@geektech/tsone';
import { codeblock, h2, inline, p, table, ul } from '../components';

const httpExample = `import { createServer, type Context } from '@geektech/backone';
import {
  Authorize, Cache, Controller, Delete, Get, Header, Post, RateLimit,
  Status, Timeout, Use, Validate, getPrincipal, registerControllers,
  validatedBody, validatedParams, validatedQuery,
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
  authenticate: (ctx) => sessions.get(
    ctx.getHeader('authorization')?.replace(/^Bearer /, '') ?? ''
  ),
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
    key: (ctx) => JSON.stringify([
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
await app.listen();`;

const backendExample = `import type { Context } from '@geektech/backone';
import type {
  CachedResponse, InputSchema, RateLimitBackend, ResponseCacheStore,
} from '@geektech/backone/decorators';

// Structural contracts: implement these in your application or an adapter.
const schema: InputSchema<{ id: string }> = {
  parse(input: unknown) {
    if (typeof input !== 'object' || input === null ||
        !('id' in input) || typeof input.id !== 'string') {
      throw new Error('Expected a string id');
    }
    return { id: input.id };
  },
};
const limiter: RateLimitBackend = {
  async consume(key) {
    return { allowed: key.length > 0, remaining: 1, resetAt: Date.now() + 1000 };
  },
};
const snapshots = new Map<string, { value: CachedResponse; expiresAt: number }>();
const store: ResponseCacheStore = {
  get(key) {
    const entry = snapshots.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      snapshots.delete(key);
      return undefined;
    }
    return entry.value;
  },
  set(key, value, ttlMs) {
    snapshots.set(key, { value, expiresAt: Date.now() + ttlMs });
  },
};
const authenticate = (ctx: Context) =>
  ctx.getHeader('authorization') === 'Bearer demo-token' ? { id: 'u1' } : null;

void [schema, limiter, store, authenticate];`;

const gatewayExample = `import {
  createServer, type BackOneWebSocket, type WebSocketData,
} from '@geektech/backone';
import {
  Authorize, OnClose, OnDrain, OnMessage, OnOpen, RateLimit, Timeout, Use,
  WebSocket as Gateway, getPrincipal, registerWebSockets,
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
  async message(ws: BackOneWebSocket<WebSocketData>, message: string | Uint8Array) {
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
await app.listen();`;

export function renderBackoneDecorators(): VNode | VNode[] {
  return [
    p(
      '业务代码推荐 Module → Controller/Gateway → Service → Repository。同一业务放在 modules/<feature>/，以构造函数显式注入，由 Application 通过 registerModules 挂载。下方示例集中演示装饰器 API；完整分层见对象优先开发。实例跨请求复用，请求状态放在 ctx。'
    ),
    p([
      '通过可选入口 ',
      inline('@geektech/backone/decorators'),
      ' 使用标准装饰器组织 HTTP 策略和 WebSocket 网关。装饰器记录声明，显式注册时绑定业务实例，复用现有请求管线；核心保持零运行时依赖。',
    ]),
    h2('环境与标准元数据'),
    p([
      '直接运行标准装饰器源码要求 Bun ',
      inline('>=1.3.10'),
      '、TypeScript >=5.2。保持 experimentalDecorators 和 emitDecoratorMetadata 关闭，不使用 legacy 或参数装饰器；方法通过 Context 读取请求数据。入口会在缺失时初始化 Symbol.metadata，支持 TypeScript 编译后的标准装饰器消费者。',
    ]),
    p([
      '元数据按成员名关联，保留标准方法包装装饰器在路由或事件装饰器上方、下方的声明。无需 reflect-metadata，也不自动创建业务实例或依赖。',
    ]),
    p([
      '在当前 Bun 1.4.0 上，装饰过的方法直接更新 #private 字段会触发转译错误；将此类更新放入 service 或未装饰的方法。私有依赖读取和实例方法绑定已通过测试。',
    ]),
    h2('完整 HTTP 示例'),
    p([
      '示例展示 bearer 会话查找、输入解析、按用户隔离的响应缓存与写操作后的缓存清理；认证会话和持久化由应用维护。utils 只由业务代码选择性导入，不成为框架运行时依赖。',
    ]),
    codeblock(httpExample),
    h2('Controller 与注册 API'),
    table(
      ['API', '说明'],
      [
        [
          [inline("@Controller(prefix = '')")],
          ['声明 Controller 前缀，与当前 app.prefix 叠加。'],
        ],
        [
          [
            inline(
              "@Get/@Post/@Put/@Patch/@Delete/@Options/@Head/@All(path = '')"
            ),
          ],
          ['声明公开实例方法的路由；同一方法可声明多个不同路由。'],
        ],
        [
          [inline('@Use(...middlewares)')],
          [
            '用于类和方法，接受现有 Handler/Middleware；按书写顺序执行，可提前返回 Response。',
          ],
        ],
        [
          [inline('registerControllers(app, instances)')],
          [
            '显式挂载已创建的实例，返回本批只读 ControllerRoute[]：method、path、controller、handler，path 包含 app 前缀。',
          ],
        ],
      ]
    ),
    p([
      '入口同时导出 RouteDecorator 与 SystemDecorator 类型，用于标注标准路由装饰器或类/公开方法装饰器。TimeoutOptions、WebSocketOptions、WebSocketData 和 BackOneWebSocket 类型从 @geektech/backone 核心入口导入。',
    ]),
    h2('执行顺序与继承'),
    codeblock(
      '全局 HTTP 中间件 → 基类 Use → 派生类 Use → 方法 Use\n→ timeout → authorize → rateLimit → validate → response → cache → 业务方法\n（回程反向退出；系统阶段不受不同种类装饰器的书写位置影响）',
      'text'
    ),
    ul([
      [
        '多个 @Use 从上到下进入，单个 @Use(a, b) 从左到右进入。Use 位于系统阶段外层，因此系统 Timeout 从 Use 调用 next() 后开始计时。',
      ],
      [
        '类策略按基类到派生类合并，再应用方法策略。方法 Timeout/Cache 替换继承默认值；Authorize/RateLimit 累加，每次请求均执行，缓存命中也不会绕过它们。',
      ],
      [
        'Status/Header 按基类、派生类、方法应用默认值，更具体的默认值优先；业务显式状态与头部优先。',
      ],
      [
        '实例及其构造函数依赖由业务端创建并复用，请求数据保存在 ctx。构造函数中 bind 和实例上可调用的方法替换保留原型声明。',
      ],
      [
        '继承的公开方法会注册；派生类同名原型覆盖隐藏基类声明，覆盖后需重新装饰。不可调用的实例属性或 getter 遮蔽不会被当作回调执行。每个派生 Controller 需自己的 @Controller。',
      ],
    ]),
    h2('输入校验'),
    table(
      ['API / 类型', '约定'],
      [
        [
          [inline('@Validate({ body?, query?, params? })')],
          [
            '类或方法策略；每项接受 InputSchema<T>，即同步 parse(value: unknown): T。校验失败返回 400。',
          ],
        ],
        [
          [
            inline(
              'validatedBody(ctx, schema) / validatedQuery(ctx, schema) / validatedParams(ctx, schema)'
            ),
          ],
          [
            '返回对应 schema 的 T；必须已使用同一个 schema 实例成功校验，否则抛错。',
          ],
        ],
        [
          [inline('InputSchema<T> / ValidateOptions')],
          ['结构化 schema 和三种可选输入来源，不要求特定校验库。'],
        ],
      ]
    ),
    p([
      "body 使用 JSON，query 解析为字符串记录，同名重复 key 为 string[]，例如 ?tag=a&tag=b 得到 { tag: ['a', 'b'] }。params 保持字符串。数字转换、缺省值和归一化由 parse 显式完成；结果不改写 ctx.query、ctx.params 或原始 body。",
    ]),
    h2('状态、响应头与超时'),
    table(
      ['API / 选项', '约定'],
      [
        [
          [inline('@Status(code)')],
          [
            '方法执行前设置默认状态；业务 ctx.status 和直接返回的 Response 状态优先。204/205/304 下的普通返回值会转为空响应。',
          ],
        ],
        [
          [inline('@Header(name, value)')],
          [
            '补充默认响应头，业务 ctx.headers/ctx.set 或 Response 中的同名头优先；支持直接或不可变 Response。',
          ],
        ],
        [
          [inline('@Timeout(ms) / @Timeout({ ms?, status?, message? })')],
          [
            '复用 TimeoutOptions：默认 ms=5000、status=504、message=Gateway Timeout；ms 必须为有限正数。超时返回响应，后台工作不会自动取消。',
          ],
        ],
      ]
    ),
    p([
      'Timeout 不会撤回已开始的数据库写入或外部调用。需要取消时由业务端使用可取消的后端接口与 AbortSignal；WebSocket 升级超时后，迟到完成的策略也不会再触发握手。',
    ]),
    p([
      'Header 对普通对象、字符串的 Content-Type 默认值生效；显式 Response 中的同名头优先。装饰器不额外分叉流式响应，响应体保持单次消费语义，应用需要复用时应显式复制或缓冲。',
    ]),
    h2('认证与限流'),
    table(
      ['API / 类型', '约定'],
      [
        [
          [inline('@Authorize({ authenticate, authorize? })')],
          [
            'authenticate(ctx) 同步或异步返回主体对象、null 或 undefined；缺少主体或认证拒绝返回 401。authorize(principal, ctx) 返回布尔值或 Promise，拒绝或异常返回 403。显式 HttpError 保留原状态。',
          ],
        ],
        [
          [inline('getPrincipal<P extends object>(ctx)')],
          [
            '读取认证建立的主体并推导为 P；尚未建立主体时抛出 401。主体也位于 ctx.state.principal。',
          ],
        ],
        [
          [inline('@RateLimit(limiter, { key })')],
          [
            '必须显式提供 key(ctx)，可同步或异步；limiter.consume(key) 可同步或异步返回 RateLimitResult。allowed=false 返回 429，并根据 resetAt 设置以秒为单位的 Retry-After。',
          ],
        ],
        [
          [
            inline(
              'AuthorizeOptions<P> / RateLimitBackend / RateLimitResult / RateLimitOptions'
            ),
          ],
          [
            'RateLimitResult 为 { allowed: boolean, remaining: number, resetAt: number }，resetAt 是毫秒时间戳；RateLimitOptions 是显式 key 函数。',
          ],
        ],
      ]
    ),
    p([
      '认证、限流、缓存和 schema 通过结构化接口注入。@geektech/backone-utils 的 v、createRateLimiter、createCache<CachedResponse>() 可直接接入；也可实现远程存储适配器。框架不会导入 utils 或第三方运行时。以下后端只是接口示例，生产限流状态由实际 limiter 维护。',
    ]),
    codeblock(backendExample),
    h2('响应缓存'),
    table(
      ['CacheOptions', '说明'],
      [
        [
          [inline('store: ResponseCacheStore')],
          [
            'get(key) 返回 CachedResponse、null、undefined 或对应 Promise；set(key, snapshot, ttlMs) 可同步或异步。后端负责 TTL 和失效。',
          ],
        ],
        [
          [inline('key(ctx)')],
          [
            '必填，同步或异步返回业务 key；应包含影响响应的路径参数、query、语言等维度。路由隔离本身不区分同一路由的参数值。',
          ],
        ],
        [
          [inline("scope: 'public' | ((ctx) => string | Promise<string>)")],
          [
            '必填，明确公共共享或解析用户/租户标识。不要把个性化结果放入 public scope。',
          ],
        ],
        [[inline('ttlMs')], ['必填，有限正毫秒数；传给存储后端。']],
        [
          [inline('maxBodyBytes? / snapshotTimeoutMs?')],
          ['有限正数，默认 1 MiB / 100ms，约束响应体快照大小与读取时限。'],
        ],
      ]
    ),
    ul([
      [
        '@Cache(options) 可用于类和方法，仅缓存成功的 GET 响应。内部 key 自动包含 app、HTTP 方法/路由、scope 与自定义 key，不同 app 或路由互相隔离。',
      ],
      [
        'CachedResponse 是 { status, statusText, headers: ReadonlyArray<readonly [string, string]>, body: Uint8Array | null } 快照，不存活的 Response。命中时重建独立 Response，读取快照不会消费交给调用方的原响应体。',
      ],
      [
        '请求或响应 no-store、public scope 下的 private 响应、Set-Cookie、SSE、非成功状态、已消费的响应体、过大或读取过慢的响应体均跳过缓存。非 GET 方法直接执行。',
      ],
      [
        'Authorize 和 RateLimit 每次都执行；认证失败、限流结果和业务错误不会作为成功快照缓存。',
      ],
      [
        '快照在全局压缩前读取，完整中间件链成功后再检查最终状态和隐私头部，允许时才写入。同步存储立即更新；异步写入在后台完成，失败不替换业务响应，远程存储可能在响应返回后才可见。',
      ],
      [
        '缓存失效由后端控制，使用到期、存储 clear() 或业务版本 key；内部 namespace 是不透明实现，不能直接把业务 key 当作完整存储 key 删除。示例写操作通过 store.clear() 失效整个专用存储。',
      ],
    ]),
    h2('WebSocket 网关'),
    table(
      ['API', '约定'],
      [
        [
          [inline('@WebSocket(path)')],
          [
            '声明精确路径网关，叠加当前 app 前缀；不支持 :params、*、query 或 hash。每个派生网关需自己的声明。',
          ],
        ],
        [
          [inline('@OnOpen() / @OnDrain()')],
          ['公开实例方法签名：(ws: BackOneWebSocket<WebSocketData>)。'],
        ],
        [
          [inline('@OnMessage()')],
          ['签名：(ws, message: string | Uint8Array)。'],
        ],
        [
          [inline('@OnClose()')],
          ['签名：(ws, code: number, reason: string)。'],
        ],
        [
          [inline('registerWebSockets(app, instances)')],
          [
            '整批校验后挂载，返回只读 WebSocketGateway[]：{ path, gateway, events: [{ event, handler }] }。重复路径（含函数式 app.ws）或重复事件回调被拒绝。',
          ],
        ],
      ]
    ),
    codeblock(gatewayExample),
    ul([
      [
        '网关类的 Use、Timeout、Authorize、RateLimit 仅在升级时执行一次，不会逐消息执行。消息级权限和配额由业务回调处理。',
      ],
      [
        'Validate、Status、Header、Cache 是 HTTP-only，不能用于网关类；事件方法上的 HTTP 路由、Use 或任何系统策略在注册时被拒绝。',
      ],
      [
        '升级先完整执行局部中间件，提前 Response 或 HttpError 会拒绝握手；ctx.state 浅拷贝到 ws.data.state，认证主体位于 state.principal。全局 HTTP 中间件对已匹配升级路径的行为保持原样，不会自动套用。',
      ],
      [
        '回调支持实例绑定、继承和标准方法包装。同步异常或异步拒绝由框架收敛，活动连接以 1011 关闭，不产生未处理的 Promise 拒绝；关闭回调自身的异常也被收敛。',
      ],
    ]),
    h2('函数式 WebSocket 局部中间件'),
    p([
      '现有 app.ws 和 RouteGroup.ws 保持可用，第三参数 WebSocketOptions 可配置只在升级前执行的 middlewares: readonly Handler[]。app.hasWebSocket(path) 检查当前前缀下是否已有 WebSocket 注册。',
    ]),
    codeblock(`import { createServer, HttpError } from '@geektech/backone';

const app = createServer();
app.group('/v1', (group) => {
  group.ws('/echo', {
    message(ws, message) { ws.send(String(message)); },
  }, {
    middlewares: [(ctx, next) => {
      if (ctx.cookie('session') !== 'demo-session') throw new HttpError(401);
      ctx.state.userId = 'u1';
      return next();
    }],
  });
});
await app.listen();`),
    h2('注册校验与兼容'),
    ul([
      [
        '先校验整个批次，再注册；失败时本批声明均不生效。不同 app 的注册相互独立。',
      ],
      [
        'Controller 相同 HTTP 方法和匹配路径禁止重复，参数名和多余斜线不会绕过检查；共享动态路径段需要相同参数名，例如 /users/:id/view 与 /users/:id/edit。',
      ],
      [
        'HTTP 路由重复检查覆盖装饰器入口，混用函数式 HTTP 路由时业务端需保证不冲突；WebSocket 会检查现有函数式注册。',
      ],
      [
        '路由与事件仅支持公开实例方法，static、#private 方法不支持，包含 query/hash 的路径被拒绝。',
      ],
    ]),
    h2('CLI 与演练'),
    codeblock('backone init my-api --template rest-api'),
    p([
      '三个模板默认使用类和业务模块。REST 的 modules/users 包含 Module、Controller、Service、Repository、模型、Schema 与 SQLite，通用 middlewares 置于公共目录；await application.initialize() 后可通过 application.server.handle(new Request(...)) 测试 HTTP，无需监听端口，最后调用 application.stop() 关闭资源。',
    ]),
    p([
      '本仓库运行 bun run dev 后，可访问 /controller-api/users 与 /controller-api/users/:id，POST 接受带 name 的 JSON。系统策略及认证网关示例见 playground 源码。',
    ]),
  ];
}
