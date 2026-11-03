import type { TemplateFile } from './types';
import { lifecycleFields, lifecycleMethods } from './template-common';

const app = `import { BackOneServer, type AppOptions } from '@geektech/backone';
import { Database } from '@geektech/backone-utils';
import { registerModules } from '@geektech/backone/decorators';
import { UsersModule } from './modules/users/users-module';

export interface ApplicationOptions extends AppOptions {
  /** SQLite filename or :memory:. */
  databaseUrl?: string;
}

export class Application {
  readonly server: BackOneServer;
  readonly database: Database;
  private readonly users: UsersModule;
${lifecycleFields}
  constructor(options: ApplicationOptions = {}) {
    const { databaseUrl = process.env.DATABASE_URL ?? ':memory:', ...serverOptions } = options;
    this.server = new BackOneServer({ port: 3000, development: true, ...serverOptions });
    this.database = new Database({ url: databaseUrl, dialect: 'sqlite' });
    this.users = new UsersModule(this.database);
    this.server.useCors();
    this.server.useHelmet();
    registerModules(this.server, [this.users]);
  }

${lifecycleMethods}
  private initializeResources(): Promise<void> {
    return this.users.initialize();
  }

  private dispose(): Promise<void> {
    return this.disposing ??= (async () => {
      try {
        await this.server.close();
      } finally {
        await this.database.close();
      }
    })();
  }
}
`;

const model = `export interface UserInput {
  name: string;
  email: string;
}

export interface User extends UserInput {
  id: number;
}

export class UserNotFoundError extends Error {
  constructor() {
    super('User not found');
    this.name = 'UserNotFoundError';
  }
}
`;

const repository = `import { Database, type Table } from '@geektech/backone-utils';
import type { User, UserInput } from './user';

/** Borrows a database owned by Application; never closes it. */
export class UsersRepository {
  private readonly users: Table<User>;

  constructor(private readonly database: Database) {
    this.users = database.table<User>('users');
  }

  async initialize(): Promise<void> {
    await this.database.raw(\`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL
    )\`);
    await this.database.transaction(async (tx) => {
      const users = new UsersRepository(tx);
      if ((await users.users.count()) === 0) {
        await users.users.insertMany([
          { name: 'Alice', email: 'alice@example.com' },
          { name: 'Bob', email: 'bob@example.com' },
        ]);
      }
    });
  }

  list(): Promise<User[]> {
    return this.users.findMany({ orderBy: { id: 'asc' } });
  }

  find(id: number): Promise<User | null> {
    return this.users.findById(id);
  }

  create(input: UserInput): Promise<User | null> {
    return this.users.insert(input);
  }

  async update(id: number, input: UserInput): Promise<User | null> {
    const result = await this.users.update(input, { id });
    return result.rows[0] ?? null;
  }

  async remove(id: number): Promise<boolean> {
    return (await this.users.delete({ id })).count > 0;
  }
}
`;

const service = `import { UserNotFoundError, type User, type UserInput } from './user';
import { UsersRepository } from './users-repository';

export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  list(): Promise<User[]> {
    return this.users.list();
  }

  async find(id: number): Promise<User> {
    const user = await this.users.find(id);
    if (!user) throw new UserNotFoundError();
    return user;
  }

  async create(input: UserInput): Promise<User> {
    const user = await this.users.create(input);
    if (!user) throw new Error('User creation returned no row');
    return user;
  }

  async update(id: number, input: UserInput): Promise<User> {
    const user = await this.users.update(id, input);
    if (!user) throw new UserNotFoundError();
    return user;
  }

  async remove(id: number): Promise<void> {
    if (!(await this.users.remove(id))) throw new UserNotFoundError();
  }
}
`;

