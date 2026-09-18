import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { BackoneDbError, DatabaseManager, createDatabase } from '../lib/index';

interface User {
  id: number;
  name: string;
  age: number | null;
  email: string | null;
  created_at: string;
}

const SCHEMA = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    age INTEGER,
    email TEXT,
    created_at TEXT NOT NULL
  )
`;

function seed(manager: DatabaseManager, count = 3): Promise<void> {
  const users = manager.get('main').table<User>('users');
  return users
    .insertMany(
      Array.from({ length: count }, (_, i) => ({
        name: `user-${i + 1}`,
        age: 18 + i * 2,
        email: `u${i + 1}@example.com`,
        created_at: `2026-01-0${i + 1}T00:00:00.000Z`,
      }))
    )
    .then(() => undefined);
}

describe('DatabaseManager（多库连接管理）', () => {
  let db: DatabaseManager;

  beforeAll(async () => {
    db = new DatabaseManager();
    db.register('main', { url: ':memory:' });
    db.register('audit', { url: ':memory:' });
    await db.get('main').raw(SCHEMA);
    await db.get('audit').raw(SCHEMA);
    await seed(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it('注册 / 获取 / 判断 / 列表', () => {
    expect(db.has('main')).toBe(true);
    expect(db.has('audit')).toBe(true);
    expect(db.has('missing')).toBe(false);
    expect(db.names().sort()).toEqual(['audit', 'main']);
    expect(
      db
        .list()
        .map((d) => d.name)
        .sort()
    ).toEqual(['audit', 'main']);
    expect(db.get('main').dialect).toBe('sqlite');
  });

  it('重复注册同名库抛 DB_ALREADY_REGISTERED', () => {
    expect(() => db.register('main', { url: ':memory:' })).toThrow(
      BackoneDbError
    );
    try {
      db.register('main', { url: ':memory:' });
    } catch (error) {
      expect((error as BackoneDbError).code).toBe('DB_ALREADY_REGISTERED');
    }
  });

  it('获取未注册库抛 DB_NOT_FOUND', () => {
    expect(() => db.get('nope')).toThrow(BackoneDbError);
    try {
      db.get('nope');
    } catch (error) {
      expect((error as BackoneDbError).code).toBe('DB_NOT_FOUND');
    }
  });

  it('remove 关闭并移除；close 后查询抛 DB_CLOSED', async () => {
    const standalone = new DatabaseManager();
    standalone.register('tmp', { url: ':memory:' });
    await standalone.get('tmp').raw('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    expect(await standalone.remove('tmp')).toBe(true);
    expect(await standalone.remove('tmp')).toBe(false);

    const closed = new DatabaseManager();
    const handle = closed.register('c', { url: ':memory:' });
    await closed.close();
    expect(handle.isClosed).toBe(true);
    await expect(handle.raw('SELECT 1')).rejects.toThrow(BackoneDbError);
  });
});

describe('Table 查询（增删改查）', () => {
  let db: DatabaseManager;

  beforeAll(async () => {
    db = new DatabaseManager();
    db.register('main', { url: ':memory:' });
    await db.get('main').raw(SCHEMA);
    await seed(db, 4);
  });

  afterAll(async () => {
    await db.close();
  });

  it('insert 返回含自增主键的整行', async () => {
    const users = db.get('main').table<User>('users');
    const created = await users.insert({
      name: 'newbie',
      age: 30,
      email: 'new@example.com',
      created_at: '2026-02-01T00:00:00.000Z',
    });
    expect(created).not.toBeNull();
    expect(created!.id).toBeGreaterThan(0);
    expect(created!.name).toBe('newbie');
    expect(created!.age).toBe(30);
  });

  it('insert 空对象抛 DB_EMPTY_WRITE', async () => {
    const users = db.get('main').table<User>('users');
    await expect(users.insert({} as User)).rejects.toThrow(BackoneDbError);
  });

  it('insertMany 返回全部插入行', async () => {
    const users = db.get('main').table<User>('users');
    const result = await users.insertMany([
      {
        name: 'm-a',
        age: 1,
        email: 'a@example.com',
        created_at: '2026-03-01T00:00:00.000Z',
      },
      {
        name: 'm-b',
        age: 2,
        email: 'b@example.com',
        created_at: '2026-03-02T00:00:00.000Z',
      },
    ]);
    expect(result.count).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.name)).toEqual(['m-a', 'm-b']);
  });

  it('findById / findOne / findMany 基础查询', async () => {
    const users = db.get('main').table<User>('users');
    const byId = await users.findById(1);
    expect(byId).not.toBeNull();
    expect(byId!.id).toBe(1);

    const one = await users.findOne({ where: { name: 'user-2' } });
    expect(one!.name).toBe('user-2');

    const many = await users.findMany();
    expect(many.length).toBeGreaterThanOrEqual(6);
  });

  it('limit / offset / select / orderBy', async () => {
    const users = db.get('main').table<User>('users');
    const page = await users.findMany({
      orderBy: { id: 'desc' },
      limit: 2,
      offset: 0,
    });
    expect(page).toHaveLength(2);
    expect(page[0].id).toBeGreaterThan(page[1].id);

    const projected = await users.findMany({ select: ['name'] });
    expect(Object.keys(projected[0]).sort()).toEqual(['name']);

    const multiOrder = await users.findMany({
      orderBy: [{ age: 'desc' }, { id: 'asc' }],
    });
    expect(multiOrder[0].age).toBeGreaterThanOrEqual(multiOrder[1].age);
  });

  it('where 操作符：比较 / like / in / isNull / between / ne', async () => {
    const users = db.get('main').table<User>('users');

    const gt = await users.findMany({ where: { age: { gt: 20 } } });
    expect(gt.every((u) => u.age! > 20)).toBe(true);

    const gte = await users.findMany({ where: { age: { gte: 20 } } });
    expect(gte.every((u) => u.age! >= 20)).toBe(true);

    const lt = await users.findMany({ where: { age: { lt: 20 } } });
    expect(lt.length).toBeGreaterThan(0);
    expect(lt.every((u) => u.age! < 20)).toBe(true);

    const like = await users.findMany({
      where: { email: { like: '%@example.com' } },
    });
    expect(like.length).toBeGreaterThan(0);

    const notLike = await users.findMany({
      where: { email: { notLike: '%@example.com' } },
    });
    expect(notLike).toHaveLength(0);

    const inList = await users.findMany({
      where: { name: { in: ['user-1', 'user-2'] } },
    });
    expect(inList.map((u) => u.name).sort()).toEqual(['user-1', 'user-2']);

    const notIn = await users.findMany({
      where: { name: { notIn: ['user-1', 'user-2'] } },
    });
    expect(notIn.every((u) => u.name !== 'user-1' && u.name !== 'user-2')).toBe(
      true
    );

    const inEmpty = await users.findMany({ where: { name: { in: [] } } });
    expect(inEmpty).toHaveLength(0);

    const isNull = await users.findMany({ where: { email: { isNull: true } } });
    expect(isNull).toHaveLength(0);

    const between = await users.findMany({
      where: { age: { between: [18, 22] } },
    });
    expect(between.every((u) => u.age! >= 18 && u.age! <= 22)).toBe(true);

    const ne = await users.findMany({ where: { name: { ne: 'user-1' } } });
    expect(ne.every((u) => u.name !== 'user-1')).toBe(true);
  });

  it('where 裸值 / null / AND / OR 组合', async () => {
    const users = db.get('main').table<User>('users');

    const and = await users.findMany({
      where: { name: 'user-1', age: { gte: 18 } },
    });
    expect(and.map((u) => u.name)).toEqual(['user-1']);

    const or = await users.findMany({
      where: { OR: [{ name: 'user-1' }, { name: 'user-2' }] },
    });
    expect(or.map((u) => u.name).sort()).toEqual(['user-1', 'user-2']);

    const mixed = await users.findMany({
      where: {
        age: { gte: 18 },
        OR: [{ name: { like: '%2%' } }, { name: { like: '%3%' } }],
      },
    });
    expect(mixed.every((u) => u.age! >= 18)).toBe(true);
    expect(mixed.length).toBeGreaterThan(0);

    const andGroup = await users.findMany({
      where: {
        AND: [{ age: { gte: 18 } }, { age: { lte: 22 } }],
      },
    });
    expect(andGroup.every((u) => u.age! >= 18 && u.age! <= 22)).toBe(true);

    const nullWhere = await users.findMany({ where: { email: null } });
    expect(nullWhere).toHaveLength(0);
  });

  it('count / exists', async () => {
    const users = db.get('main').table<User>('users');
    // 此前的测试累计写入：种子 user-1..4 + newbie + m-a + m-b = 7 行
    expect(await users.count()).toBe(7);
    const matched = await users.count({ name: { like: 'user-%' } });
    expect(matched).toBe(4);
    expect(await users.exists({ name: 'user-1' })).toBe(true);
    expect(await users.exists({ name: 'nobody' })).toBe(false);
  });

  it('update 返回更新后的行与匹配数', async () => {
    const users = db.get('main').table<User>('users');
    const result = await users.update(
      { age: 99, email: 'updated@example.com' },
      { name: 'user-1' }
    );
    expect(result.count).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].age).toBe(99);
    expect(result.rows[0].email).toBe('updated@example.com');

    const persisted = await users.findOne({ where: { name: 'user-1' } });
    expect(persisted!.age).toBe(99);
  });

  it('update 空 where / 空字段抛错', async () => {
    const users = db.get('main').table<User>('users');
    await expect(users.update({ age: 1 }, {})).rejects.toThrow(BackoneDbError);
    await expect(users.update({}, { name: 'user-1' })).rejects.toThrow(
      BackoneDbError
    );
  });

  it('delete 返回被删行与数量', async () => {
    const users = db.get('main').table<User>('users');
    const before = await users.count();
    const result = await users.delete({ name: { like: 'm-%' } });
    expect(result.count).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(await users.count()).toBe(before - 2);
  });

  it('delete 空 where 抛错', async () => {
    const users = db.get('main').table<User>('users');
    await expect(users.delete({})).rejects.toThrow(BackoneDbError);
  });
});

describe('事务', () => {
  let db: DatabaseManager;

  beforeAll(async () => {
    db = new DatabaseManager();
    db.register('main', { url: ':memory:' });
    await db.get('main').raw(SCHEMA);
  });

  afterAll(async () => {
    await db.close();
  });

  it('事务内多次写入原子提交', async () => {
    const users = db.get('main').table<User>('users');
    const inserted = await db.get('main').transaction(async (tx) => {
      const t = tx.table<User>('users');
      const a = await t.insert({
        name: 'tx-a',
        age: 1,
        email: null,
        created_at: '2026-04-01T00:00:00.000Z',
      });
      const b = await t.insert({
        name: 'tx-b',
        age: 2,
        email: null,
        created_at: '2026-04-02T00:00:00.000Z',
      });
      return [a, b];
    });
    expect(inserted).toHaveLength(2);
    expect(await users.count()).toBe(2);
  });

  it('事务失败自动回滚', async () => {
    const users = db.get('main').table<User>('users');
    await expect(
      db.get('main').transaction(async (tx) => {
        const t = tx.table<User>('users');
        await t.insert({
          name: 'tx-rollback',
          age: 3,
          email: null,
          created_at: '2026-04-03T00:00:00.000Z',
        });
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(await users.count()).toBe(2);
    expect(await users.exists({ name: 'tx-rollback' })).toBe(false);
  });
});

describe('多库隔离与方言', () => {
  it('两个数据库互不影响', async () => {
    const db = new DatabaseManager();
    db.register('a', { url: ':memory:' });
    db.register('b', { url: ':memory:' });
    await db.get('a').raw(SCHEMA);
    await db.get('b').raw(SCHEMA);

    const ta = db.get('a').table<User>('users');
    const tb = db.get('b').table<User>('users');
    await ta.insert({
      name: 'only-in-a',
      age: 1,
      email: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(await ta.count()).toBe(1);
    expect(await tb.count()).toBe(0);
    await db.close();
  });

  it('方言引用：mysql 反引号 / postgres 双引号 / sqlite 双引号', () => {
    const sqlite = createDatabase({ url: ':memory:' });
    const pg = new DatabaseManager();
    // 仅验证 quoteIdent，不实际连接
    expect(sqlite.quoteIdent('users')).toBe('"users"');
    expect(sqlite.quoteIdent('a"b')).toBe('"a""b"');

    const mysqlDb = createDatabase({ url: 'mysql://u:p@localhost:3306/db' });
    expect(mysqlDb.dialect).toBe('mysql');
    expect(mysqlDb.quoteIdent('users')).toBe('`users`');
    expect(mysqlDb.quoteIdent('a`b')).toBe('`a``b`');
    expect(mysqlDb.dialectSupportsReturning()).toBe(false);
    expect(sqlite.dialectSupportsReturning()).toBe(true);

    pg.register('p', { url: 'postgres://u:p@localhost:5432/db' });
    expect(pg.get('p').dialect).toBe('postgres');
    expect(pg.get('p').quoteIdent('users')).toBe('"users"');
    expect(pg.get('p').dialectSupportsReturning()).toBe(true);
    void mysqlDb.close();
    void sqlite.close();
    void pg.close();
  });

  it('postgres/mysql 缺 url 抛 DB_MISSING_URL；sqlite 缺 url 默认内存库', async () => {
    expect(() => createDatabase({ dialect: 'postgres' })).toThrow(
      BackoneDbError
    );
    const db = createDatabase({ url: 'sqlite://:memory:' });
    await db.raw('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    await db.raw('INSERT INTO t (id) VALUES (1)');
    expect(await db.raw<Array<{ id: number }>>('SELECT id FROM t')).toEqual([
      { id: 1 },
    ]);
    await db.close();
  });

  it('raw / 标签模板 query 直连底层', async () => {
    const db = createDatabase();
    await db.raw(SCHEMA);
    const id = 42;
    const inserted = await db.query<Array<{ id: number }>>(
      `INSERT INTO users (name, age, email, created_at) VALUES ('raw', ${id}, NULL, 'x') RETURNING id`
    );
    expect(inserted[0].id).toBe(1);

    const rows = await db.raw<Array<{ name: string }>>(
      'SELECT name FROM users WHERE name = ?',
      ['raw']
    );
    expect(rows).toEqual([{ name: 'raw' }]);

    // 字符串形式调用 query 等价于 raw 无参查询
    const viaQueryString = await db.query<Array<{ id: number }>>(
      'SELECT id FROM users'
    );
    expect(viaQueryString).toEqual([{ id: 1 }]);
    await db.close();
  });
});
