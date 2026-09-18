import { describe, expect, it } from 'bun:test';
import { v, ValidationError, type InferType } from '../lib/schema';

describe('schema 基础类型', () => {
  it('string：类型与长度/正则约束', () => {
    const schema = v.string({
      minLength: 2,
      maxLength: 10,
      pattern: /^[a-z]+$/,
    });
    expect(schema.parse('hello')).toBe('hello');
    expect(schema.safeParse('A1')).toEqual({
      success: false,
      error: expect.any(ValidationError),
    });
    expect(schema.safeParse('a').success).toBe(false);
    expect(schema.safeParse(42).success).toBe(false);
  });

  it('number：类型、整数、范围约束', () => {
    const schema = v.number({ min: 0, max: 100, integer: true });
    expect(schema.parse(50)).toBe(50);
    expect(schema.safeParse(50.5).success).toBe(false);
    expect(schema.safeParse(-1).success).toBe(false);
    expect(schema.safeParse(NaN).success).toBe(false);
    expect(schema.safeParse('50').success).toBe(false);
  });

  it('boolean / literal / enum', () => {
    expect(v.boolean().parse(true)).toBe(true);
    expect(v.boolean().safeParse(1).success).toBe(false);
    expect(v.literal('active').parse('active')).toBe('active');
    expect(v.literal('active').safeParse('inactive').success).toBe(false);

    const status = v.enum(['draft', 'published'] as const);
    expect(status.parse('draft')).toBe('draft');
    expect(status.safeParse('archived').success).toBe(false);
  });
});

describe('schema 容器与组合', () => {
  it('object：形状校验 + 类型推导', () => {
    const citySchema = v.object({
      name: v.string({ minLength: 1 }),
      population: v.number({ min: 0, integer: true }),
      tags: v.array(v.string()),
      score: v.optional(v.number({ min: 0, max: 100 })),
    });
    type City = InferType<typeof citySchema>;

    const city: City = citySchema.parse({
      name: '上海',
      population: 24_000_000,
      tags: ['经济', '人口'],
    });
    expect(city.name).toBe('上海');
    expect(city.score).toBeUndefined();

    const bad = citySchema.safeParse({ name: '', population: -1, tags: 'x' });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      // 命中多条：name / population / tags
      expect(bad.error.issues.length).toBeGreaterThanOrEqual(3);
      expect(bad.error.message).toContain('name');
    }
  });

  it('object：嵌套路径定位（数组下标）', () => {
    const schema = v.object({
      items: v.array(v.object({ id: v.number(), title: v.string() })),
    });
    const bad = schema.safeParse({
      items: [
        { id: 1, title: 'ok' },
        { id: 'x', title: 1 },
      ],
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const paths = bad.error.issues.map((i) => i.path);
      expect(paths).toContainEqual(['items', 1, 'id']);
      expect(paths).toContainEqual(['items', 1, 'title']);
    }
  });

  it('record：同构值校验', () => {
    const schema = v.record(v.number({ min: 0 }));
    expect(schema.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(schema.safeParse({ a: -1 }).success).toBe(false);
    expect(schema.safeParse([1, 2]).success).toBe(false);
  });

  it('optional / nullable / union', () => {
    const profile = v.object({
      nickname: v.optional(v.string()),
      bio: v.nullable(v.string()),
      id: v.union([v.string(), v.number()]),
    });
    expect(profile.parse({ bio: null, id: 'x' })).toEqual({
      bio: null,
      id: 'x',
    });
    expect(profile.parse({ nickname: 'n', bio: 'b', id: 7 }).id).toBe(7);
    const bad = profile.safeParse({ bio: 1, id: true });
    expect(bad.success).toBe(false);
  });

  it('safeParse 返回类型化数据', () => {
    const schema = v.object({ count: v.number() });
    const result = schema.safeParse({ count: 3 });
    if (result.success) {
      expect(result.data.count).toBe(3);
    } else {
      expect.unreachable();
    }
  });
});

describe('schema 错误细节', () => {
  it('ValidationError 携带 issues 与可读路径', () => {
    const schema = v.object({ user: v.object({ age: v.number() }) });
    try {
      schema.parse({ user: { age: 'x' } });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validationError = error as ValidationError;
      expect(validationError.code).toBe('VALIDATE_FAILED');
      expect(validationError.issues[0].path).toEqual(['user', 'age']);
      expect(validationError.message).toContain('user.age');
    }
  });

  it('构造非法 schema 抛错（空枚举 / 空联合）', () => {
    expect(() => v.enum([])).toThrow();
    expect(() => v.union([])).toThrow();
  });
});
