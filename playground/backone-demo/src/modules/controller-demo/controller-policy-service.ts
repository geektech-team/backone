import { FixedWindowLimiter, Jwt, LruCache } from '@geektech/backone-utils';
import type { CachedResponse } from '@geektech/backone/decorators';

export interface DemoPrincipal {
  id: string;
  role: string;
}

/** All policy backends are app-owned; these credentials are demonstration only. */
export class ControllerPolicyService {
  readonly limiter = new FixedWindowLimiter({ limit: 10, windowMs: 10_000 });
  readonly cache = new LruCache<CachedResponse>({ ttlMs: 2000, capacity: 100 });
  private readonly jwt = new Jwt({ secret: 'backone-controller-demo-secret' });
  private calls = 0;

  async issue() {
    return {
      token: await this.jwt.sign(
        { iss: 'controller-demo', sub: 'demo-user', role: 'member' },
        { expiresIn: 60 }
      ),
      expiresIn: 60,
    };
  }

  async verify(token: string | null): Promise<DemoPrincipal | null> {
    if (!token) return null;
    const payload = await this.jwt.verify(token, { issuer: 'controller-demo' });
    if (typeof payload.sub !== 'string' || typeof payload.role !== 'string')
      return null;
    return { id: payload.sub, role: payload.role };
  }

  cached(user: string, query: string) {
    return { user, query, calls: ++this.calls };
  }
}
