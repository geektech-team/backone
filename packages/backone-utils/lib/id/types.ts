/**
 * ID 生成器公开类型。
 *
 * 生成器遵循策略模式：`IdGenerator` 为统一接口，不同策略（uuidv4 /
 * uuidv7 / nanoid / snowflake）可互换；通过 `createIdGenerator` 工厂按
 * 名称创建，便于配置驱动。
 */

/** ID 生成器策略接口 */
export interface IdGenerator {
  /** 生成一个新的唯一 ID 字符串 */
  generate(): string;
}

/** NanoId 生成器选项 */
export interface NanoIdOptions {
  /** 字符表（默认 URL 安全字母数字 64 字符，含 `_` 与 `-`） */
  alphabet?: string;
  /** 生成长度（默认 21，碰撞概率约 2^-126） */
  length?: number;
}

/** 雪花 ID 生成器选项 */
export interface SnowflakeOptions {
  /** 纪元毫秒时间戳（默认 2024-01-01T00:00:00.000Z） */
  epoch?: number;
  /** 机器 / 进程 ID（0-1023，默认随机分配） */
  machineId?: number;
}
