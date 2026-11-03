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
import { minimalClassExample } from '../examples';

/* ------------------------------------------------------------------ */
/* 概览                                                                 */
/* ------------------------------------------------------------------ */

export function renderBackoneOverview(ctx: PageContext): VNode | VNode[] {
  return [
    p([
      'BackOne 是基于 Bun 的轻量级纯 TypeScript 服务端框架，零运行时依赖，推荐类路由、服务和 Repository，以 Module 组织业务并由 Application 显式组装对象，提供路由、中间件、上下文、静态文件与 WebSocket 服务。它把服务端开发保持在 TypeScript 的一个语言系统里：公共 API 只依赖标准 Web 类型（',
      inline('Request'),
      ' / ',
      inline('Response'),
      ' / ',
      inline('Headers'),
      '），Bun 专属能力封装在框架内部，不泄漏到公开签名。',
    ]),
    h2('特性'),
    ul([
      [
        inline('Bun-native 工具链'),
        '：路由、中间件、静态文件全部构建在 Bun 原生能力之上，无任何外部运行时依赖。',
      ],
      [
        inline('分段基数树路由'),
        '：静态段、:param 动态段与 * 通配段，匹配复杂度为路径段数线性，支持 405 Allow 头自动生成。',
      ],
      [
        inline('洋葱模型中间件'),
        '：与 Koa 一致的内外层执行模型，中间件与处理器共用同一签名，可自由组合。',
      ],
      [
        inline('零拷贝静态文件'),
        '：基于 ',
        inline('Bun.file'),
        ' 流式发送，内置 ETag / Last-Modified / 304 / Range 206 与目录穿越防护。',
      ],
      [
        inline('WebSocket 开箱即用'),
        '：基于 Bun.serve 原生 WebSocket 的薄壳封装，按路径注册处理器。',
      ],
      [
        inline('可测试的请求管线'),
        '：',
        inline('handle()'),
        ' 独立于监听，可直接用 Request 调用，便于编写测试。',
      ],
    ]),
    h2('安装'),
    codeblock('bun add @geektech/backone'),
    p(['要求 Bun ', inline('>= 1.3.0'), '。']),
    h2('类应用示例'),
    p(
      '推荐标准装饰器，要求 Bun >=1.3.10、TypeScript >=5.2。函数式 API 继续兼容。'
    ),
    codeblock(minimalClassExample),
    h2('包内模块'),
    table(
      ['模块', '说明'],
      [
        [
          [inline('server.ts')],
          ['应用与 createServer：路由注册、中间件编排、生命周期管理'],
        ],
        [[inline('router/')], ['路由表与分段基数树匹配（trie）']],
        [
          [inline('middleware/')],
          [
            '内置中间件：compose / logger / cors / gzip / helmet / static / timeout',
          ],
        ],
        [
          [inline('context.ts')],
          ['单请求上下文：params / query / body / cookie / 响应构建'],
        ],
        [[inline('response.ts')], ['处理器返回值序列化为标准 Response']],
        [[inline('errors.ts')], ['HttpError 与默认 HTTP 状态消息']],
        [[inline('websocket.ts')], ['WebSocket 处理器类型']],
      ]
    ),
    h2('入口导出'),
    codeblock(
      [
        'import {',
        '  BackOneServer, createServer,',
        '  Context, HttpError,',
        '  compose, cors, gzip, helmet, logger, serveStatic, timeout,',
        "} from '@geektech/backone';",
        '',
        '// 类型：AppOptions / Handler / Middleware / Next / RouteMethod /',
        '//       WebSocketHandler / BackOneWebSocket / CorsOptions / ...',
      ].join('\n')
    ),
    h2('下一步'),
    p([
      '按顺序阅读：',
      h('a', { href: ctx.href('/backone/quickstart') }, ['快速开始']),
      ' → ',
      h('a', { href: ctx.href('/backone/server') }, ['服务端与路由']),
      ' → ',
      h('a', { href: ctx.href('/backone/middleware') }, ['中间件']),
      ' → ',
      h('a', { href: ctx.href('/backone/context') }, ['上下文与响应']),
      '。',
    ]),
  ];
}

