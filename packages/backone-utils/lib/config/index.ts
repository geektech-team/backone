/** 全局配置模块统一出口：从环境变量读取强类型、启动期校验的配置 */

export { defineConfig, toUpperSnake } from './define';
export { EnvSource, MemorySource } from './source';
export { ConfigError } from './types';
export type {
  Config,
  ConfigErrorCode,
  ConfigFromSchema,
  ConfigSource,
  DefineConfigOptions,
} from './types';
