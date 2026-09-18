/** ID 生成工具统一出口 */

import type { IdGenerator, NanoIdOptions, SnowflakeOptions } from './types';
import {
  NanoIdGenerator,
  SnowflakeGenerator,
  UuidV4Generator,
  UuidV7Generator,
} from './generators';

export type { IdGenerator, NanoIdOptions, SnowflakeOptions } from './types';
export {
  BackoneIdError,
  type IdErrorCode,
  NanoIdGenerator,
  SnowflakeGenerator,
  UuidV4Generator,
  UuidV7Generator,
} from './generators';

/** 支持的 ID 生成策略 */
export type IdStrategy = 'uuidv4' | 'uuidv7' | 'nanoid' | 'snowflake';

/** ID 生成器通用选项 */
export type IdGeneratorOptions = NanoIdOptions & SnowflakeOptions;

/**
 * 按策略创建 ID 生成器（默认 uuidv7，时间有序、适合做数据库主键）。
 *
 * ```ts
 * const ids = createIdGenerator('nanoid', { length: 12 });
 * const id = ids.generate();
 * ```
 */
export function createIdGenerator(
  strategy: IdStrategy = 'uuidv7',
  options: IdGeneratorOptions = {}
): IdGenerator {
  switch (strategy) {
    case 'uuidv4':
      return new UuidV4Generator();
    case 'uuidv7':
      return new UuidV7Generator();
    case 'nanoid':
      return new NanoIdGenerator(options);
    case 'snowflake':
      return new SnowflakeGenerator(options);
  }
}

/** 快捷生成单个 ID（默认 uuidv7） */
export function createId(
  strategy: IdStrategy = 'uuidv7',
  options?: IdGeneratorOptions
): string {
  return createIdGenerator(strategy, options).generate();
}
