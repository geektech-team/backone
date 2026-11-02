import type { Context } from '../context';
import type { Handler, Next, RouteMethod } from '../types';

interface ClassMetadata {
  prefix?: string;
  middlewares: Handler[];
}

interface MethodMetadata {
  routes: { method: RouteMethod; path: string }[];
  middlewares: Handler[];
}

const classes = new WeakMap<object, ClassMetadata>();
const methods = new WeakMap<object, MethodMetadata>();

export function classMetadata(target: object): ClassMetadata {
  let metadata = classes.get(target);
  if (metadata === undefined) {
    metadata = { middlewares: [] };
    classes.set(target, metadata);
  }
  return metadata;
}

export function methodMetadata(target: object): MethodMetadata {
  let metadata = methods.get(target);
  if (metadata === undefined) {
    metadata = { routes: [], middlewares: [] };
    methods.set(target, metadata);
  }
  return metadata;
}

export const findClassMetadata = (target: object) => classes.get(target);
export const findMethodMetadata = (target: object) => methods.get(target);

/** 仅支持标准装饰器的公开实例方法。 */
function assertInstanceMethod(
  context: Pick<ClassMethodDecoratorContext, 'kind' | 'static' | 'private'>
): void {
  if (context?.kind !== 'method') {
    throw new Error('BackOne requires standard decorators');
  }
  if (context.static || context.private) {
    throw new Error('Route decorators require a public instance method');
  }
}

/** 声明路由前缀；派生类需要自己的 @Controller 声明。 */
export function Controller(prefix = '') {
  return (target: object, context: ClassDecoratorContext): void => {
    if (context?.kind !== 'class') {
      throw new Error('BackOne requires standard decorators');
    }
    const metadata = classMetadata(target);
    if (metadata.prefix !== undefined) {
      throw new Error('A class may only declare @Controller once');
    }
    metadata.prefix = prefix;
  };
}

type RouteHandler<This, P extends Record<string, string>> = (
  this: This,
  ctx: Context & { params: Readonly<P> },
  next: Next
) => unknown;

/** 保留业务方法的 this、路径参数和返回类型，不包装方法。 */
export type RouteDecorator = <This, P extends Record<string, string>>(
  target: RouteHandler<This, P>,
  context: ClassMethodDecoratorContext<This, RouteHandler<This, P>>
) => void;

function route(method: RouteMethod): (path?: string) => RouteDecorator {
  return (path = '') =>
    (target, context) => {
      assertInstanceMethod(context);
      methodMetadata(target).routes.unshift({ method, path });
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

/** 类及方法局部中间件，按从上到下、从左到右的书写顺序执行。 */
export function Use(...middlewares: Handler[]) {
  if (middlewares.some((middleware) => typeof middleware !== 'function')) {
    throw new Error('@Use requires middleware functions');
  }
  return (
    target: object,
    context: ClassDecoratorContext | ClassMethodDecoratorContext
  ): void => {
    if (context.kind === 'class') {
      classMetadata(target).middlewares.unshift(...middlewares);
    } else {
      assertInstanceMethod(context);
      methodMetadata(target).middlewares.unshift(...middlewares);
    }
  };
}
