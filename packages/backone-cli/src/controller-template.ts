import { TEMPLATES } from './templates';
import type { TemplateFile } from './types';

const app = `import { createServer } from '@geektech/backone';
import { registerControllers } from '@geektech/backone/decorators';
import { UsersController } from './controllers/users-controller';
import { UsersService } from './services/users-service';

export function createApp() {
  const app = createServer({ port: 3000, development: true });
  app.useCors();
  app.useHelmet();
  app.usePrefix('/api', (api) => {
    registerControllers(api, [new UsersController(new UsersService())]);
  });
  return app;
}
`;

const index = `import { createApp } from './app';

const app = createApp();
const port = await app.listen();
console.log(\`Server running at http://127.0.0.1:\${port}\`);
`;

const controller = `import { HttpError, type Context } from '@geektech/backone';
import { Controller, Delete, Get, Post, Put, Use } from '@geektech/backone/decorators';
import { requestId } from '../middlewares/request-id';
import { UsersService, type UserInput } from '../services/users-service';

async function readUser(ctx: Context): Promise<UserInput> {
  const body = await ctx.bodyJson<unknown>();
  if (
    typeof body !== 'object' || body === null ||
    !('name' in body) || typeof body.name !== 'string' || !body.name.trim() ||
    !('email' in body) || typeof body.email !== 'string' || !body.email.trim()
  ) {
    throw new HttpError(400, 'name and email must be non-empty strings');
  }
  return { name: body.name.trim(), email: body.email.trim() };
}

@Controller('/users')
@Use(requestId)
export class UsersController {
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
    const user = this.users.create(await readUser(ctx));
    ctx.status = 201;
    return user;
  }

  @Put('/:id')
  async update(ctx: Context) {
    return this.users.update(ctx.params.id, await readUser(ctx));
  }

  @Delete('/:id')
  remove(ctx: Context) {
    this.users.remove(ctx.params.id);
    return ctx.noContent();
  }
}
`;

const service = `import { HttpError } from '@geektech/backone';

export interface UserInput {
  name: string;
  email: string;
}

export interface User extends UserInput {
  id: number;
}

/** 演示用内存存储，生产项目可在此接入数据库。 */
export class UsersService {
  private readonly users = new Map<number, User>([
    [1, { id: 1, name: 'Alice', email: 'alice@example.com' }],
    [2, { id: 2, name: 'Bob', email: 'bob@example.com' }],
  ]);
  private nextId = 3;

  list(): User[] {
    return [...this.users.values()];
  }

  find(id: string): User {
    const user = this.users.get(Number(id));
    if (!user) throw new HttpError(404, 'User not found');
    return user;
  }

  create(input: UserInput): User {
    const user = { id: this.nextId++, ...input };
    this.users.set(user.id, user);
    return user;
  }

  update(id: string, input: UserInput): User {
    const user = { ...this.find(id), ...input };
    this.users.set(user.id, user);
    return user;
  }

  remove(id: string): void {
    this.users.delete(this.find(id).id);
  }
}
`;

const middleware = `import type { Middleware } from '@geektech/backone';

export const requestId: Middleware = (ctx, next) => {
  ctx.set('x-request-id', crypto.randomUUID());
  return next();
};
`;

export function controllerRestTemplate(name: string): TemplateFile[] {
  const files = TEMPLATES['rest-api'](name)
    .map((file) => {
      if (file.path === 'tsconfig.json') {
        const config = JSON.parse(file.content) as {
          compilerOptions: Record<string, unknown>;
        };
        return {
          ...file,
          content: JSON.stringify(
            {
              ...config,
              compilerOptions: { ...config.compilerOptions, types: ['bun'] },
            },
            null,
            2
          ),
        };
      }
      if (file.path !== 'package.json') return file;
      const pkg = JSON.parse(file.content) as Record<string, unknown>;
      return {
        ...file,
        content: JSON.stringify(
          {
            ...pkg,
            engines: { bun: '>=1.3.10' },
            scripts: {
              dev: 'bun --watch src/index.ts',
              start: 'bun src/index.ts',
              typecheck: 'tsc --noEmit',
            },
            devDependencies: { '@types/bun': '^1.3.14', typescript: '^5.3.3' },
          },
          null,
          2
        ),
      };
    })
    .filter(
      (file) => file.path !== 'src/index.ts' && file.path !== 'README.md'
    );
  return [
    ...files,
    { path: 'src/index.ts', content: index },
    { path: 'src/app.ts', content: app },
    { path: 'src/controllers/users-controller.ts', content: controller },
    { path: 'src/services/users-service.ts', content: service },
    { path: 'src/middlewares/request-id.ts', content: middleware },
    {
      path: 'README.md',
      content: `# ${name}

Controller REST API with explicit service injection. Requires Bun >=1.3.10.

Run \`bun install\`, \`bun run typecheck\`, then \`bun run dev\`.

Endpoints: GET/POST /api/users and GET/PUT/DELETE /api/users/:id.
POST and PUT accept JSON with non-empty name and email strings.
Data is kept in memory and resets on restart.

Use standard decorators; leave experimentalDecorators and emitDecoratorMetadata disabled.
Controller instances and services are reused. Store request state in ctx.
The app factory in src/app.ts can be tested with app.handle(new Request(...)).
`,
    },
  ];
}
