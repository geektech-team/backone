import type { Context } from '@geektech/backone';
import { Controller, Get, Post } from '@geektech/backone/decorators';
import type { ToolsService } from './tools-service';

@Controller()
export class ToolsController {
  constructor(private readonly tools: ToolsService) {}

  @Get('/ids')
  ids() {
    return this.tools.ids();
  }

  @Get('/config')
  config() {
    return this.tools.configuration();
  }

  @Get('/rank')
  rank(ctx: Context) {
    return this.tools.rank(ctx.query.get('city') ?? 'shanghai');
  }

  @Post('/token')
  async token(ctx: Context) {
    const body = await ctx.bodyJson<{ role?: string }>();
    return this.tools.issueToken(body.role);
  }

  @Get('/me')
  me(ctx: Context) {
    const header = ctx.getHeader('authorization');
    return this.tools.verifyToken(
      header?.startsWith('Bearer ') ? header.slice(7) : undefined
    );
  }

  @Get('/limited')
  limited(ctx: Context) {
    return this.tools.limited(ctx.getHeader('x-forwarded-for') ?? 'local');
  }

  @Get('/http')
  proxy() {
    return this.tools.proxyIds();
  }

  @Post('/city')
  async city(ctx: Context) {
    return this.tools.parseCity(await ctx.bodyJson());
  }
}
