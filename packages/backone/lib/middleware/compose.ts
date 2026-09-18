/**
 * 洋葱模型组合器：按注册顺序执行处理器，next() 进入下一层，
 * 返回值从内向外逐层冒泡。
 */

import type { Context } from '../context';
import type { Handler, Next } from '../types';

/** 预编译后的中间件链：链尾 next 可为任意 Handler（含路由处理器） */
export type ComposedHandler = (ctx: Context, next?: Handler) => unknown;

export function compose(handlers: readonly Handler[]): ComposedHandler {
  return (ctx, next) => {
    let index = -1;

    const dispatch = (i: number): unknown => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;
      const fn = handlers[i] ?? next;
      if (fn === undefined) {
        return undefined;
      }
      return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
    };

    return dispatch(0);
  };
}

export type { Next };