/* ------------------------------------------------------------------ */
/* 快速开始                                                              */
/* ------------------------------------------------------------------ */

export function renderBackoneQuickstart(ctx: PageContext): VNode | VNode[] {
  return [
    p(
      '本页使用类创建路由，由 Application 管理组装和服务生命周期。业务项目推荐 Module → Controller → Service → Repository；最小应用只保留实际需要的对象。'
    ),
    h2('创建项目'),
    codeblock(
      'bunx @geektech/backone-cli init my-app --template minimal\ncd my-app\nbun run typecheck\nbun run dev',
      'sh'
    ),
    p(
      '模板要求 Bun >=1.3.10、TypeScript >=5.2，使用标准装饰器。保持 experimentalDecorators 和 emitDecoratorMetadata 关闭。'
    ),
    h2('第一个服务'),
    p(
      '手动项目安装 @geektech/backone 后，也可把以下简化示例放到 src/index.ts，用 bun src/index.ts 运行。'
    ),
    codeblock(minimalClassExample),
    p([
      '访问 ',
      inline('http://127.0.0.1:3000'),
      ' 返回 Hello, BackOne!；访问 /hello/Alice 返回 hello, Alice。',
    ]),
    h2('组装中间件和静态文件'),
    p(
      '在 Application 构造函数中为 this.server 注册中间件和静态资源，业务接口交给 Controller 类。'
    ),
    codeblock(
      "this.server.useCors();\nthis.server.useGzip();\nthis.server.useHelmet();\nthis.server.useTimeout({ ms: 5000 });\nthis.server.serveStatic('/static', './public');"
    ),
    h2('REST 与数据库'),
    codeblock('backone init my-api --template rest-api', 'sh'),
    p(
      'REST 模板的 modules/users 包含 UsersModule、SQLite、UsersRepository、UsersService 和 UsersController。Application 使用 registerModules 挂载模块。POST/PUT 通过 @Validate 校验 JSON，@Status 设置 201/204，领域错误由 Controller 转换为 HTTP 状态。Application.initialize 准备资源；start 自动初始化并监听；stop 关闭资源。'
    ),
    h2('下一步'),
    p([
      '阅读 ',
      h('a', { href: ctx.href('/backone/architecture') }, ['对象优先开发']),
      ' 了解对象职责、构造注入、事务和测试；',
      h('a', { href: ctx.href('/backone/decorators') }, ['系统装饰器']),
      ' 提供 Controller/Gateway 的完整 API。底层函数式路由仍可使用，参见 ',
      h('a', { href: ctx.href('/backone/server') }, ['服务端与路由']),
      '。',
    ]),
  ];
}

/* ------------------------------------------------------------------ */
/* 服务端与路由                                                           */
/* ------------------------------------------------------------------ */

