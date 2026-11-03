import type { Context } from '../context';
import type { Handler, Next, RouteMethod } from '../types';

/** Use remains outermost; system policies execute in these stages. */
export type PolicyPhase =
  'timeout' | 'authorize' | 'rateLimit' | 'validate' | 'response' | 'cache';

export interface SystemPolicy {
  phase: PolicyPhase;
  handler: Handler;
  httpOnly?: boolean;
}

export type WebSocketEvent = 'open' | 'message' | 'close' | 'drain';

export interface MethodMetadata {
  routes: { method: RouteMethod; path: string }[];
  middlewares: Handler[];
  policies: SystemPolicy[];
  events: WebSocketEvent[];
}

export interface ModuleDefinition {
  readonly prefix: string;
  readonly imports: (instance: object) => readonly object[];
  readonly controllers: (instance: object) => readonly object[];
  readonly gateways: (instance: object) => readonly object[];
}

export interface ClassMetadata {
  module?: ModuleDefinition;
  prefix?: string;
  webSocket?: string;
  middlewares: Handler[];
  policies: SystemPolicy[];
  methods: Map<PropertyKey, MethodMetadata>;
}

type MethodContext = Pick<
  ClassMethodDecoratorContext,
  'kind' | 'name' | 'static' | 'private' | 'metadata'
>;
type ClassContext = Pick<ClassDecoratorContext, 'kind' | 'metadata'>;
type SystemContext = MethodContext | ClassContext;
export type SystemDecorator = (target: object, context: SystemContext) => void;

// TypeScript-emitted standard metadata needs this symbol before class evaluation.
const symbols = Symbol as SymbolConstructor & { metadata?: symbol };
if (symbols.metadata === undefined) {
  Object.defineProperty(Symbol, 'metadata', {
    value: Symbol.for('Symbol.metadata'),
    configurable: true,
  });
}
const metadataSymbol = symbols.metadata as symbol;
const definitions = new WeakMap<object, ClassMetadata>();

function definition(context: SystemContext): ClassMetadata {
  if (context?.metadata === undefined) {
    throw new Error(
      'BackOne requires standard decorators with metadata (TypeScript >=5.2)'
    );
  }
  let metadata = definitions.get(context.metadata);
  if (metadata === undefined) {
    metadata = { middlewares: [], policies: [], methods: new Map() };
    definitions.set(context.metadata, metadata);
  }
  return metadata;
}

function assertTarget(target: object): void {
  if (typeof target !== 'function')
    throw new Error('Decorators require a class or method');
}

export function classMetadata(
  target: object,
  context: ClassContext
): ClassMetadata {
  if (context?.kind !== 'class')
    throw new Error('BackOne requires standard decorators');
  assertTarget(target);
  return definition(context);
}

export function methodMetadata(
  target: object,
  context: MethodContext
): MethodMetadata {
  if (context?.kind !== 'method')
    throw new Error('BackOne requires standard decorators');
  if (context.static || context.private) {
    throw new Error('Route decorators require a public instance method');
  }
  assertTarget(target);
  const owner = definition(context);
  let metadata = owner.methods.get(context.name);
  if (metadata === undefined) {
    metadata = { routes: [], middlewares: [], policies: [], events: [] };
    owner.methods.set(context.name, metadata);
  }
  return metadata;
}

export function findClassMetadata(target: object): ClassMetadata | undefined {
  const token: unknown = Object.getOwnPropertyDescriptor(
    target,
    metadataSymbol
  )?.value;
  return typeof token === 'object' && token !== null
    ? definitions.get(token)
    : undefined;
}

function member(target: object, context: SystemContext) {
  return context?.kind === 'class'
    ? classMetadata(target, context)
    : methodMetadata(target, context as MethodContext);
}

export function Controller(prefix = '') {
  return (target: object, context: ClassContext): void => {
    const metadata = classMetadata(target, context);
    if (metadata.prefix !== undefined)
      throw new Error('A class may only declare @Controller once');
    metadata.prefix = prefix;
  };
}

type RouteHandler<This, P extends Record<string, string>> = (
  this: This,
  ctx: Context & { params: Readonly<P> },
  next: Next
) => unknown;

export type RouteDecorator = <This, P extends Record<string, string>>(
  target: RouteHandler<This, P>,
  context: ClassMethodDecoratorContext<This, RouteHandler<This, P>>
) => void;

function route(method: RouteMethod): (path?: string) => RouteDecorator {
  return (path = '') =>
    (target, context) => {
      methodMetadata(target, context).routes.unshift({ method, path });
    };
}

export const Get = route('GET');
export const Post = route('POST');
export const Put = route('PUT');
export const Patch = route('PATCH');
export const Delete = route('DELETE');
export const Options = route('OPTIONS');
export const Head = route('HEAD');
export const All = route('ALL');

/** Written order is retained for ordinary Use middleware. */
export function Use(...middlewares: Handler[]): SystemDecorator {
  if (middlewares.some((middleware) => typeof middleware !== 'function')) {
    throw new Error('@Use requires middleware functions');
  }
  return (target, context) => {
    member(target, context).middlewares.unshift(...middlewares);
  };
}

/** System decorators declare policies instead of replacing business functions. */
export function policyDecorator(policy: SystemPolicy): SystemDecorator {
  return (target, context) => {
    member(target, context).policies.unshift(policy);
  };
}
