import type { Context } from '../context';
import { getStatusVersion } from '../context';
import { timeout } from '../middleware/timeout';
import type { TimeoutOptions } from '../middleware/timeout';
import { serializeResponse } from '../response';
import type { Handler } from '../types';
import { policyDecorator } from './metadata';
import type { SystemDecorator } from './metadata';

const statusDefaults = new WeakMap<
  Context,
  { value: number; version: number }
>();
const statusPolicies = new WeakSet<Context>();
const headerPolicies = new WeakSet<Context>();
const headerDefaults = new WeakMap<Context, Map<string, string>>();
const BODYLESS_STATUSES = new Set([204, 205, 304]);

/** @internal 缓存仅覆盖当前请求的显式头部，不覆盖已缓存的业务头部。 */
export function isDefaultHeader(ctx: Context, name: string): boolean {
  const value = headerDefaults.get(ctx)?.get(name.toLowerCase());
  return value !== undefined && ctx.headers.get(name) === value;
}

/** @internal 在缓存序列化之前处理默认状态与无内容返回值。 */
export function normalizeStatusResult(ctx: Context, value: unknown): unknown {
  if (
    !(value instanceof Response) &&
    (BODYLESS_STATUSES.has(ctx.status) ||
      (statusPolicies.has(ctx) && (value === undefined || value === null)))
  ) {
    return new Response(null, { status: ctx.status, headers: ctx.headers });
  }
  const contentType = headerPolicies.has(ctx)
    ? ctx.headers.get('content-type')
    : null;
  if (!(value instanceof Response) && contentType !== null) {
    const response = serializeResponse(ctx, value);
    const headers = new Headers(response.headers);
    headers.set('content-type', contentType);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  return value;
}

/** 声明默认状态；业务显式设置的状态或 Response 始终优先。 */
export function Status(code: number): SystemDecorator {
  if (!Number.isInteger(code) || code < 200 || code > 599) {
    throw new Error('@Status requires an integer status code from 200 to 599');
  }
  const handler: Handler = async (ctx, next) => {
    statusPolicies.add(ctx);
    const previous = statusDefaults.get(ctx);
    const version = getStatusVersion(ctx);
    if (
      version === 0 ||
      (version === previous?.version && ctx.status === previous.value)
    ) {
      ctx.status = code;
      statusDefaults.set(ctx, { value: code, version: getStatusVersion(ctx) });
    }
    return normalizeStatusResult(ctx, await next());
  };
  return policyDecorator({ phase: 'response', handler, httpOnly: true });
}

/** 提前声明缺省头部供缓存策略检查；业务响应与方法默认值优先。 */
export function Header(name: string, value: string): SystemDecorator {
  const declared = new Headers();
  declared.set(name, value);
  const normalizedName = name.toLowerCase();
  const normalizedValue = declared.get(name) as string;
  const handler: Handler = async (ctx, next) => {
    headerPolicies.add(ctx);
    if (!ctx.headers.has(name) || isDefaultHeader(ctx, name)) {
      ctx.headers.set(name, normalizedValue);
      let defaults = headerDefaults.get(ctx);
      if (defaults === undefined) {
        defaults = new Map();
        headerDefaults.set(ctx, defaults);
      }
      defaults.set(normalizedName, normalizedValue);
    }
    const result = normalizeStatusResult(ctx, await next());
    if (result instanceof Response) {
      if (result.headers.has(name)) return result;
      const headers = new Headers(result.headers);
      headers.set(name, ctx.headers.get(name) ?? normalizedValue);
      return new Response(result.body, {
        status: result.status,
        statusText: result.statusText,
        headers,
      });
    }
    return result;
  };
  return policyDecorator({ phase: 'response', handler, httpOnly: true });
}

/** 复用原生超时中间件；响应超时后业务仍会继续执行。 */
export function Timeout(
  options: TimeoutOptions | number = {}
): SystemDecorator {
  const ms = typeof options === 'number' ? options : (options.ms ?? 5000);
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error('@Timeout requires a positive finite millisecond budget');
  }
  return policyDecorator({ phase: 'timeout', handler: timeout(options) });
}