export function renderBackoneServer(ctx: PageContext): VNode | VNode[] {
  return [
    p([
      'BackOneServer 是应用入口：负责路由注册、中间件编排与 ',
      inline('Bun.serve'),
      ' 生命周期。',
      inline('handle()'),
      ' 是独立于监听的请求管线，可直接用于测试。',
    ]),
    h2('创建应用'),
    codeblock(
      'const app = createServer(options); // 等价于 new BackOneServer(options)'
    ),
    h3('AppOptions'),
    table(
      ['选项', '类型', '默认', '说明'],
      [
        [
          [inline('port')],
          ['number', inline('3000')],
          ['监听端口；传 0 表示随机可用端口'],
        ],
        [[inline('hostname')], ['string', inline('0.0.0.0')], ['监听地址']],
        [
          [inline('development')],
          ['boolean', inline('false')],
          ['开发模式：控制台输出错误详情、错误响应携带 message'],
        ],
        [
          [inline('maxRequestBodySize')],
          ['number', '—'],
          ['请求体大小上限（字节），默认由 Bun 决定'],
        ],
        [
          [inline('idleTimeout')],
          ['number', '—'],
          ['空闲连接超时（秒），默认由 Bun 决定'],
        ],
      ]
    ),
    h2('路由注册'),
    p([
      '每个 HTTP 方法都有对应的注册方法，handler 支持多个（按顺序组成处理器链）：',
    ]),
    codeblock(
      [
        'app.get(path, ...handlers);',
        'app.post(path, ...handlers);',
        'app.put(path, ...handlers);',
        'app.patch(path, ...handlers);',
        'app.delete(path, ...handlers);',
        'app.options(path, ...handlers);',
        'app.head(path, ...handlers);',
        'app.all(path, ...handlers);  // 匹配任意方法',
      ].join('\n')
    ),
    h3('路径参数与通配'),
    p([
      '路由表是分段基数树，支持静态段、',
      inline(':param'),
      ' 动态段与 ',
      inline('*'),
      ' 通配段，参数通过 ',
      inline('ctx.params'),
      ' 读取（带类型推导）：',
    ]),
    codeblock(
      [
        "app.get<{ id: string }>('/users/:id', (ctx) => {",
        '  return `user ${ctx.params.id}`;',
        '});',
        '',
        "app.get('/files/*', (ctx) => `wildcard: ${ctx.params.wildcard}`);",
      ].join('\n')
    ),
    h3('路由组 group'),
    p(['在指定前缀下批量注册路由，适合组织模块化 API：']),
    codeblock(
      [
        "app.group('/api', (api) => {",
        "  api.get('/users', listUsers);",
        "  api.get('/users/:id', getUser);",
        "  api.post('/users', createUser);",
        '});',
        '',
        '// GET /api/users  POST /api/users  GET /api/users/:id',
      ].join('\n')
    ),
    h3('路由前缀 usePrefix'),
    p(['为之后注册的路由统一增加前缀，支持持久形式与作用域形式（可嵌套）：']),
    codeblock(
      [
        "app.usePrefix('/api');",
        "app.get('/users', handler);   // GET /api/users",
        '',
        "app.usePrefix('/v2', (api) => {",
        "  api.get('/users', handler); // GET /api/v2/users",
        '});',
        '',
        'app.usePrefix();              // 重置为无前缀',
        "app.get('/status', handler);  // GET /status",
      ].join('\n')
    ),
    callout(
      '说明',
      p([
        'usePrefix 作用于路由注册期而非请求处理期，因此与 group 一样在注册时生效；前缀自动归一化（补前导 /、去末尾 /）。',
      ])
    ),
    h2('未匹配与 405'),
    p([
      '未匹配到路径时返回 404 JSON；路径存在但方法不匹配时返回 405，并自动生成 ',
      inline('Allow'),
      ' 头（',
      inline('HEAD'),
      ' 会回退到 ',
      inline('GET'),
      ' 处理器）：',
    ]),
    codeblock(
      [
        '// GET /api/users 已注册，POST /api/users 未注册时',
        '// → 405 {"error":"Method Not Allowed","status":405}',
        '//   Allow: GET, HEAD, OPTIONS',
      ].join('\n'),
      'text'
    ),
    h2('生命周期'),
    codeblock(
      [
        'const port = await app.listen();      // 启动监听，返回实际端口',
        'app.port;                              // 当前端口，未启动为 null',
        'await app.close({ timeout: 5000 });    // 优雅关闭：停止接收新连接，等待进行中请求',
      ].join('\n')
    ),
    h3('测试请求管线'),
    p(['不启动监听也能直接处理请求，适合编写测试：']),
    codeblock(
      [
        'const app = createServer();',
        "app.get('/ping', () => 'pong');",
        '',
        "const response = await app.handle(new Request('http://127.0.0.1/ping'));",
        'console.log(await response.text()); // pong',
      ].join('\n')
    ),
    h2('下一步'),
    p([
      '了解 ',
      h('a', { href: ctx.href('/backone/middleware') }, ['中间件']),
      ' 或 ',
      h('a', { href: ctx.href('/backone/websocket') }, ['WebSocket']),
      '。',
    ]),
  ];
}

