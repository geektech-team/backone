import type { Context } from '../context';
import { serializeResponse } from '../response';
import { onResponse } from '../response-hooks';
import { policyDecorator } from './metadata';
import { isDefaultHeader, normalizeStatusResult } from './responses';
import { getRouteRuntime } from './runtime';

type MaybePromise<T> = T | Promise<T>;

/** 存储快照而非活的 Response；每次命中都重建独立响应。 */
export interface CachedResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: readonly (readonly [string, string])[];
  readonly body: Uint8Array | null;
}

export interface ResponseCacheStore {
  get(key: string): MaybePromise<CachedResponse | null | undefined>;
  /** 尽力写入；不等待异步完成，写入失败不改变业务响应。 */
  set(key: string, value: CachedResponse, ttlMs: number): unknown;
}

export interface CacheOptions {
  store: ResponseCacheStore;
  key(ctx: Context): MaybePromise<string>;
  scope: 'public' | ((ctx: Context) => MaybePromise<string>);
  ttlMs: number;
  maxBodyBytes?: number;
  snapshotTimeoutMs?: number;
}

const DEFAULT_MAX_BODY_BYTES = 1_048_576;
const DEFAULT_SNAPSHOT_TIMEOUT_MS = 100;

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`@Cache ${name} must be positive and finite`);
  }
}

function hasDirective(value: string | null, name: string): boolean {
  return (
    value?.split(',').some((directive) => {
      return directive.trim().split('=', 1)[0].toLowerCase() === name;
    }) ?? false
  );
}

function safeHeaders(headers: Headers, isPublic: boolean): boolean {
  const control = headers.get('cache-control');
  if (hasDirective(control, 'no-store')) return false;
  if (isPublic && hasDirective(control, 'private')) return false;
  if (headers.has('set-cookie')) return false;
  const contentType = headers.get('content-type')?.split(';', 1)[0];
  return contentType?.trim().toLowerCase() !== 'text/event-stream';
}

function canSnapshot(
  ctx: Context,
  response: Response,
  isPublic: boolean,
  maxBodyBytes: number
): boolean {
  if (!response.ok || response.bodyUsed) return false;
  for (const headers of [ctx.headers, response.headers]) {
    if (!safeHeaders(headers, isPublic)) return false;
  }
  const length = response.headers.get('content-length');
  return length === null || !(Number(length) > maxBodyBytes);
}

/** 仅取消克隆分支；等待 cancel 会被仍在使用的原响应分支阻塞。 */
async function snapshotBody(
  response: Response,
  maxBodyBytes: number,
  timeoutMs: number
): Promise<Uint8Array | null | undefined> {
  if (response.body === null) return null;
  let clone: ReturnType<Response['clone']>;
  try {
    clone = response.clone();
  } catch {
    return undefined;
  }
  if (clone.body === null) return null;
  const reader = clone.body.getReader();
  let completed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = performance.now() + timeoutMs;
  const read = async (): Promise<Uint8Array | undefined> => {
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (performance.now() < deadline) {
      const part = await reader.read();
      if (part.done) {
        completed = true;
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return bytes;
      }
      length += part.value.byteLength;
      if (length > maxBodyBytes) return undefined;
      chunks.push(part.value.slice());
    }
    return undefined;
  };
  try {
    return await Promise.race([
      read(),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeoutMs);
      }),
    ]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
    if (completed) {
      reader.releaseLock();
    } else {
      void reader.cancel().catch(() => undefined);
    }
  }
}

function restore(ctx: Context, snapshot: CachedResponse): Response {
  const headers = new Headers(
    snapshot.headers.map(([name, value]): [string, string] => [name, value])
  );
  for (const [name, value] of ctx.headers) {
    if (!isDefaultHeader(ctx, name) || !headers.has(name)) {
      headers.set(name, value);
    }
  }
  return new Response(snapshot.body?.slice() ?? null, {
    status: snapshot.status,
    statusText: snapshot.statusText,
    headers,
  });
}

export function Cache(options: CacheOptions) {
  if (
    typeof options?.store?.get !== 'function' ||
    typeof options.store.set !== 'function'
  ) {
    throw new Error('@Cache requires a store with get and set');
  }
  if (typeof options.key !== 'function') {
    throw new Error('@Cache requires an explicit key function');
  }
  if (options.scope !== 'public' && typeof options.scope !== 'function') {
    throw new Error('@Cache requires an explicit public or resolver scope');
  }
  assertPositive(options.ttlMs, 'ttlMs');
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const timeoutMs = options.snapshotTimeoutMs ?? DEFAULT_SNAPSHOT_TIMEOUT_MS;
  assertPositive(maxBodyBytes, 'maxBodyBytes');
  assertPositive(timeoutMs, 'snapshotTimeoutMs');
  const isPublic = options.scope === 'public';
  return policyDecorator({
    phase: 'cache',
    httpOnly: true,
    handler: async (ctx, next) => {
      if (
        ctx.method !== 'GET' ||
        hasDirective(ctx.getHeader('cache-control'), 'no-store') ||
        !safeHeaders(ctx.headers, isPublic)
      ) {
        return next();
      }
      const scope =
        typeof options.scope === 'function' ? await options.scope(ctx) : null;
      if (!isPublic && typeof scope !== 'string') {
        throw new Error('@Cache scope resolver must return a string');
      }
      const key = JSON.stringify([
        getRouteRuntime(ctx).namespace,
        isPublic ? 'public' : 'scoped',
        scope,
        await options.key(ctx),
      ]);
      const hit = await options.store.get(key);
      if (hit !== undefined && hit !== null) return restore(ctx, hit);
      const response = serializeResponse(
        ctx,
        normalizeStatusResult(ctx, await next())
      );
      if (!canSnapshot(ctx, response, isPublic, maxBodyBytes)) return response;
      const body = await snapshotBody(response, maxBodyBytes, timeoutMs);
      if (body !== undefined) {
        const snapshot: CachedResponse = {
          status: response.status,
          statusText: response.statusText,
          headers: [...response.headers],
          body,
        };
        onResponse(ctx, (finalResponse) => {
          if (
            !finalResponse.ok ||
            !safeHeaders(ctx.headers, isPublic) ||
            !safeHeaders(finalResponse.headers, isPublic)
          ) {
            return;
          }
          try {
            const written = options.store.set(key, snapshot, options.ttlMs);
            void Promise.resolve(written).catch(() => undefined);
          } catch {
            // 缓存写入失败不改变已经成功的业务响应。
          }
        });
      }
      return response;
    },
  });
}
