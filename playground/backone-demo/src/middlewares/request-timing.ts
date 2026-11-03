import type { Middleware } from '@geektech/backone';

export const requestTiming: Middleware = async (ctx, next) => {
  const start = performance.now();
  ctx.state.requestId = crypto.randomUUID();
  const response = await next();
  const timing = `${(performance.now() - start).toFixed(2)}ms`;
  ctx.set('x-server-timing', timing);
  ctx.set('x-request-id', String(ctx.state.requestId));
  if (response instanceof Response) {
    response.headers.set('x-server-timing', timing);
    response.headers.set('x-request-id', String(ctx.state.requestId));
  }
  return response;
};