/* ------------------------------------------------------------------ */
/* 中间件                                                                */
/* ------------------------------------------------------------------ */

export function renderBackoneMiddleware(_ctx: PageContext): VNode | VNode[] {
  return [
    p([
      'BackOne 采用洋葱模型：中间件按注册顺序执行，',
      inline('next()'),
      ' 进入下一层，返回值从内向外逐层冒泡。中间件与处理器共用同一个签名 ',
      inline('(ctx, next) => unknown'),
      '，因此可以自由混用。',
    ]),
    h2('洋葱模型'),
    codeblock(
      [
        'app.use(async (ctx, next) => {',
        "  console.log('1. before');",
        '  const result = await next();',
        "  console.log('2. after');",
        '  return result;',
        '});',
        '',
        "app.get('/', () => 'ok');",
        '',
        '// 请求处理顺序：before → 路由处理器 → after',
      ].join('\n')
    ),
    callout(
      '注意',
      p([inline('next()'), ' 在同一请求中只能调用一次，重复调用会抛出错误。']),
      'warn'
    ),
    h2('use() 与快捷方法'),
    p([
      '内置中间件都有对应的快捷方法，也可以直接 ',
      inline('use()'),
      ' 自定义中间件：',
    ]),
    table(
      ['方法', '中间件', '说明'],
      [
        [
          [inline('useLogger()')],
          [inline('logger')],
          ['请求日志：[时间] method path status 耗时'],
        ],
        [[inline('useCors()')], [inline('cors')], ['跨域：允许来源、预检处理']],
        [
          [inline('useGzip()')],
          [inline('gzip')],
          ['gzip 压缩：文本类、超阈值、未编码响应'],
        ],
        [
          [inline('useHelmet()')],
          [inline('helmet')],
          ['安全响应头（helmet 风格）'],
        ],
        [
          [inline('useTimeout()')],
          [inline('timeout')],
          ['请求超时，超时返回 504'],
        ],
        [[inline('serveStatic()')], [inline('serveStatic')], ['静态文件服务']],
      ]
    ),
    h2('logger'),
    p([
      '输出格式 ',
      inline('[YYYY-MM-DD HH:mm:ss] GET /api/users 200 1.23ms'),
      '，可自定义输出函数与是否带时间戳：',
    ]),
    codeblock(
      [
        'app.useLogger({',
        '  timestamp: true,',
        '  out: (line) => console.log(line),',
        '});',
      ].join('\n')
    ),
    table(
      ['选项', '类型', '默认', '说明'],
      [
        [
          [inline('out')],
          ['(line: string) => void', inline('console.log')],
          ['自定义输出函数'],
        ],
        [
          [inline('timestamp')],
          ['boolean', inline('true')],
          ['是否输出请求时间'],
        ],
      ]
    ),
    h2('cors'),
    codeblock(
      [
        'app.useCors({',
        "  origin: ['https://app.example.com'],",
        '  methods: ["GET", "POST", "DELETE"],',
        '  credentials: true,',
        '  maxAge: 600,',
        '});',
      ].join('\n')
    ),
    table(
      ['选项', '类型', '默认', '说明'],
      [
        [
          [inline('origin')],
          ['string | string[] | fn', inline("'*'")],
          ['允许来源；函数形式按请求 Origin 动态决定'],
        ],
        [[inline('methods')], ['string[]', '常见 REST 集合'], ['允许的方法']],
        [[inline('allowedHeaders')], ['string[]', '—'], ['允许的请求头']],
        [
          [inline('exposeHeaders')],
          ['string[]', '—'],
          ['暴露给浏览器的响应头'],
        ],
        [
          [inline('credentials')],
          ['boolean', inline('false')],
          ['允许携带凭证'],
        ],
        [[inline('maxAge')], ['number', '—'], ['预检结果缓存秒数']],
      ]
    ),
    h2('gzip'),
    p([
      '基于 ',
      inline('Bun.gzipSync'),
      ' 的零依赖压缩：仅压缩文本类、未编码、大于阈值的响应，客户端不支持 gzip 时自动跳过。',
    ]),
    codeblock('app.useGzip({ threshold: 1024, level: 6 });'),
    table(
      ['选项', '类型', '默认', '说明'],
      [
        [[inline('threshold')], ['number', inline('1024')], ['最小压缩字节数']],
        [[inline('level')], ['1-9', inline('6')], ['压缩级别']],
        [
          [inline('types')],
          ['string[]', '文本类与 JSON/JS/XML/SVG'],
          ['可压缩的 Content-Type 前缀'],
        ],
      ]
    ),
    h2('helmet'),
    p([
      '默认设置 ',
      inline('X-Content-Type-Options: nosniff'),
      '、',
      inline('X-Frame-Options: DENY'),
      '、',
      inline('Referrer-Policy: no-referrer'),
      ' 等安全头；每项可覆盖或设为 ',
      inline('false'),
      ' 禁用，且不覆盖处理器显式设置的头：',
    ]),
    codeblock(
      [
        'app.useHelmet({',
        '  contentSecurityPolicy: "default-src \'self\'",',
        '  xFrameOptions: false, // 禁用该项',
        '});',
      ].join('\n')
    ),
    h2('timeout'),
    p([
      '基于 ',
      inline('Promise.race'),
      '：超过指定时间未完成则返回 504（后台执行仍会继续，但响应已返回）。',
    ]),
    codeblock(
      [
        'app.useTimeout({ ms: 5000 });       // 5s 超时 → 504',
        'app.useTimeout(3000);               // 简写：3s 超时',
      ].join('\n')
    ),
    h2('serveStatic'),
    p([
      '基于 ',
      inline('Bun.file'),
      ' 流式发送、零拷贝，内置 ETag / Last-Modified / 304 / Range 206，并默认开启目录穿越防护（拒绝 ',
      inline('..'),
      ' 段）：',
    ]),
    codeblock(
      [
        "app.serveStatic('/static', './public', {",
        "  cacheControl: 'public, max-age=3600',",
        "  index: 'index.html',",
        '});',
      ].join('\n')
    ),
    table(
      ['选项', '类型', '默认', '说明'],
      [
        [
          [inline('cacheControl')],
          ['string | false', inline("'public, max-age=3600'")],
          ['Cache-Control 头；false 不设置'],
        ],
        [
          [inline('index')],
          ['string', '—'],
          ['目录访问时的回退文件（相对 rootDir）'],
        ],
      ]
    ),
    h2('自定义中间件'),
    p([
      '中间件可通过 ',
      inline('ctx.state'),
      ' 在链路内共享数据，并基于返回值注入响应头：',
    ]),
    codeblock(
      [
        'app.use(async (ctx, next) => {',
        '  ctx.state.requestId = crypto.randomUUID();',
        '  const response = await next();',
        '  if (response instanceof Response) {',
        '    response.headers.set("x-request-id", String(ctx.state.requestId));',
        '  }',
        '  return response;',
        '});',
      ].join('\n')
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* 上下文与响应                                                           */
/* ------------------------------------------------------------------ */

export function renderBackoneContext(ctx: PageContext): VNode | VNode[] {
  return [
    p([
      'Context 是单个请求的处理上下文：',
      inline('query'),
      ' / ',
      inline('body'),
      ' 采用惰性解析（首次访问时解析并缓存），避免热路径上的无谓开销；',
      inline('headers'),
      ' 与 ',
      inline('state'),
      ' 用于在中间件与处理器之间传递响应头与共享数据。',
    ]),
    h2('读取请求'),
    table(
      ['成员', '说明'],
      [
        [[inline('request')], ['原始 Request 对象']],
        [[inline('method')], ['请求方法（大写）']],
        [[inline('pathname')], ['规范化后的路径名（不含 query）']],
        [[inline('params')], ['路径参数（由路由匹配写入，带类型泛型）']],
        [[inline('query')], ['URLSearchParams，惰性解析并缓存']],
        [[inline('headers')], ['响应头构建器']],
        [[inline('state')], ['中间件与处理器之间共享的可变数据']],
      ]
    ),
    codeblock(
      [
        "app.get<{ id: string }>('/users/:id', (ctx) => {",
        '  const id = ctx.params.id;',
        "  const page = ctx.query.get('page') ?? '1';",
        "  const token = ctx.getHeader('authorization');",
        '  ctx.state.visited = true;',
        '  return { id, page };',
        '});',
      ].join('\n')
    ),
    h2('请求体'),
    p(['三种惰性解析方式，解析失败抛出 ', inline('HttpError(400)'), '：']),
    table(
      ['方法', '说明'],
      [
        [
          [inline('bodyJson<T>()')],
          ['解析 JSON 请求体并返回类型化对象；非法 JSON 抛 400'],
        ],
        [[inline('bodyText()')], ['读取文本请求体']],
        [
          [inline('bodyForm()')],
          [
            '解析表单（multipart/form-data 或 urlencoded），返回标准 FormData 方法子集',
          ],
        ],
      ]
    ),
    codeblock(
      [
        "app.post('/users', async (ctx) => {",
        '  const body = await ctx.bodyJson<{ name: string; email: string }>();',
        '  return ctx.json({ created: true, name: body.name }, 201);',
        '});',
      ].join('\n')
    ),
    h2('Cookie'),
    codeblock(
      [
        '// 读取请求 Cookie',
        "const theme = ctx.cookie('theme');",
        '',
        '// 追加响应 Set-Cookie（链式）',
        "ctx.setCookie('theme', 'dark', {",
        '  httpOnly: true,',
        "  sameSite: 'Lax',",
        '  maxAge: 60 * 60 * 24 * 7,',
        '  path: "/",',
        '});',
      ].join('\n')
    ),
    h2('构建响应'),
    table(
      ['方法', '说明'],
      [
        [
          [inline('json(data, status?)')],
          ['JSON 响应（默认 application/json）'],
        ],
        [[inline('text(data, status?)')], ['纯文本响应']],
        [[inline('html(data, status?)')], ['HTML 响应']],
        [[inline('stream(body, status?)')], ['流式响应']],
        [[inline('redirect(url, status=302)')], ['重定向']],
        [[inline('noContent()')], ['204 No Content']],
        [[inline('set(name, value)')], ['设置响应头（链式）']],
        [[inline('status')], ['读写响应状态码，默认 200']],
      ]
    ),
    h2('返回值序列化'),
    p(['处理器可以不显式构建 Response，直接返回值，由框架统一序列化：']),
    table(
      ['返回值', '行为'],
      [
        ['Response', '直接透传（零开销）'],
        ['string', '按文本响应'],
        ['number / boolean', '按文本响应'],
        ['object', '按 JSON 响应'],
        ['undefined / null', '204（或 ctx.status）'],
      ]
    ),
    codeblock(
      [
        "app.get('/a', () => 'text');          // text/plain",
        "app.get('/b', () => ({ ok: true }));  // application/json",
        "app.get('/c', () => undefined);       // 204",
        "app.get('/d', (ctx) => ctx.redirect('/login')); // 302",
      ].join('\n')
    ),
    h2('HttpError'),
    p([
      '抛出 ',
      inline('HttpError'),
      ' 即可由框架统一转为 JSON 错误响应（development 模式下 5xx 会输出错误详情与 cause）：',
    ]),
    codeblock(
      [
        "import { HttpError } from '@geektech/backone';",
        '',
        "if (!user) throw new HttpError(404, 'User not found');",
        'if (!allowed) throw new HttpError(403);',
      ].join('\n')
    ),
    p([
      '响应体格式：',
      inline('{"error": "<message>", "status": <code>}'),
      '；非 development 模式下的 5xx 统一返回 ',
      inline('Internal Server Error'),
      ' 避免泄漏细节。',
    ]),
    hr(),
    p([
      '继续：',
      h('a', { href: ctx.href('/backone/websocket') }, ['WebSocket']),
      '。',
    ]),
  ];
}

/* ------------------------------------------------------------------ */
/* WebSocket                                                            */
/* ------------------------------------------------------------------ */

export function renderBackoneWebsocket(_ctx: PageContext): VNode | VNode[] {
  return [
    p([
      'BackOne 的 WebSocket 基于 Bun.serve 原生能力，是一层薄壳封装：通过 ',
      inline('app.ws(path, handler)'),
      ' 注册处理器，请求 Upgrade 时自动升级并按路径分发。',
    ]),
    h2('注册处理器'),
    codeblock(
      [
        'app.ws("/chat", {',
        '  open(ws) {',
        '    // 连接建立',
        '  },',
        '  message(ws, message) {',
        '    // 收到消息：string | Uint8Array',
        '  },',
        '  close(ws, code, reason) {',
        '    // 连接关闭',
        '  },',
        '  drain(ws) {',
        '    // 连接可写（背压缓解）',
        '  },',
        '});',
      ].join('\n')
    ),
    h2('处理器生命周期'),
    table(
      ['钩子', '签名', '说明'],
      [
        [[inline('open')], ['(ws) => void'], ['连接建立']],
        [
          [inline('message')],
          ['(ws, message: string | Uint8Array) => void'],
          ['收到消息（文本或二进制）'],
        ],
        [
          [inline('close')],
          ['(ws, code: number, reason: string) => void'],
          ['连接关闭'],
        ],
        [[inline('drain')], ['(ws) => void'], ['连接可写，用于背压缓解']],
      ]
    ),
    h2('完整示例：聊天室'),
    codeblock(
      [
        "import { createServer } from '@geektech/backone';",
        "import type { BackOneWebSocket } from '@geektech/backone';",
        '',
        'const app = createServer({ port: 3000, development: true });',
        '',
        "app.serveStatic('/', './public');",
        '',
        'const clients = new Set<BackOneWebSocket>();',
        '',
        "app.ws('/chat', {",
        '  open(ws) {',
        '    clients.add(ws);',
        '    broadcast(`System: a new user joined (${clients.size} online)`);',
        '  },',
        '  message(_ws, message) {',
        '    broadcast(`User: ${String(message)}`);',
        '  },',
        '  close(ws) {',
        '    clients.delete(ws);',
        '    broadcast(`System: a user left (${clients.size} online)`);',
        '  },',
        '});',
        '',
        'function broadcast(message: string) {',
        '  for (const client of clients) {',
        '    client.send(message);',
        '  }',
        '}',
        '',
        'const port = await app.listen();',
        'console.log(`WebSocket chat running at http://127.0.0.1:${port}`);',
      ].join('\n')
    ),
    callout(
      '提示',
      p([
        '路径会应用当前路由前缀（与 group / usePrefix 一致）；升级请求携带 ',
        inline('Upgrade: websocket'),
        ' 头时自动处理。',
      ]),
      'tip'
    ),
    h2('类型'),
    p([
      inline('BackOneWebSocket<T>'),
      ' 是 Bun 的 ServerWebSocket 直接别名，发送消息用 ',
      inline('ws.send()'),
      '，关闭用 ',
      inline('ws.close()'),
      '：',
    ]),
    codeblock(
      [
        "import type { BackOneWebSocket } from '@geektech/backone';",
        '',
        'function broadcast(message: string) {',
        '  for (const client of clients) {',
        '    client.send(message);',
        '  }',
        '}',
      ].join('\n')
    ),
  ];
}
