import type { BackOneServer } from '../server';
import type { Handler, RouteMethod } from '../types';
import { findClassMetadata, findMethodMetadata } from './metadata';

/** 本次注册的路由描述；path 包含 app 的当前前缀。 */
export interface ControllerRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly controller: string;
  readonly handler: string;
}

interface PendingRoute {
  description: ControllerRoute;
  relativePath: string;
  handlers: Handler[];
  key: string;
}

interface Registration {
  keys: Set<string>;
  parameters: Map<string, string>;
}

const registered = new WeakMap<BackOneServer, Registration>();

function joinPaths(...paths: string[]): string {
  const segments = paths.flatMap((path) => {
    if (typeof path !== 'string' || /[?#]/.test(path)) {
      throw new Error('Controller route paths must be strings without ? or #');
    }
    return path.split('/').filter(Boolean);
  });
  for (const [index, segment] of segments.entries()) {
    if (segment === ':' || (segment === '*' && index !== segments.length - 1)) {
      throw new Error(`Invalid Controller route path: /${segments.join('/')}`);
    }
  }
  return `/${segments.join('/')}`;
}

/** 路由树按段匹配，动态参数名和多余斜线不产生新路由。 */
function routeKey(method: RouteMethod, path: string): string {
  return `${method} ${path
    .split('/')
    .map((segment) => (segment.startsWith(':') ? ':' : segment))
    .join('/')}`;
}

function collect(instance: object, appPrefix: string): PendingRoute[] {
  const prototype: object | null = Object.getPrototypeOf(instance);
  const constructor: unknown = prototype
    ? Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value
    : undefined;
  const metadata =
    typeof constructor === 'function'
      ? findClassMetadata(constructor)
      : undefined;
  if (metadata?.prefix === undefined) {
    throw new Error('Each registered instance must have its own @Controller');
  }

  const prototypes: object[] = [];
  for (
    let current = prototype;
    current !== null && current !== Object.prototype;
    current = Object.getPrototypeOf(current)
  ) {
    prototypes.push(current);
  }
  const middlewares: Handler[] = [];
  for (const current of [...prototypes].reverse()) {
    const owner: unknown = Object.getOwnPropertyDescriptor(
      current,
      'constructor'
    )?.value;
    if (typeof owner === 'function') {
      middlewares.push(...(findClassMetadata(owner)?.middlewares ?? []));
    }
  }

  const routes: PendingRoute[] = [];
  const seen = new Set<PropertyKey>();
  for (const current of prototypes) {
    for (const name of Reflect.ownKeys(current)) {
      if (name === 'constructor' || seen.has(name)) continue;
      seen.add(name);
      const value: unknown = Object.getOwnPropertyDescriptor(
        current,
        name
      )?.value;
      if (typeof value !== 'function') continue;
      const method = findMethodMetadata(value);
      if (method === undefined || method.routes.length === 0) continue;
      const own = Object.getOwnPropertyDescriptor(instance, name);
      const resolved: unknown = own === undefined ? value : own.value;
      if (typeof resolved !== 'function') continue;
      const handler = (resolved as Handler).bind(instance);
      for (const route of method.routes) {
        const relativePath = joinPaths(metadata.prefix, route.path);
        const path = joinPaths(appPrefix, relativePath);
        routes.push({
          description: Object.freeze({
            method: route.method,
            path,
            controller:
              typeof constructor === 'function' ? constructor.name : '',
            handler: String(name),
          }),
          relativePath,
          handlers: [...middlewares, ...method.middlewares, handler],
          key: routeKey(route.method, path),
        });
      }
    }
  }
  return routes;
}

/**
 * 显式注册 Controller 实例。先校验整批声明，再写入现有路由表。
 * 重复检测覆盖本入口在同一 app 中注册的路由。
 */
export function registerControllers(
  app: BackOneServer,
  controllers: readonly object[]
): readonly ControllerRoute[] {
  const previous = registered.get(app);
  const keys = new Set(previous?.keys);
  const parameters = new Map(previous?.parameters);
  const pending = controllers.flatMap((controller) =>
    collect(controller, app.prefix)
  );
  for (const route of pending) {
    if (keys.has(route.key)) {
      throw new Error(
        `Duplicate Controller route: ${route.description.method} ${route.description.path}`
      );
    }
    keys.add(route.key);
    const segments: string[] = [];
    for (const segment of route.description.path.split('/').filter(Boolean)) {
      const parameter = segment.startsWith(':');
      segments.push(parameter ? ':' : segment);
      if (!parameter) continue;
      const location = segments.join('/');
      const previousName = parameters.get(location);
      if (previousName !== undefined && previousName !== segment) {
        throw new Error(
          `Conflicting parameter names ${previousName} and ${segment} at /${location}`
        );
      }
      parameters.set(location, segment);
    }
  }
  for (const route of pending) {
    app.add(route.description.method, route.relativePath, route.handlers);
  }
  registered.set(app, { keys, parameters });
  return Object.freeze(pending.map((route) => route.description));
}
