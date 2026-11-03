import type { BackOneServer } from '../server';
import type { Handler } from '../types';
import type { WebSocketHandler } from '../websocket';
import { classMetadata, findClassMetadata, methodMetadata } from './metadata';
import type { SystemPolicy, WebSocketEvent } from './metadata';
import { compilePolicies } from './register';

/** 本次注册的网关；path 包含 app 当前前缀。 */
export interface WebSocketGateway {
  readonly path: string;
  readonly gateway: string;
  readonly events: readonly {
    readonly event: WebSocketEvent;
    readonly handler: string;
  }[];
}

/** 声明精确匹配路径的 WebSocket 网关。 */
export function WebSocket(path: string) {
  return (target: object, context: ClassDecoratorContext): void => {
    if (context?.kind !== 'class') {
      throw new Error('BackOne requires standard decorators');
    }
    const metadata = classMetadata(target, context);
    if (metadata.webSocket !== undefined) {
      throw new Error('A class may only declare @WebSocket once');
    }
    metadata.webSocket = path;
  };
}

function eventDecorator(event: WebSocketEvent) {
  return () =>
    (target: object, context: ClassMethodDecoratorContext): void => {
      if (context?.kind !== 'method') {
        throw new Error('BackOne requires standard decorators');
      }
      if (context.static || context.private) {
        throw new Error('WebSocket events require a public instance method');
      }
      methodMetadata(target, context).events.unshift(event);
    };
}

export const OnOpen = eventDecorator('open');
export const OnMessage = eventDecorator('message');
export const OnClose = eventDecorator('close');
export const OnDrain = eventDecorator('drain');

interface PendingGateway {
  description: WebSocketGateway;
  relativePath: string;
  handler: WebSocketHandler;
  middlewares: Handler[];
}

function exactPath(...paths: string[]): string {
  const segments = paths.flatMap((path) => {
    if (typeof path !== 'string' || /[?#]/.test(path)) {
      throw new Error('WebSocket paths must be strings without ? or #');
    }
    return path.split('/').filter(Boolean);
  });
  if (
    segments.some((segment) => segment.startsWith(':') || segment.includes('*'))
  ) {
    throw new Error(
      'WebSocket paths must be exact without parameters or wildcards'
    );
  }
  return `/${segments.join('/')}`;
}

function collect(
  instance: object,
  appPrefix: string,
  prefix = ''
): PendingGateway {
  const prototypes: object[] = [];
  for (
    let current: object | null = Object.getPrototypeOf(instance);
    current !== null && current !== Object.prototype;
    current = Object.getPrototypeOf(current)
  ) {
    prototypes.push(current);
  }
  const constructor: unknown = prototypes[0]
    ? Object.getOwnPropertyDescriptor(prototypes[0], 'constructor')?.value
    : undefined;
  const metadata =
    typeof constructor === 'function'
      ? findClassMetadata(constructor)
      : undefined;
  if (metadata?.webSocket === undefined) {
    throw new Error('Each registered instance must have its own @WebSocket');
  }

  const middlewares: Handler[] = [];
  const policies: SystemPolicy[] = [];
  for (const prototype of [...prototypes].reverse()) {
    const owner: unknown = Object.getOwnPropertyDescriptor(
      prototype,
      'constructor'
    )?.value;
    if (typeof owner !== 'function') continue;
    const definition = findClassMetadata(owner);
    middlewares.push(...(definition?.middlewares ?? []));
    policies.push(...(definition?.policies ?? []));
  }
  if (policies.some((policy) => policy.httpOnly)) {
    throw new Error('HTTP-only policies cannot be used on a WebSocket gateway');
  }

  type Callback = (...args: unknown[]) => unknown;
  const callbacks: Partial<Record<WebSocketEvent, Callback>> = {};
  const events: { event: WebSocketEvent; handler: string }[] = [];
  const seen = new Set<PropertyKey>();
  for (const prototype of prototypes) {
    const owner: unknown = Object.getOwnPropertyDescriptor(
      prototype,
      'constructor'
    )?.value;
    if (typeof owner !== 'function') continue;
    const definition = findClassMetadata(owner);
    for (const name of Reflect.ownKeys(prototype)) {
      if (name === 'constructor' || seen.has(name)) continue;
      seen.add(name);
      const method = definition?.methods.get(name);
      if (method === undefined || method.events.length === 0) continue;
      if (method.routes.length > 0) {
        throw new Error('WebSocket event callbacks cannot declare HTTP routes');
      }
      if (method.middlewares.length > 0 || method.policies.length > 0) {
        throw new Error(
          'WebSocket event callbacks cannot declare middleware or policies'
        );
      }
      const own = Object.getOwnPropertyDescriptor(instance, name);
      const resolved: unknown = (
        own ?? Object.getOwnPropertyDescriptor(prototype, name)
      )?.value;
      if (typeof resolved !== 'function') continue;
      for (const event of method.events) {
        if (callbacks[event] !== undefined) {
          throw new Error(`Duplicate WebSocket event callback: ${event}`);
        }
        callbacks[event] = (resolved as Callback).bind(instance);
        events.push(Object.freeze({ event, handler: String(name) }));
      }
    }
  }

  const relativePath = exactPath(prefix, metadata.webSocket);
  return {
    relativePath,
    description: Object.freeze({
      path: exactPath(appPrefix, relativePath),
      gateway: typeof constructor === 'function' ? constructor.name : '',
      events: Object.freeze(events),
    }),
    handler: {
      open: callbacks.open,
      message: callbacks.message,
      close: callbacks.close,
      drain: callbacks.drain,
    },
    middlewares: [...middlewares, ...compilePolicies(policies)],
  };
}

/** 先校验整批声明，再显式挂载网关实例。 */
export interface GatewayBinding {
  readonly instance: object;
  readonly prefix?: string;
}

/** Internal preflight shared with module registration; does not mutate app. */
export function prepareWebSockets(
  app: BackOneServer,
  bindings: readonly GatewayBinding[]
): () => readonly WebSocketGateway[] {
  const pending = bindings.map(({ instance, prefix }) =>
    collect(instance, app.prefix, prefix)
  );
  const paths = new Set<string>();
  for (const gateway of pending) {
    const { path } = gateway.description;
    if (paths.has(path) || app.hasWebSocket(gateway.relativePath)) {
      throw new Error(`Duplicate WebSocket gateway: ${path}`);
    }
    paths.add(path);
  }
  return () => {
    for (const gateway of pending) {
      app.ws(gateway.relativePath, gateway.handler, {
        middlewares: gateway.middlewares,
      });
    }
    return Object.freeze(pending.map((gateway) => gateway.description));
  };
}

export function registerWebSockets(
  app: BackOneServer,
  gateways: readonly object[]
): readonly WebSocketGateway[] {
  return prepareWebSockets(
    app,
    gateways.map((instance) => ({ instance }))
  )();
}
