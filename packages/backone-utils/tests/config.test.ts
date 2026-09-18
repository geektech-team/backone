import { describe, expect, it } from 'bun:test';
import { v } from '../lib/schema';
import {
  ConfigError,
  EnvSource,
  MemorySource,
  defineConfig,
} from '../lib/config';

const appSchema = v.object({
  port: v.number({ integer: true, min: 0, max: 65535 }),
  jwtSecret: v.string({ minLength: 8 }),
  debug: v.boolean(),
  logLevel: v.enum(['debug', 'info', 'warn', 'error']),
  tags: v.array(v.string()),
  redis: v.object({ url: v.string({ minLength: 1 }) }),
});

describe('defineConfig', () => {
  it('从读取源读取并按字段类型转换（string/number/boolean）', () => {
    const config = defineConfig(appSchema, {
      prefix: 'APP_',
      source: new MemorySource({
        APP_PORT: '8080',
        APP_JWT_SECRET: 'super-secret-key',
        APP_DEBUG: 'true',
        APP_LOG_LEVEL: 'warn',
        APP_TAGS: '["a","b"]',
        APP_REDIS: '{"url":"redis://localhost:6379"}',
      }),
    });
    expect(config.port).toBe(8080);
    expect(config.jwtSecret).toBe('super-secret-key');
    expect(config.debug).toBe(true);
    expect(config.logLevel).toBe('warn');
    expect(config.tags).toEqual(['a', 'b']);
    expect(config.redis).toEqual({ url: 'redis://localhost:6379' });
  });

  it('字段名转 UPPER_SNAKE_CASE 并拼接前缀（前缀自动大写、补下划线）', () => {
    const source = new MemorySource({ APP_JWT_SECRET: 'super-secret-key' });
    const config = defineConfig(
      v.object({ jwtSecret: v.string({ minLength: 8 }) }),
      { prefix: 'app', source }
    );
    expect(config.jwtSecret).toBe('super-secret-key');
  });

  it('无前缀时直接用字段名转大写', () => {
    const config = defineConfig(v.object({ port: v.number() }), {
      source: new MemorySource({ PORT: '9000' }),
    });
    expect(config.port).toBe(9000);
  });

  it('boolean 支持 true/false/1/0/yes/no 写法', () => {
    const schema = v.object({ a: v.boolean(), b: v.boolean() });
    const config = defineConfig(schema, {
      source: new MemorySource({ A: 'yes', B: '0' }),
    });
    expect(config.a).toBe(true);
    expect(config.b).toBe(false);
  });

  it('optional 字段缺省时为 undefined，nullable/optional 正常解包转换', () => {
    const config = defineConfig(
      v.object({
        optionalPort: v.optional(v.number()),
        nullableName: v.nullable(v.string()),
      }),
      {
        source: new MemorySource({ OPTIONAL_PORT: '3000', NULLABLE_NAME: 'x' }),
      }
    );
    expect(config.optionalPort).toBe(3000);
    expect(config.nullableName).toBe('x');
  });

  it('defaults 在 env 缺省时填充，且不经过字符串转换', () => {
    const config = defineConfig(
      v.object({ port: v.number(), debug: v.boolean() }),
      {
        source: new MemorySource({ PORT: '8080' }),
        defaults: { debug: false, port: 9000 },
      }
    );
    expect(config.port).toBe(8080); // env 优先
    expect(config.debug).toBe(false);
  });

  it('必填字段缺失时抛 CONFIG_INVALID，issues 带字段', () => {
    try {
      defineConfig(appSchema, { source: new MemorySource({}) });
      expect.unreachable('should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const configError = error as ConfigError;
      expect(configError.code).toBe('CONFIG_INVALID');
      expect(configError.message).toContain('PORT');
      expect(configError.message).toContain('JWT_SECRET');
    }
  });

  it('非法值抛 CONFIG_INVALID（number 字段给非数字、boolean 给未知值）', () => {
    try {
      defineConfig(appSchema, {
        source: new MemorySource({
          APP_PORT: 'abc',
          APP_JWT_SECRET: 'super-secret-key',
          APP_DEBUG: 'maybe',
          APP_LOG_LEVEL: 'info',
          APP_TAGS: '[]',
          APP_REDIS: '{"url":"r"}',
        }),
      });
      expect.unreachable('should throw');
    } catch (error) {
      const configError = error as ConfigError;
      expect(configError.code).toBe('CONFIG_INVALID');
      expect(configError.message).toContain('PORT: expected number');
      expect(configError.message).toContain('DEBUG: expected boolean');
    }
  });

  it('JSON 字段非法 JSON 抛 CONFIG_INVALID', () => {
    try {
      defineConfig(appSchema, {
        source: new MemorySource({
          APP_PORT: '8080',
          APP_JWT_SECRET: 'super-secret-key',
          APP_DEBUG: 'true',
          APP_LOG_LEVEL: 'info',
          APP_TAGS: 'not-json',
          APP_REDIS: '{"url":"r"}',
        }),
      });
      expect.unreachable('should throw');
    } catch (error) {
      expect((error as ConfigError).message).toContain('TAGS: expected array');
    }
  });

  it('union 字段保留原始字符串（不做自动转换）', () => {
    const config = defineConfig(
      v.object({ value: v.union([v.string(), v.number()]) }),
      { source: new MemorySource({ VALUE: '42' }) }
    );
    expect(config.value).toBe('42');
  });

  it('返回对象深冻结', () => {
    const config = defineConfig(
      v.object({ nested: v.object({ deep: v.boolean() }) }),
      { source: new MemorySource({ NESTED: '{"deep":true}' }) }
    );
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.nested)).toBe(true);
  });

  it('非法前缀抛 CONFIG_PREFIX_INVALID', () => {
    try {
      defineConfig(appSchema, {
        prefix: 'A-B',
        source: new MemorySource({}),
      });
      expect.unreachable('should throw');
    } catch (error) {
      expect((error as ConfigError).code).toBe('CONFIG_PREFIX_INVALID');
    }
  });

  it('EnvSource 从 process.env 读取真实环境变量', () => {
    process.env.FROM_ENV = 'hello-config';
    const config = defineConfig(v.object({ fromEnv: v.string() }), {
      source: new EnvSource(),
    });
    expect(config.fromEnv).toBe('hello-config');
    delete process.env.FROM_ENV;
  });

  it('schema 类型标识公开（kind / inner / shape）', () => {
    expect(v.string().kind).toBe('string');
    expect(v.number().kind).toBe('number');
    expect(v.boolean().kind).toBe('boolean');
    expect(v.literal(1).kind).toBe('literal');
    expect(v.enum(['a']).kind).toBe('enum');
    expect(v.array(v.string()).kind).toBe('array');
    expect(v.object({}).kind).toBe('object');
    expect(v.record(v.string()).kind).toBe('record');
    expect(v.optional(v.string()).kind).toBe('optional');
    expect(v.nullable(v.string()).kind).toBe('nullable');
    expect(v.union([v.string()]).kind).toBe('union');
    expect(v.optional(v.number()).inner.kind).toBe('number');
    expect(Object.keys(v.object({ a: v.string() }).shape)).toEqual(['a']);
  });
});
