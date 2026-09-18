import { describe, expect, it } from 'bun:test';
import {
  BackoneIdError,
  NanoIdGenerator,
  SnowflakeGenerator,
  UuidV4Generator,
  UuidV7Generator,
  createId,
  createIdGenerator,
  type IdGenerator,
} from '../lib/id';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function collect(gen: IdGenerator, count: number): string[] {
  return Array.from({ length: count }, () => gen.generate());
}

function allUnique(ids: string[]): boolean {
  return new Set(ids).size === ids.length;
}

describe('id', () => {
  it('uuidv4：标准格式且唯一', () => {
    const gen = new UuidV4Generator();
    const ids = collect(gen, 1000);
    expect(ids.every((id) => UUID_RE.test(id))).toBe(true);
    expect(ids[0][14]).toBe('4'); // 版本位
    expect(allUnique(ids)).toBe(true);
  });

  it('uuidv7：标准格式且唯一', () => {
    const gen = new UuidV7Generator();
    const ids = collect(gen, 1000);
    expect(ids.every((id) => UUID_RE.test(id))).toBe(true);
    expect(ids[0][14]).toBe('7'); // 版本位
    expect(allUnique(ids)).toBe(true);
  });

  it('nanoid：默认长度 21、URL 安全字符集、唯一', () => {
    const gen = new NanoIdGenerator();
    const ids = collect(gen, 2000);
    expect(ids.every((id) => id.length === 21)).toBe(true);
    expect(ids.every((id) => /^[A-Za-z0-9_-]+$/.test(id))).toBe(true);
    expect(allUnique(ids)).toBe(true);
  });

  it('nanoid：支持自定义字符表与长度', () => {
    const gen = new NanoIdGenerator({ alphabet: '0123456789', length: 6 });
    const ids = collect(gen, 200);
    expect(ids.every((id) => /^\d{6}$/.test(id))).toBe(true);
  });

  it('snowflake：十进制字符串、唯一且单调递增', () => {
    const gen = new SnowflakeGenerator();
    const ids = collect(gen, 2000);
    expect(ids.every((id) => /^\d+$/.test(id))).toBe(true);
    expect(allUnique(ids)).toBe(true);
    const nums = ids.map((id) => BigInt(id));
    for (let i = 1; i < nums.length; i++) {
      expect(nums[i] > nums[i - 1]).toBe(true);
    }
  });

  it('snowflake：时钟回拨抛 ID_CLOCK_BACKWARD', () => {
    const gen = new SnowflakeGenerator({ epoch: 0 });
    gen.generate();
    const realNow = Date.now;
    Date.now = () => realNow() - 2000;
    try {
      expect(() => gen.generate()).toThrow(BackoneIdError);
      try {
        gen.generate();
      } catch (error) {
        expect(error).toBeInstanceOf(BackoneIdError);
        expect((error as BackoneIdError).code).toBe('ID_CLOCK_BACKWARD');
      }
    } finally {
      Date.now = realNow;
    }
  });

  it('createIdGenerator / createId：默认 uuidv7，支持全部策略', () => {
    expect(createIdGenerator().generate()).toMatch(UUID_RE);
    expect(createIdGenerator().generate()[14]).toBe('7');
    expect(createIdGenerator('uuidv4').generate()[14]).toBe('4');
    expect(createId('nanoid', { length: 8 })).toHaveLength(8);
    expect(createId('snowflake')).toMatch(/^\d+$/);
  });

  it('不同策略互不干扰，各自唯一', () => {
    const v7 = collect(new UuidV7Generator(), 100);
    const nid = collect(new NanoIdGenerator({ length: 10 }), 100);
    expect(allUnique([...v7, ...nid])).toBe(true);
  });
});
