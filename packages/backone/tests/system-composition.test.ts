import { describe, expect, it } from 'bun:test';
import { createServer, HttpError } from '../lib/index';
import { Controller, Get, Use, registerControllers } from '../lib/decorators';
import { policyDecorator } from '../lib/decorators/metadata';

function Wrapped<This, Args extends unknown[], Result>(
  value: (this: This, ...args: Args) => Result
) {
  return function (this: This, ...args: Args) {
    return value.apply(this, args);
  };
}

describe('system decorator composition', () => {
  it('preserves declarations around wrapping method decorators in either order', async () => {
    @Controller('/wrapped')
    class WrappedController {
      @Wrapped
      @Get('/outer')
      outer() {
        return 'outer';
      }

      @Get('/inner')
      @Wrapped
      inner() {
        return 'inner';
      }

      @Wrapped
      @Use((_ctx, next) => next())
      @Get('/middleware')
      middleware() {
        return 'middleware';
      }
    }
    const app = createServer();
    expect(registerControllers(app, [new WrappedController()])).toHaveLength(3);
    for (const name of ['outer', 'inner', 'middleware']) {
      const response = await app.handle(
        new Request(`http://localhost/wrapped/${name}`)
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(name);
    }
  });

  it('runs authorization before cache regardless of written decorator order', async () => {
    @Controller('/guard')
    @policyDecorator({ phase: 'cache', handler: () => ({ cached: true }) })
    @policyDecorator({
      phase: 'authorize',
      handler: () => {
        throw new HttpError(401);
      },
    })
    class Guarded {
      @Get() get() {
        return { cached: false };
      }
    }
    const app = createServer();
    registerControllers(app, [new Guarded()]);
    expect(
      (await app.handle(new Request('http://localhost/guard'))).status
    ).toBe(401);
  });
});
