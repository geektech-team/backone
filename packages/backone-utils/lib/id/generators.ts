/**
 * ID 生成器实现：uuidv4 / uuidv7 / nanoid / snowflake 四种策略。
 *
 * 全部基于标准 Web Crypto 与 Bun 内置能力，零运行时依赖：
 * - uuidv4 / uuidv7 直接使用 `crypto.randomUUID()` 与 `Bun.uuidv7()`
 * - nanoid 用 `crypto.getRandomValues` 按掩码无偏采样
 * - snowflake 为经典 41+10+12 位布局（毫秒时间戳 + 机器号 + 序列号），
 *   输出十进制字符串；时钟回拨时抛错，避免 ID 乱序或重复
 */

import { BackoneError } from '../errors';
import type { IdGenerator, NanoIdOptions, SnowflakeOptions } from './types';

/** 默认雪花纪元：2024-01-01T00:00:00.000Z */
const DEFAULT_SNOWFLAKE_EPOCH = Date.UTC(2024, 0, 1);

/** URL 安全字母数字字符表（64 字符，正好 6 bit/字符） */
const URL_SAFE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

/** ID 生成错误码 */
export type IdErrorCode = 'ID_CLOCK_BACKWARD';

/** ID 生成错误（当前仅时钟回拨会触发） */
export class BackoneIdError extends BackoneError<IdErrorCode> {
  constructor(message: string, code: IdErrorCode = 'ID_CLOCK_BACKWARD') {
    super(message, code);
    this.name = 'BackoneIdError';
  }
}

/** UUID v4（随机）生成器 */
export class UuidV4Generator implements IdGenerator {
  generate(): string {
    return crypto.randomUUID();
  }
}

/** UUID v7（时间有序 + 随机）生成器，依赖 Bun 内置实现（Bun >= 1.4） */
export class UuidV7Generator implements IdGenerator {
  generate(): string {
    return Bun.randomUUIDv7();
  }
}

/** NanoId 风格短 ID 生成器 */
export class NanoIdGenerator implements IdGenerator {
  readonly #alphabet: string;
  readonly #length: number;
  /** 采样掩码：使随机字节取模无偏 */
  readonly #mask: number;
  /** 每批采样的字节数，兼顾碰撞概率与吞吐 */
  readonly #step: number;

  constructor(options: NanoIdOptions = {}) {
    this.#alphabet = options.alphabet ?? URL_SAFE_ALPHABET;
    this.#length = options.length ?? 21;

    // 掩码取「不小于 alphabet.length 的 2 的幂 - 1」；alphabet 长度为 2 的
    // 幂时掩码恰为 length - 1（无拒绝采样），否则按比例丢弃越界字节。
    let mask = 1;
    while (this.#alphabet.length - 1 > mask) {
      mask = (mask << 1) | 1;
    }
    this.#mask = mask;
    this.#step = Math.ceil((1.6 * mask * this.#length) / this.#alphabet.length);
  }

  generate(): string {
    let id = '';

    // 单批采样可能因拒绝采样不足长度，循环补采直到生成完成
    while (id.length < this.#length) {
      const bytes = crypto.getRandomValues(new Uint8Array(this.#step));

      for (let i = 0; i < bytes.length; i++) {
        const index = bytes[i] & this.#mask;
        if (index < this.#alphabet.length) {
          id += this.#alphabet[index];
          if (id.length === this.#length) {
            return id;
          }
        }
      }
    }

    return id;
  }
}

/** 雪花 ID 生成器（63 位：41 时间戳 + 10 机器号 + 12 序列号） */
export class SnowflakeGenerator implements IdGenerator {
  readonly #epoch: number;
  readonly #machineId: number;
  #sequence = 0;
  #lastTimestamp = -1n;

  constructor(options: SnowflakeOptions = {}) {
    this.#epoch = options.epoch ?? DEFAULT_SNOWFLAKE_EPOCH;
    this.#machineId =
      (options.machineId ?? Math.floor(Math.random() * 1024)) & 0x3ff;
  }

  generate(): string {
    let timestamp = BigInt(Date.now()) - BigInt(this.#epoch);

    if (timestamp < this.#lastTimestamp) {
      throw new BackoneIdError('clock moved backwards');
    }

    if (timestamp === this.#lastTimestamp) {
      this.#sequence = (this.#sequence + 1) & 0xfff;
      if (this.#sequence === 0) {
        // 当前毫秒序列耗尽：等待进入下一毫秒（期间时钟回拨则报错）
        while (timestamp <= this.#lastTimestamp) {
          timestamp = BigInt(Date.now()) - BigInt(this.#epoch);
          if (timestamp < this.#lastTimestamp) {
            throw new BackoneIdError('clock moved backwards while waiting');
          }
        }
      }
    } else {
      this.#sequence = 0;
    }

    this.#lastTimestamp = timestamp;

    return (
      (timestamp << 22n) |
      (BigInt(this.#machineId) << 12n) |
      BigInt(this.#sequence)
    ).toString();
  }
}
