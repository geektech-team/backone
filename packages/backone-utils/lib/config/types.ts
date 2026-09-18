/** config 模块公共类型与错误 */

import { BackoneError } from '../errors';
import type { InferType, ObjectSchema, Shape, SchemaIssue } from '../schema';

/** 配置错误码 */
export type ConfigErrorCode = 'CONFIG_INVALID' | 'CONFIG_PREFIX_INVALID';

/** 配置错误：携带稳定错误码与校验问题列表 */
export class ConfigError extends BackoneError<ConfigErrorCode> {
  /** 校验问题（CONFIG_INVALID 时非空） */
  readonly issues: SchemaIssue[];

  constructor(
    code: ConfigErrorCode,
    message: string,
    issues: SchemaIssue[] = []
  ) {
    super(message, code);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/** 配置读取源：按完整环境变量名读取字符串值 */
export interface ConfigSource {
  /** 来源名称（错误信息与调试用），如 'env' / 'memory' */
  readonly name: string;

  /** 读取配置值；未设置返回 undefined */
  get(name: string): string | undefined;
}

/** defineConfig 选项 */
export interface DefineConfigOptions<S extends Shape> {
  /**
   * 环境变量前缀，如 'APP_'。字段名先转 UPPER_SNAKE_CASE 再拼接；
   * 前缀自动大写，缺末尾下划线时自动补（'app' → 'APP_'）。
   */
  prefix?: string;

  /** 读取源，默认 EnvSource（Bun.env + process.env，覆盖 .env 文件） */
  source?: ConfigSource;

  /** 缺省值（native 类型），env 未设置时使用 */
  defaults?: Partial<{ [K in keyof S]: InferType<S[K]> }>;
}

/** 配置对象形状：值可读但不可变（深冻结） */
export type Config<S extends Shape> = Readonly<{
  [K in keyof S]: InferType<S[K]>;
}>;

/** 由对象 schema 推导配置对象类型 */
export type ConfigFromSchema<T> =
  T extends ObjectSchema<infer S> ? Config<S> : never;
