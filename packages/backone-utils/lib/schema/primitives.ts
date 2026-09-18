/**
 * 具体 schema 实现：基础类型、组合类型与容器类型。
 *
 * 组合采用组合模式（ObjectSchema 组合子 schema、ArraySchema 组合元素
 * schema），新增类型只需实现 check，满足开闭原则。
 */

import { fail, Schema } from './schema';
import type { InferType, SchemaKind } from './schema';
import { ValidationError, type SchemaIssue } from './errors';

// ---- 基础类型 ----

/** 字符串选项 */
export interface StringOptions {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
}

export class StringSchema extends Schema<string> {
  readonly kind: SchemaKind = 'string';
  readonly #options: StringOptions;

  constructor(options: StringOptions = {}) {
    super();
    this.#options = options;
  }

  check(value: unknown, path: (string | number)[]): string {
    if (typeof value !== 'string') {
      fail(path, 'expected string');
    }
    if (
      this.#options.minLength !== undefined &&
      value.length < this.#options.minLength
    ) {
      fail(path, `must be at least ${this.#options.minLength} chars`);
    }
    if (
      this.#options.maxLength !== undefined &&
      value.length > this.#options.maxLength
    ) {
      fail(path, `must be at most ${this.#options.maxLength} chars`);
    }
    if (
      this.#options.pattern !== undefined &&
      !this.#options.pattern.test(value)
    ) {
      fail(path, 'does not match pattern');
    }
    return value;
  }
}

/** 数字选项 */
export interface NumberOptions {
  min?: number;
  max?: number;
  /** 仅允许整数 */
  integer?: boolean;
}

export class NumberSchema extends Schema<number> {
  readonly kind: SchemaKind = 'number';
  readonly #options: NumberOptions;

  constructor(options: NumberOptions = {}) {
    super();
    this.#options = options;
  }

  check(value: unknown, path: (string | number)[]): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      fail(path, 'expected number');
    }
    if (this.#options.integer === true && !Number.isInteger(value)) {
      fail(path, 'expected integer');
    }
    if (this.#options.min !== undefined && value < this.#options.min) {
      fail(path, `must be >= ${this.#options.min}`);
    }
    if (this.#options.max !== undefined && value > this.#options.max) {
      fail(path, `must be <= ${this.#options.max}`);
    }
    return value;
  }
}

export class BooleanSchema extends Schema<boolean> {
  readonly kind: SchemaKind = 'boolean';

  check(value: unknown, path: (string | number)[]): boolean {
    if (typeof value !== 'boolean') {
      fail(path, 'expected boolean');
    }
    return value;
  }
}

/** 字面量：仅接受指定值 */
export class LiteralSchema<
  L extends string | number | boolean,
> extends Schema<L> {
  readonly kind: SchemaKind = 'literal';
  readonly #literal: L;

  constructor(literal: L) {
    super();
    this.#literal = literal;
  }

  check(value: unknown, path: (string | number)[]): L {
    if (value !== this.#literal) {
      fail(path, `expected literal ${JSON.stringify(this.#literal)}`);
    }
    return this.#literal;
  }
}

/** 枚举：接受枚举列表中的值 */
export class EnumSchema<T extends string> extends Schema<T> {
  readonly kind: SchemaKind = 'enum';
  readonly #values: readonly T[];

  constructor(values: readonly T[]) {
    super();
    if (values.length === 0) {
      throw new Error('EnumSchema: values must not be empty');
    }
    this.#values = values;
  }

  check(value: unknown, path: (string | number)[]): T {
    if (!this.#values.includes(value as T)) {
      fail(path, `expected one of ${this.#values.join(', ')}`);
    }
    return value as T;
  }
}

// ---- 容器类型 ----

/** 数组选项 */
export interface ArrayOptions {
  minLength?: number;
  maxLength?: number;
}

export class ArraySchema<E> extends Schema<E[]> {
  readonly kind: SchemaKind = 'array';
  readonly #item: Schema<E>;
  readonly #options: ArrayOptions;

  constructor(item: Schema<E>, options: ArrayOptions = {}) {
    super();
    this.#item = item;
    this.#options = options;
  }

