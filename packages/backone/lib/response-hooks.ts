import type { Context } from './context';

type ResponseCallback = (response: Response) => void | Promise<void>;
const callbacks = new WeakMap<Context, ResponseCallback[]>();

/** Internal completion observers run only after successful HTTP serialization. */
export function onResponse(ctx: Context, callback: ResponseCallback): void {
  const pending = callbacks.get(ctx);
  if (pending === undefined) callbacks.set(ctx, [callback]);
  else pending.push(callback);
}

export function completeResponse(
  ctx: Context,
  response: Response
): Response | Promise<Response> {
  const pending = callbacks.get(ctx);
  if (pending === undefined) return response;
  callbacks.delete(ctx);
  return (async () => {
    for (const callback of pending) await callback(response);
    return response;
  })();
}
