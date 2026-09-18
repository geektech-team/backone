/**
 * 全局配置：从环境变量（或自定义读取源）读取强类型、启动期校验的配置。
 *
 * 用法：
 * ```ts
 * const config = defineConfig(
 *   v.object({
 *     port: v.number({ integer: true, min: 0, max: 65535 }),
 *     jwtSecret: v.string({ minLength: 8 }),
 *     debug: v.boolean(),
 *   }),
 *   { prefix: 'APP_' }
 * );
 * // 读取 APP_PORT / APP_JWT_SECRET / APP_DEBUG
 * // config 深冻结、类型推导，缺失或非法配置启动期即抛 ConfigError
 * ```
 */

import type {
  Schema,
  SchemaKind,
  ObjectSchema,
  Shape,
  SchemaIssue,
} from '../schema';
import { formatPath, NullableSchema, OptionalSchema } from '../schema';
import { EnvSource } from './source';
import { ConfigError } from './types';
import type { Config, DefineConfigOptions } from './types';

/** 字段名 → 环境变量名：camelCase 转 UPPER_SNAKE_CASE（'jwtSecret' → 'JWT_SECRET'） */
export function toUpperSnake(name: string): string {
  return name.replace(/[A-Z]/g, (match) => `_${match}`).toUpperCase();
}

/** 读取配置并校验，返回深冻结的强类型配置对象 */
export function defineConfig<S extends Shape>(
  schema: ObjectSchema<S>,
  options: DefineConfigOptions<S> = {}
): Config<S> {
  const prefix = normalizePrefix(options.prefix);
  const source = options.source ?? new EnvSource();
  const defaults = (options.defaults ?? {}) as Record<string, unknown>;

  const input: Record<string, unknown> = {};
  for (const [field, fieldSchema] of Object.entries(schema.shape)) {
    const raw = source.get(envName(prefix, field));
    input[field] =
      raw !== undefined ? convert(fieldSchema, raw) : defaults[field];
  }

  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ConfigError(
      'CONFIG_INVALID',
      `invalid config: ${result.error.issues
        .map((issue) => issueMessage(prefix, issue))
        .join('; ')}`,
      result.error.issues
    );
  }
  return deepFreeze(result.data) as Config<S>;
}

/** 完整环境变量名 = 前缀 + 字段名转大写蛇形 */
function envName(prefix: string, field: string): string {
  return `${prefix}${toUpperSnake(field)}`;
}

/** 前缀归一化：大写、缺末尾下划线自动补；非法前缀抛 CONFIG_PREFIX_INVALID */
function normalizePrefix(prefix: string | undefined): string {
  if (prefix === undefined || prefix === '') {
    return '';
  }
  const trimmed = prefix.trim();
  if (trimmed === '') {
    return '';
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    throw new ConfigError(
      'CONFIG_PREFIX_INVALID',
      `invalid config prefix "${prefix}": must match /^[A-Za-z_][A-Za-z0-9_]*$/`
    );
  }
  const upper = trimmed.toUpperCase();
  return upper.endsWith('_') ? upper : `${upper}_`;
}

/** env 字符串 → 值：按字段类型转换；无法转换时保留原字符串交给 schema 校验报错 */
function convert(fieldSchema: Schema<unknown>, value: string): unknown {
  const inner =
    fieldSchema instanceof OptionalSchema ||
    fieldSchema instanceof NullableSchema
      ? fieldSchema.inner
      : fieldSchema;
  return convertByKind(inner.kind, value);
}

function convertByKind(kind: SchemaKind, value: string): unknown {
  switch (kind) {
    case 'number': {
      const trimmed = value.trim();
      if (trimmed === '') {
        return value;
      }
      const number = Number(value);
      return Number.isNaN(number) ? value : number;
    }
    case 'boolean': {
      const flag = value.trim().toLowerCase();
      if (flag === 'true' || flag === '1' || flag === 'yes' || flag === 'on') {
        return true;
      }
      if (flag === 'false' || flag === '0' || flag === 'no' || flag === 'off') {
        return false;
      }
      return value;
    }
    case 'array':
    case 'object':
    case 'record':
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    default:
      // string / literal / enum / union：直接给 schema 校验
      return value;
  }
}

/** 校验问题 → 可读信息：`APP_PORT: expected number` */
function issueMessage(prefix: string, issue: SchemaIssue): string {
  const root = issue.path[0];
  const name = root === undefined ? '<config>' : envName(prefix, String(root));
  const suffix =
    issue.path.length > 1 ? `.${formatPath(issue.path.slice(1))}` : '';
  return `${name}${suffix}: ${issue.message}`;
}

/** 深冻结（配置不可变；值为 JSON 形态数据，无循环引用） */
function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value as Readonly<T>;
}
