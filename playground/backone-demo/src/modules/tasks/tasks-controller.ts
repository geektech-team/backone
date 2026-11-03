import type { Context } from '@geektech/backone';
import {
  Controller,
  Delete,
  Get,
  Post,
  Put,
} from '@geektech/backone/decorators';
import type { DemoDatabases } from '../../db';
import type { TasksService, TaskInput } from './tasks-service';

@Controller()
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly databases: DemoDatabases
  ) {}

  @Get('/tasks')
  list(ctx: Context) {
    const query = ctx.query.get('q') ?? undefined;
    const limit = Math.min(Number(ctx.query.get('limit') ?? '50') || 50, 200);
    return this.tasks.list(query, limit);
  }

  @Get('/tasks/:id')
  find(ctx: Context) {
    return this.tasks.find(Number(ctx.params.id));
  }

  @Post('/tasks')
  async create(ctx: Context) {
    return this.tasks.create(await ctx.bodyJson<TaskInput>());
  }

  @Put('/tasks/:id')
  async update(ctx: Context) {
    return this.tasks.update(
      Number(ctx.params.id),
      await ctx.bodyJson<TaskInput>()
    );
  }

  @Delete('/tasks/:id')
  remove(ctx: Context) {
    return this.tasks.remove(Number(ctx.params.id));
  }

  @Post('/tasks/batch')
  async batch(ctx: Context) {
    const body = await ctx.bodyJson<{ titles?: string[] }>();
    return this.tasks.batch(body.titles ?? []);
  }

  @Get('/audit')
  logs() {
    return this.tasks.logs();
  }

  @Get('/db')
  status() {
    return this.databases.status();
  }
}
