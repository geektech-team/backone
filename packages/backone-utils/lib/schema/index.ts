/** 校验工具统一出口（轻量 zod 风格 schema 校验器） */

import type { InferType, Schema } from './schema';
import {
  ArraySchema,
  BooleanSchema,
  EnumSchema,
  LiteralSchema,
  NullableSchema,
  NumberSchema,
  ObjectSchema,
  OptionalSchema,
  RecordSchema,
  StringSchema,
  UnionSchema,
  type ArrayOptions,
  type NumberOptions,
  type Shape,
  type StringOptions,
} from './primitives';

export type { InferType, SafeParseResult, Schema, SchemaKind } from './schema';
export type {
  ArrayOptions,
  NumberOptions,
  Shape,
  StringOptions,
} from './primitives';
export {
  ArraySchema,
  BooleanSchema,
  EnumSchema,
  LiteralSchema,
  NullableSchema,
  NumberSchema,
  ObjectSchema,
  OptionalSchema,
  RecordSchema,
  StringSchema,
  UnionSchema,
} from './primitives';
export {
  ValidationError,
  formatPath,
  type SchemaIssue,
  type ValidationErrorCode,
} from './errors';

/** 校验器工厂对象 */
export const v = {
  /** 字符串：可选 minLength / maxLength / pattern */
  string: (options?: StringOptions) => new StringSchema(options),
  /** 数字：可选 min / max / integer */
  number: (options?: NumberOptions) => new NumberSchema(options),
  boolean: () => new BooleanSchema(),
  /** 字面量：仅接受指定值 */
  literal: <L extends string | number | boolean>(value: L) =>
    new LiteralSchema(value),
  /** 枚举：`v.enum(['a', 'b'] as const)` */
  enum: <T extends string>(values: readonly T[]) => new EnumSchema<T>(values),
  /** 数组：元素 schema + 可选长度约束 */
  array: <E>(item: Schema<E>, options?: ArrayOptions) =>
    new ArraySchema(item, options),
  /** 对象：形状校验，返回类型化对象 */
  object: <S extends Shape>(shape: S) => new ObjectSchema<S>(shape),
  /** 记录：任意字符串键 → 同构值 */
  record: <V>(value: Schema<V>) => new RecordSchema<V>(value),
  /** 可选：undefined 通过 */
  optional: <T>(schema: Schema<T>) => new OptionalSchema<T>(schema),
  /** 可空：null 通过 */
  nullable: <T>(schema: Schema<T>) => new NullableSchema<T>(schema),
  /** 联合：`v.union([v.string(), v.number()])` */
  union: <T extends readonly Schema<unknown>[]>(schemas: T) =>
    new UnionSchema<T>(schemas) as Schema<InferType<T[number]>>,
};

export type { InferType as TypeOf };
