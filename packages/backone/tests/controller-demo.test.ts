import { describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { packageRoot } from './paths';

describe('Controller playground', () => {
  it('serves users with injected state and validates JSON requests', async () => {
    execFileSync(process.execPath, ['run', 'build'], {
      cwd: packageRoot,
      stdio: 'pipe',
    });
    const { createServer } = await import('@geektech/backone');
    const { registerControllerDemo } =
      await import('../../../playground/backone-demo/src/controller-demo');
    const app = createServer();
    registerControllerDemo(app);
    const response = await app.handle(
      new Request('http://localhost/controller-api/users')
    );
    expect(await response.json()).toEqual([{ id: 1, name: 'Alice' }]);
    expect(response.headers.get('x-request-id')).toBeTruthy();
    const created = await app.handle(
      new Request('http://localhost/controller-api/users', {
        method: 'POST',
        body: JSON.stringify({ name: 'Bob' }),
      })
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ id: 2, name: 'Bob' });
    expect(
      (
        await app.handle(
          new Request('http://localhost/controller-api/users/999')
        )
      ).status
    ).toBe(404);
    const tokenResponse = await app.handle(
      new Request('http://localhost/controller-api/session', { method: 'POST' })
    );
    const session = (await tokenResponse.json()) as { token: string };
    expect(
      (
        await app.handle(
          new Request('http://localhost/controller-api/policy/profile')
        )
      ).status
    ).toBe(401);
    const headers = { authorization: `Bearer ${session.token}` };
    const first = await app.handle(
      new Request('http://localhost/controller-api/policy/cached?q=demo', {
        headers,
      })
    );
    const second = await app.handle(
      new Request('http://localhost/controller-api/policy/cached?q=demo', {
        headers,
      })
    );
    expect(await first.json()).toEqual({
      user: 'demo-user',
      query: 'demo',
      calls: 1,
    });
    expect(await second.json()).toEqual({
      user: 'demo-user',
      query: 'demo',
      calls: 1,
    });
    expect(first.headers.get('x-request-id')).not.toBe(
      second.headers.get('x-request-id')
    );
  });
});
