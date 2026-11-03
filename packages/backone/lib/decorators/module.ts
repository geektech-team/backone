import type { BackOneServer } from '../server';
import { classMetadata, findClassMetadata } from './metadata';
import {
  prepareControllers,
  type ControllerBinding,
  type ControllerRoute,
} from './register';
import {
  prepareWebSockets,
  type GatewayBinding,
  type WebSocketGateway,
} from './websocket';

/** Select already constructed objects from this particular module instance. */
export interface ModuleOptions<T extends object = object> {
  readonly prefix?: string;
  readonly imports?: (module: T) => readonly object[];
  readonly controllers?: (module: T) => readonly object[];
  readonly gateways?: (module: T) => readonly object[];
}

export interface ModuleDescription {
  readonly name: string;
  /** Full mount prefix, including the application's prefix; root is ''. */
  readonly prefix: string;
}

export interface ModuleRegistration {
  readonly modules: readonly ModuleDescription[];
  readonly routes: readonly ControllerRoute[];
  readonly gateways: readonly WebSocketGateway[];
}

function joinPrefix(...paths: string[]): string {
  const segments = paths.flatMap((path) => path.split('/').filter(Boolean));
  return segments.length ? `/${segments.join('/')}` : '';
}

function members(value: unknown, name: string): readonly object[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Module ${name} selector must return an array of instances`
    );
  }
  for (const member of value) {
    if (typeof member !== 'object' || member === null) {
      throw new Error(`Module ${name} must contain object instances`);
    }
  }
  return [...value];
}

/** Declare a business boundary without creating or resolving dependencies. */
export function Module<T extends object = object>(
  options: ModuleOptions<T> = {}
) {
  const { prefix = '', imports, controllers, gateways } = options;
  if (typeof prefix !== 'string' || /[?#:*]/.test(prefix)) {
    throw new Error('Module prefix must be a static path without ?, #, : or *');
  }
  for (const selector of [imports, controllers, gateways]) {
    if (selector !== undefined && typeof selector !== 'function') {
      throw new Error('Module selectors must be functions');
    }
  }
  return (
    target: abstract new (...args: never[]) => T,
    context: ClassDecoratorContext
  ): void => {
    const metadata = classMetadata(target, context);
    if (metadata.module !== undefined)
      throw new Error('A class may only declare @Module once');
    metadata.module = Object.freeze({
      prefix: joinPrefix(prefix),
      imports: (instance: object) =>
        imports === undefined ? [] : imports(instance as T),
      controllers: (instance: object) =>
        controllers === undefined ? [] : controllers(instance as T),
      gateways: (instance: object) =>
        gateways === undefined ? [] : gateways(instance as T),
    });
  };
}

const registered = new WeakMap<BackOneServer, Map<object, string>>();

/** Preflight the complete graph before mounting any HTTP route or gateway. */
export function registerModules(
  app: BackOneServer,
  modules: readonly object[]
): ModuleRegistration {
  const previous = registered.get(app);
  const mounts = new Map(previous);
  const active = new Set<object>();
  const descriptions: ModuleDescription[] = [];
  const controllers: ControllerBinding[] = [];
  const gateways: GatewayBinding[] = [];
  const appPrefix = app.prefix;

  function visit(instance: object, parentPrefix: string): void {
    if (active.has(instance))
      throw new Error('Circular Module imports detected');
    const prototype: object | null = Object.getPrototypeOf(instance);
    const constructor: unknown = prototype
      ? Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value
      : undefined;
    const definition =
      typeof constructor === 'function'
        ? findClassMetadata(constructor)?.module
        : undefined;
    if (definition === undefined)
      throw new Error('Each module instance must have its own @Module');
    const prefix = joinPrefix(parentPrefix, definition.prefix);
    const fullPrefix = joinPrefix(appPrefix, prefix);
    if (mounts.has(instance)) {
      if (mounts.get(instance) !== fullPrefix)
        throw new Error('A module instance cannot mount at different prefixes');
      return;
    }
    active.add(instance);
    const imported = members(definition.imports(instance), 'imports');
    const ownControllers = members(
      definition.controllers(instance),
      'controllers'
    );
    const ownGateways = members(definition.gateways(instance), 'gateways');
    for (const child of imported) visit(child, prefix);
    controllers.push(
      ...ownControllers.map((controller) => ({ instance: controller, prefix }))
    );
    gateways.push(
      ...ownGateways.map((gateway) => ({ instance: gateway, prefix }))
    );
    descriptions.push(
      Object.freeze({
        name: typeof constructor === 'function' ? constructor.name : '',
        prefix: fullPrefix,
      })
    );
    active.delete(instance);
    mounts.set(instance, fullPrefix);
  }

  for (const instance of members(modules, 'roots')) visit(instance, '');
  const commitControllers = prepareControllers(app, controllers);
  const commitGateways = prepareWebSockets(app, gateways);
  const routes = commitControllers();
  const registeredGateways = commitGateways();
  registered.set(app, mounts);
  return Object.freeze({
    modules: Object.freeze(descriptions),
    routes,
    gateways: registeredGateways,
  });
}
