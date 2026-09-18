import { describe, expect, it } from 'bun:test';
import { createJwt, Jwt, JwtError } from '../lib/jwt';

const SECRET = 'test-secret-for-hs256';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('jwt', () => {
  it('HS256 签发 / 验证往返，保留自定义载荷', async () => {
    const jwt = createJwt({ secret: SECRET });
    const token = await jwt.sign({ sub: '42', role: 'admin', name: '千御' });
    const payload = await jwt.verify(token);
    expect(payload.sub).toBe('42');
    expect(payload.role).toBe('admin');
    expect(payload.name).toBe('千御');
    expect(token.split('.')).toHaveLength(3);
  });

  it('支持 HS384 / HS512 与 Uint8Array 密钥', async () => {
    const secret = new TextEncoder().encode('bytes-secret');
    const hs384 = new Jwt({ secret, algorithm: 'HS384' });
    const token384 = await hs384.sign({ sub: '1' });
    await expect(hs384.verify(token384)).resolves.toMatchObject({ sub: '1' });

    const hs512 = new Jwt({ secret: SECRET, algorithm: 'HS512' });
    const token512 = await hs512.sign({ sub: '2' });
    await expect(hs512.verify(token512)).resolves.toMatchObject({ sub: '2' });
  });

  it('expiresIn 写入 exp；过期后抛 JWT_EXPIRED', async () => {
    const jwt = createJwt({ secret: SECRET });
    const token = await jwt.sign({ sub: '1' }, { expiresIn: 1 });
    const payload = await jwt.verify(token);
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp! - Math.floor(Date.now() / 1000)).toBeGreaterThan(0);

    await sleep(1200);
    await expect(jwt.verify(token)).rejects.toMatchObject({
      code: 'JWT_EXPIRED',
    });
  });

  it('exp 已过（负 expiresIn）立即过期', async () => {
    const jwt = createJwt({ secret: SECRET });
    const token = await jwt.sign({ sub: '1' }, { expiresIn: -10 });
    await expect(jwt.verify(token)).rejects.toMatchObject({
      code: 'JWT_EXPIRED',
    });
  });

  it('notBefore：未生效抛 JWT_NOT_YET_VALID', async () => {
    const jwt = createJwt({ secret: SECRET });
    const token = await jwt.sign({ sub: '1' }, { notBefore: 60 });
    await expect(jwt.verify(token)).rejects.toMatchObject({
      code: 'JWT_NOT_YET_VALID',
    });
  });

  it('篡改载荷导致 JWT_BAD_SIGNATURE', async () => {
    const jwt = createJwt({ secret: SECRET });
    const token = await jwt.sign({ sub: '1', role: 'user' });
    const [header, payload, signature] = token.split('.');
    const forgedPayload = base64Url(
      JSON.stringify({ sub: '1', role: 'admin' })
    );
    await expect(
      jwt.verify(`${header}.${forgedPayload}.${signature}`)
    ).rejects.toMatchObject({ code: 'JWT_BAD_SIGNATURE' });
  });

  it('密钥不匹配抛 JWT_BAD_SIGNATURE；结构非法抛 JWT_MALFORMED', async () => {
    const a = createJwt({ secret: 'secret-a' });
    const b = createJwt({ secret: 'secret-b' });
    const token = await a.sign({ sub: '1' });
    await expect(b.verify(token)).rejects.toMatchObject({
      code: 'JWT_BAD_SIGNATURE',
    });
    await expect(a.verify('not-a-jwt')).rejects.toMatchObject({
      code: 'JWT_MALFORMED',
    });
    await expect(a.verify('a.b')).rejects.toMatchObject({
      code: 'JWT_MALFORMED',
    });
  });

  it('issuer / audience 匹配与不匹配', async () => {
    const jwt = createJwt({ secret: SECRET });
    const token = await jwt.sign({ sub: '1', iss: 'city-index', aud: 'web' });
    await expect(
      jwt.verify(token, { issuer: 'city-index', audience: 'web' })
    ).resolves.toMatchObject({ iss: 'city-index' });
    await expect(
      jwt.verify(token, { issuer: 'city-index', audience: ['web', 'mini'] })
    ).resolves.toBeTruthy();
    await expect(jwt.verify(token, { issuer: 'other' })).rejects.toMatchObject({
      code: 'JWT_CLAIM_MISMATCH',
    });
    await expect(jwt.verify(token, { audience: 'mini' })).rejects.toMatchObject(
      { code: 'JWT_CLAIM_MISMATCH' }
    );
  });

  it('clockTolerance 放行轻微过期', async () => {
    const jwt = createJwt({ secret: SECRET });
    const token = await jwt.sign({ sub: '1' }, { expiresIn: -5 });
    await expect(
      jwt.verify(token, { clockTolerance: 10 })
    ).resolves.toBeTruthy();
    await expect(
      jwt.verify(token, { clockTolerance: 1 })
    ).rejects.toMatchObject({
      code: 'JWT_EXPIRED',
    });
  });

  it('错误均为 JwtError 实例且携带稳定 code', async () => {
    const jwt = createJwt({ secret: SECRET });
    const token = await jwt.sign({ sub: '1' }, { expiresIn: -1 });
    try {
      await jwt.verify(token);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(JwtError);
      expect((error as JwtError).code).toBe('JWT_EXPIRED');
    }
  });
});

/** 测试辅助：base64url 编码任意对象 */
function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
