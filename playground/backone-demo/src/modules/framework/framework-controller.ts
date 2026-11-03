import {
  HttpError,
  name,
  version,
  type Context,
  type Middleware,
} from '@geektech/backone';
import {
  All,
  Controller,
  Delete,
  Get,
  Header,
  Post,
  Status,
  Use,
} from '@geektech/backone/decorators';
import type { StreamsService } from './streams-service';

const requireAuthorization: Middleware = (ctx, next) => {
  if (!ctx.request.headers.has('authorization')) {
    throw new HttpError(401, 'Missing authorization header');
  }
  return next();
};

/** 本类演示 HTTP 传输能力；业务接口单独使用 Service 和 Repository。 */
@Controller()
export class FrameworkController {
  constructor(private readonly streams: StreamsService) {}

  @Get('/')
  home() {
    return 'BackOne playground is running';
  }

  @Get('/hello/:name')
  hello(ctx: Context) {
    return `hello, ${ctx.params.name}`;
  }

  @Get('/typed/:id')
  typed(ctx: Context & { params: Readonly<{ id: string }> }) {
    return { id: ctx.params.id, typed: true };
  }

  @Get('/large')
  large() {
    return 'backone-gzip-demo-'.repeat(256);
  }

  @Get('/files/*')
  files(ctx: Context) {
    return { wildcard: ctx.params.wildcard };
  }

  @Get('/json')
  json() {
    return { framework: name, version, timestamp: Date.now() };
  }

  @Get('/search')
  search(ctx: Context) {
    return {
      q: ctx.query.get('q') ?? '',
      page: Number(ctx.query.get('page') ?? '1'),
    };
  }

  @Post('/echo')
  async echo(ctx: Context) {
    const body = await ctx.bodyJson<{ message?: string }>();
    return { echoed: body.message ?? null };
  }

  @Post('/text')
  async text(ctx: Context) {
    return ctx.text(await ctx.bodyText());
  }

  @Post('/form')
  async form(ctx: Context) {
    return Object.fromEntries(await ctx.bodyForm());
  }

  @Get('/request-id')
  requestId(ctx: Context) {
    return { requestId: ctx.state.requestId };
  }

  @Get('/status')
  @Status(202)
  @Header('x-powered-by', 'backone')
  status() {
    return { accepted: true };
  }

  @Get('/theme')
  theme(ctx: Context) {
    return { theme: ctx.cookie('theme') ?? 'default' };
  }

  @Post('/theme')
  setTheme(ctx: Context) {
    ctx.setCookie('theme', 'dark', { httpOnly: true, path: '/', maxAge: 3600 });
    return { ok: true };
  }

  @Get('/old-path')
  redirect(ctx: Context) {
    return ctx.redirect('/');
  }

  @Delete('/cleanup')
  @Status(204)
  cleanup() {}

  @Get('/events')
  @Header('content-type', 'text/event-stream')
  @Header('cache-control', 'no-cache')
  events(ctx: Context) {
    return ctx.stream(this.streams.events());
  }

  @Get('/clock')
  @Header('content-type', 'text/event-stream')
  @Header('cache-control', 'no-cache')
  clock(ctx: Context) {
    return ctx.stream(this.streams.clock(ctx.request.signal));
  }

  @Get('/admin')
  @Use(requireAuthorization)
  admin() {
    return { admin: true };
  }

  @Get('/boom')
  boom() {
    throw new Error('intentional error, see console');
  }

  @All('/ping')
  ping() {
    return 'pong';
  }
}

@Controller()
export class V1Controller {
  @Get('/users')
  list() {
    return 'users list';
  }

  @Get('/users/:id')
  detail(ctx: Context) {
    return { id: ctx.params.id, version: 'v1' };
  }
}

/** 模块前缀由 V2Module 声明，响应从当前请求读取实际挂载路径。 */
@Controller()
export class V2Controller {
  @Get('/hello')
  hello(ctx: Context) {
    const segments = ctx.pathname.split('/').filter(Boolean);
    const prefix = `/${segments.slice(0, -1).join('/')}`;
    return { message: 'hello from prefixed route', prefix };
  }
}

@Controller()
export class V2AdminController {
  @Get('/ping')
  ping() {
    return 'admin pong under /api/v2/admin';
  }
}
