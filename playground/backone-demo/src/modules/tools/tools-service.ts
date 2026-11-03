import { DemoError } from '../../errors';
import {
  createId,
  defineConfig,
  FixedWindowLimiter,
  HttpClient,
  Jwt,
  LruCache,
  v,
} from '@geektech/backone-utils';

export const citySchema = v.object({
  name: v.string({ minLength: 1, maxLength: 20 }),
  population: v.number({ min: 0, integer: true }),
  score: v.optional(v.number({ min: 0, max: 100 })),
  tags: v.array(v.string()),
});

export class ToolsService {
  private readonly scores = new LruCache<number>({
    ttlMs: 5000,
    capacity: 100,
  });
  private readonly limiter = new FixedWindowLimiter({
    limit: 5,
    windowMs: 10_000,
  });
  private readonly config = defineConfig(
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
  private readonly jwt = new Jwt({ secret: this.config.jwtSecret });

  constructor(private readonly origin: () => string) {}

  ids() {
    return {
      uuidv7: createId(),
      nanoid: createId('nanoid', { length: 12 }),
      snowflake: createId('snowflake'),
    };
  }

  configuration() {
    return {
      prefix: 'BACKONE_DEMO_',
      debug: this.config.debug,
      jwtSecretMasked: `${this.config.jwtSecret.slice(0, 3)}***`,
      adminToken: this.config.adminToken === undefined ? 'unset' : 'set',
      frozen: Object.isFrozen(this.config),
    };
  }

  async rank(city: string) {
    const cached = this.scores.has(`rank:${city}`);
    const score = await this.scores.getOrSet(`rank:${city}`, () =>
      Promise.resolve(Math.floor(Math.random() * 100))
    );
    return { city, score, cached };
  }

  async issueToken(role = 'user') {
    return {
      token: await this.jwt.sign(
        { iss: 'backone-demo', sub: 'demo-user', role },
        { expiresIn: 3600 }
      ),
      expiresIn: 3600,
    };
  }

  async verifyToken(token?: string) {
    if (token === undefined)
      throw new DemoError('UNAUTHENTICATED', 'Missing Bearer token');
    try {
      return await this.jwt.verify(token, { issuer: 'backone-demo' });
    } catch {
      throw new DemoError('UNAUTHENTICATED', 'Invalid or expired token');
    }
  }

  limited(key: string) {
    const result = this.limiter.consume(key);
    if (!result.allowed)
      throw new DemoError(
        'RATE_LIMITED',
        `rate limited, retry after ${result.resetAt}`
      );
    return { ok: true, remaining: result.remaining };
  }

  async proxyIds() {
    const client = new HttpClient({ baseUrl: this.origin(), timeoutMs: 2000 });
    const { data } = await client.get<{ uuidv7: string; nanoid: string }>(
      '/api/tools/ids'
    );
    return { proxied: data };
  }

  parseCity(input: unknown) {
    const result = citySchema.safeParse(input);
    if (!result.success) {
      throw new DemoError(
        'INVALID_INPUT',
        `invalid body: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`
      );
    }
    return result.data;
  }
}
