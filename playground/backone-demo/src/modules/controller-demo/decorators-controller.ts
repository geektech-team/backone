import { type Context, type Middleware } from '@geektech/backone';
import { v } from '@geektech/backone-utils';
import {
  Authorize,
  Cache,
  Controller,
  Get,
  Header,
  Post,
  RateLimit,
  Status,
  Timeout,
  Use,
  Validate,
  getPrincipal,
  validatedBody,
  validatedQuery,
} from '@geektech/backone/decorators';
import type {
  ControllerPolicyService,
  DemoPrincipal,
} from './controller-policy-service';
import type { DemoUsersService } from './demo-users-service';
import { domainErrors } from '../../middlewares/domain-errors';

const requestId: Middleware = (ctx, next) => {
  ctx.set('x-request-id', crypto.randomUUID());
  return next();
};

const userSchema = {
  parse(input: unknown): { name: string } {
    const body = v.object({ name: v.string({ minLength: 1 }) }).parse(input);
    const name = body.name.trim();
    if (!name) throw new Error('name must be a non-empty string');
    return { name };
  },
};
const querySchema = v.object({ q: v.optional(v.string({ maxLength: 30 })) });

@Controller('/users')
@Use(domainErrors)
@Use(requestId)
@Header('x-example', 'system-decorators')
@Timeout(5000)
export class DemoUsersController {
  constructor(private readonly users: DemoUsersService) {}
  @Get()
  list() {
    return this.users.list();
  }
  @Get('/:id')
  detail(ctx: Context) {
    return this.users.find(ctx.params.id);
  }
  @Post()
  @Validate({ body: userSchema })
  @Status(201)
  create(ctx: Context) {
    return this.users.create(validatedBody(ctx, userSchema).name);
  }
}

@Controller('/session')
export class SessionController {
  constructor(private readonly policy: ControllerPolicyService) {}
  @Post()
  issue() {
    return this.policy.issue();
  }
}

/** 业务行为在顶层类中，下面的小工厂只绑定声明期策略所需的应用实例。 */
export class PolicyController {
  constructor(private readonly policy: ControllerPolicyService) {}
  @Get('/profile')
  profile(ctx: Context) {
    return getPrincipal<DemoPrincipal>(ctx);
  }
  cached(ctx: Context) {
    return this.policy.cached(
      getPrincipal<DemoPrincipal>(ctx).id,
      validatedQuery(ctx, querySchema).q ?? ''
    );
  }
}

export function bindPolicyController(
  policy: ControllerPolicyService
): PolicyController {
  @Controller('/policy')
  @Use(requestId)
  @Authorize({
    authenticate: (ctx) => {
      const header = ctx.getHeader('authorization');
      return policy.verify(
        header?.startsWith('Bearer ') ? header.slice(7) : null
      );
    },
    authorize: (principal) => principal.role === 'member',
  })
  @RateLimit(policy.limiter, {
    key: (ctx) => `http:${getPrincipal<DemoPrincipal>(ctx).id}`,
  })
  @Timeout(5000)
  class BoundPolicyController extends PolicyController {
    @Get('/cached')
    @Validate({ query: querySchema })
    @Header('cache-control', 'private, max-age=2')
    @Cache({
      store: policy.cache,
      ttlMs: 2000,
      key: (ctx) => validatedQuery(ctx, querySchema).q ?? '',
      scope: (ctx) => getPrincipal<DemoPrincipal>(ctx).id,
    })
    override cached(ctx: Context) {
      return super.cached(ctx);
    }
  }
  return new BoundPolicyController(policy);
}