const controller = `import { HttpError, type Context } from '@geektech/backone';
import {
  Controller, Delete, Get, Post, Put, Use,
  Header, Status, Timeout, Validate, validatedBody, validatedParams,
} from '@geektech/backone/decorators';
import { requestId } from '../../middlewares/request-id';
import { UsersService } from './users-service';
import { UserNotFoundError } from './user';
import { userSchema, userIdSchema } from './user-schema';

@Controller('/users')
@Use(requestId)
@Header('x-controller-style', 'system')
@Timeout(5000)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Get('/:id')
  @Validate({ params: userIdSchema })
  detail(ctx: Context) {
    return this.mapErrors(this.users.find(validatedParams(ctx, userIdSchema).id));
  }

  @Post()
  @Validate({ body: userSchema })
  @Status(201)
  create(ctx: Context) {
    return this.users.create(validatedBody(ctx, userSchema));
  }

  @Put('/:id')
  @Validate({ params: userIdSchema, body: userSchema })
  update(ctx: Context) {
    return this.mapErrors(this.users.update(
      validatedParams(ctx, userIdSchema).id,
      validatedBody(ctx, userSchema)
    ));
  }

  @Delete('/:id')
  @Validate({ params: userIdSchema })
  @Status(204)
  remove(ctx: Context) {
    return this.mapErrors(this.users.remove(validatedParams(ctx, userIdSchema).id));
  }

  private async mapErrors<T>(result: Promise<T>): Promise<T> {
    try {
      return await result;
    } catch (error) {
      if (error instanceof UserNotFoundError) throw new HttpError(404, error.message);
      throw error;
    }
  }
}
`;

const schema = `import type { UserInput } from './user';

// Structural schemas can be replaced with backone-utils v schemas.
export const userSchema = {
  parse(body: unknown): UserInput {
    if (
      typeof body !== 'object' || body === null ||
      !('name' in body) || typeof body.name !== 'string' || !body.name.trim() ||
      !('email' in body) || typeof body.email !== 'string' || !body.email.trim()
    ) throw new Error('name and email must be non-empty strings');
    return { name: body.name.trim(), email: body.email.trim() };
  },
};

export const userIdSchema = {
  parse(params: unknown): { id: number } {
    if (typeof params !== 'object' || params === null || !('id' in params) ||
      typeof params.id !== 'string' || !/^[1-9]\\d*$/.test(params.id) ||
      !Number.isSafeInteger(Number(params.id))) {
      throw new Error('id must be a positive safe integer');
    }
    return { id: Number(params.id) };
  },
};
`;

const middleware = `import type { Middleware } from '@geektech/backone';

export const requestId: Middleware = (ctx, next) => {
  ctx.set('x-request-id', crypto.randomUUID());
  return next();
};
`;

const usersModule = `import type { Database } from '@geektech/backone-utils';
import { Module } from '@geektech/backone/decorators';
import { UsersController } from './users-controller';
import { UsersService } from './users-service';
import { UsersRepository } from './users-repository';

@Module<UsersModule>({
  prefix: '/api',
  controllers: (module) => [module.controller],
})
export class UsersModule {
  readonly controller: UsersController;
  private readonly users: UsersRepository;

  constructor(database: Database) {
    this.users = new UsersRepository(database);
    this.controller = new UsersController(new UsersService(this.users));
  }

  /** Explicit initialization; Application owns and closes the borrowed database. */
  initialize(): Promise<void> {
    return this.users.initialize();
  }
}
`;

export function restFiles(): TemplateFile[] {
  return [
    { path: 'src/app.ts', content: app },
    { path: 'src/modules/users/users-module.ts', content: usersModule },
    { path: 'src/modules/users/user.ts', content: model },
    { path: 'src/modules/users/users-controller.ts', content: controller },
    { path: 'src/modules/users/users-service.ts', content: service },
    { path: 'src/modules/users/users-repository.ts', content: repository },
    { path: 'src/modules/users/user-schema.ts', content: schema },
    { path: 'src/middlewares/request-id.ts', content: middleware },
  ];
}
