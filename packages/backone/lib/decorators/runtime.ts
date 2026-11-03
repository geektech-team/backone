import type { Context } from '../context';
import type { RouteMethod } from '../types';

const appIds = new WeakMap<object, string>();
const routes = new WeakMap<Context, { namespace: string }>();

export function setRouteRuntime(
  ctx: Context,
  app: object,
  method: RouteMethod,
  path: string
): void {
  let id = appIds.get(app);
  if (id === undefined) {
    id = crypto.randomUUID();
    appIds.set(app, id);
  }
  routes.set(ctx, { namespace: JSON.stringify(['backone', id, method, path]) });
}

export function getRouteRuntime(ctx: Context): { namespace: string } {
  const runtime = routes.get(ctx);
  if (runtime === undefined)
    throw new Error('System policy requires a registered Controller route');
  return runtime;
}
