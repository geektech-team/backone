import {
  HttpError,
  type BackOneServer,
  type Context,
  type Middleware,
} from '@geektech/backone';
import {
  Controller,
  Get,
  Post,
  Use,
  registerControllers,
} from '@geektech/backone/decorators';

interface DemoUser {
  id: number;
  name: string;
}

class UsersService {
  private readonly users: DemoUser[] = [{ id: 1, name: 'Alice' }];

  list(): DemoUser[] {
    return this.users;
  }

  find(id: string): DemoUser {
    const user = this.users.find((item) => item.id === Number(id));
    if (!user) throw new HttpError(404, 'User not found');
    return user;
  }

  create(name: string): DemoUser {
    const user = { id: this.users.length + 1, name };
    this.users.push(user);
    return user;
  }
}

const requestId: Middleware = (ctx, next) => {
  ctx.set('x-request-id', crypto.randomUUID());
  return next();
};

@Controller('/users')
@Use(requestId)
class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Get('/:id')
  detail(ctx: Context) {
    return this.users.find(ctx.params.id);
  }

  @Post()
  async create(ctx: Context) {
    const body = await ctx.bodyJson<unknown>();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('name' in body) ||
      typeof body.name !== 'string' ||
      !body.name.trim()
    ) {
      throw new HttpError(400, 'name must be a non-empty string');
    }
    ctx.status = 201;
    return this.users.create(body.name.trim());
  }
}

export function registerControllerDemo(app: BackOneServer): void {
  app.usePrefix('/controller-api', (api) => {
    registerControllers(api, [new UsersController(new UsersService())]);
  });
}