  check(value: unknown, path: (string | number)[]): E[] {
    if (!Array.isArray(value)) {
      fail(path, 'expected array');
    }
    if (
      this.#options.minLength !== undefined &&
      value.length < this.#options.minLength
    ) {
      fail(path, `must have at least ${this.#options.minLength} items`);
    }
    if (
      this.#options.maxLength !== undefined &&
      value.length > this.#options.maxLength
    ) {
      fail(path, `must have at most ${this.#options.maxLength} items`);
    }
    const result: E[] = [];
    const errors: SchemaIssue[] = [];

    value.forEach((item, index) => {
      try {
        result.push(this.#item.check(item, [...path, index]));
      } catch (error) {
        if (error instanceof ValidationError) {
          errors.push(...error.issues);
        } else {
          throw error;
        }
      }
    });

    if (errors.length > 0) {
      throw new ValidationError(errors);
    }
    return result;
  }
}

/** 对象形状：键 → schema */
export type Shape = Record<string, Schema<unknown>>;

export class ObjectSchema<S extends Shape> extends Schema<{
  [K in keyof S]: InferType<S[K]>;
}> {
  readonly kind: SchemaKind = 'object';
  readonly #shape: S;

  /** 形状表：键 → 字段 schema（config 等模块需要读取字段定义） */
  get shape(): S {
    return this.#shape;
  }

  constructor(shape: S) {
    super();
    this.#shape = shape;
  }

  check(
    value: unknown,
    path: (string | number)[]
  ): { [K in keyof S]: InferType<S[K]> } {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      fail(path, 'expected object');
    }
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    const errors: SchemaIssue[] = [];

    for (const key of Object.keys(this.#shape) as (keyof S & string)[]) {
      try {
        result[key] = this.#shape[key].check(source[key], [...path, key]);
      } catch (error) {
        if (error instanceof ValidationError) {
          errors.push(...error.issues);
        } else {
          throw error;
        }
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(errors);
    }
    return result as { [K in keyof S]: InferType<S[K]> };
  }
}

/** 记录：任意字符串键 → 同构值 */
export class RecordSchema<V> extends Schema<Record<string, V>> {
  readonly kind: SchemaKind = 'record';
  readonly #value: Schema<V>;

  constructor(value: Schema<V>) {
    super();
    this.#value = value;
  }

  check(value: unknown, path: (string | number)[]): Record<string, V> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      fail(path, 'expected record');
    }
    const source = value as Record<string, unknown>;
    const result: Record<string, V> = {};
    const errors: SchemaIssue[] = [];

    for (const key of Object.keys(source)) {
      try {
        result[key] = this.#value.check(source[key], [...path, key]);
      } catch (error) {
        if (error instanceof ValidationError) {
          errors.push(...error.issues);
        } else {
          throw error;
        }
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(errors);
    }
    return result;
  }
}

// ---- 修饰器 ----

/** 可选：undefined 通过，否则按内层 schema 校验 */
export class OptionalSchema<T> extends Schema<T | undefined> {
  readonly kind: SchemaKind = 'optional';
  readonly #inner: Schema<T>;

  constructor(inner: Schema<T>) {
    super();
    this.#inner = inner;
  }

  /** 内层 schema（config 等模块需要解包转换） */
  get inner(): Schema<T> {
    return this.#inner;
  }

  check(value: unknown, path: (string | number)[]): T | undefined {
    return value === undefined ? undefined : this.#inner.check(value, path);
  }
}

/** 可空：null 通过，否则按内层 schema 校验 */
export class NullableSchema<T> extends Schema<T | null> {
  readonly kind: SchemaKind = 'nullable';
  readonly #inner: Schema<T>;

  constructor(inner: Schema<T>) {
    super();
    this.#inner = inner;
  }

  /** 内层 schema（config 等模块需要解包转换） */
  get inner(): Schema<T> {
    return this.#inner;
  }

  check(value: unknown, path: (string | number)[]): T | null {
    return value === null ? null : this.#inner.check(value, path);
  }
}

/** 联合：依次尝试，任一成功即返回；全部失败时汇总错误 */
export class UnionSchema<T extends readonly Schema<unknown>[]> extends Schema<
  InferType<T[number]>
> {
  readonly kind: SchemaKind = 'union';
  readonly #schemas: T;

  constructor(schemas: T) {
    super();
    if (schemas.length === 0) {
      throw new Error('UnionSchema: schemas must not be empty');
    }
    this.#schemas = schemas;
  }

  check(value: unknown, path: (string | number)[]): InferType<T[number]> {
    const errors: string[] = [];

    for (const schema of this.#schemas) {
      try {
        return schema.check(value, path) as InferType<T[number]>;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    fail(path, `does not match any of: ${errors.join(' | ')}`);
  }
}
