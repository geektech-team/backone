/** 配置读取源实现 */

import type { ConfigSource } from './types';

/**
 * 环境变量读取源（默认）。
 *
 * 优先读取 `Bun.env`（启动期快照，Bun 会自动加载 `.env` / `.env.local` 等），
 * 找不到时回退 `process.env`（动态值，便于测试注入与运行时覆盖）。
 */
export class EnvSource implements ConfigSource {
  readonly name = 'env';

  get(name: string): string | undefined {
    if (typeof Bun !== 'undefined') {
      return Bun.env[name] ?? process.env[name];
    }
    return process.env[name];
  }
}

/** 内存读取源：测试注入与多来源分层覆盖用 */
export class MemorySource implements ConfigSource {
  readonly name: string;
  readonly #values: Record<string, string | undefined>;

  constructor(
    values: Record<string, string | undefined> = {},
    name = 'memory'
  ) {
    this.name = name;
    this.#values = { ...values };
  }

  get(name: string): string | undefined {
    return this.#values[name];
  }
}
