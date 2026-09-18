/**
 * Schema 基类：校验（parse）与安全校验（safeParse）。
 *
 * 所有具体 schema（string / number / object / array / union 等）继承本类，
 * 只实现 `check(value, path)`；公共 parse 负责统一抛错路径。
 */

import { ValidationError, issue } from './errors';

/** safeParse 结果 */
export type SafeParseResult<T> =
  { success: true; data: T } | { success: false; error: ValidationError };

/** 从 schema 类型推导值类型：`InferType<typeof schema>` */
export type InferType<S> = S extends Schema<infer T> ? T : never;

/** schema 类型标识：供外部按类型分流（如 config 模块的 env 值转换） */
export type SchemaKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'literal'
  | 'enum'
  | 'array'
  | 'object'
  | 'record'
  | 'optional'
  | 'nullable'
  | 'union';

/** Schema 基类 */
export abstract class Schema<T> {
  /** 类型标识（子类各自实现） */
  abstract readonly kind: SchemaKind;

  /**
   * 校验并返回类型化值；失败抛出携带问题列表的 ValidationError。
   */
  parse(value: unknown): T {
    return this.check(value, []);
  }

  /** 安全校验：不抛错，返回 success/data 或 error */
  safeParse(value: unknown): SafeParseResult<T> {
    try {
      return { success: true, data: this.parse(value) };
    } catch (error) {
      if (error instanceof ValidationError) {
        return { success: false, error };
      }
      throw error;
    }
  }

  /**
   * 在指定路径处校验（组合类型内部使用，外部请用 parse / safeParse）。
   * 公开以便组合：array / object / union 等需要跨实例调用子 schema。
   */
  abstract check(value: unknown, path: (string | number)[]): T;
}

/** 校验失败辅助：构造单问题并抛错 */
export function fail(path: (string | number)[], message: string): never {
  throw new ValidationError([issue(path, message)]);
}
