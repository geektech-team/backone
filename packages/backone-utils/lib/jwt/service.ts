/**
 * JWT 服务：HMAC 签名与验证（HS256 / HS384 / HS512）。
 *
 * 全部基于 WebCrypto（crypto.subtle），零运行时依赖；签名比较使用
 * subtle.verify，天然防时序侧信道。
 */

import { JwtError } from './errors';
import type {
  JwtAlgorithm,
  JwtHeader,
  JwtPayload,
  JwtSignOptions,
  JwtVerifyOptions,
} from './types';

/** 算法 → WebCrypto 哈希名 */
const HASH_ALGORITHMS: Record<JwtAlgorithm, string> = {
  HS256: 'SHA-256',
  HS384: 'SHA-384',
  HS512: 'SHA-512',
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** base64url 编码（无 padding） */
function base64UrlEncode(input: Uint8Array): string {
  let binary = '';
  for (const byte of input) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** base64url 解码 */
function base64UrlDecode(input: string): Uint8Array {
  const padded = `${input.replace(/-/g, '+').replace(/_/g, '/')}${'='.repeat(
    (4 - (input.length % 4)) % 4
  )}`;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function importKey(
  secret: string | Uint8Array,
  hash: string
): Promise<CryptoKey> {
  // 拷贝为 ArrayBuffer 支撑的新视图，满足 WebCrypto BufferSource 类型约束
  const keyData = new Uint8Array(
    typeof secret === 'string' ? encoder.encode(secret) : secret
  );
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash },
    false,
    ['sign', 'verify']
  );
}

/** JWT 服务：签发与验证 */
export class Jwt {
  readonly #secret: string | Uint8Array;
  readonly #algorithm: JwtAlgorithm;

  constructor(options: {
    /** HMAC 密钥（服务端保管，勿泄露） */
    secret: string | Uint8Array;
    /** 默认签名算法，默认 HS256 */
    algorithm?: JwtAlgorithm;
  }) {
    this.#secret = options.secret;
    this.#algorithm = options.algorithm ?? 'HS256';
  }

  /**
   * 签发 JWT。`expiresIn` / `notBefore` 为相对当前时间的秒数，
   * 自动写入 exp / nbf 声明。
   */
  async sign(
    payload: JwtPayload,
    options: JwtSignOptions = {}
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const algorithm = options.algorithm ?? this.#algorithm;
    const claims: JwtPayload = { ...payload };

    if (options.expiresIn !== undefined) {
      claims.exp = now + options.expiresIn;
    }
    if (options.notBefore !== undefined) {
      claims.nbf = now + options.notBefore;
    }

    const header: JwtHeader = { alg: algorithm, typ: 'JWT' };
    const headerPart = base64UrlEncode(encoder.encode(JSON.stringify(header)));
    const payloadPart = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
    const signingInput = `${headerPart}.${payloadPart}`;

    const key = await importKey(this.#secret, HASH_ALGORITHMS[algorithm]);
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(signingInput)
    );

    return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
  }

  /**
   * 验证 JWT：结构、签名、exp / nbf 时间声明，以及可选的 issuer /
   * audience 匹配。失败抛出携带稳定 code 的 JwtError，成功返回载荷。
   */
  async verify(
    token: string,
    options: JwtVerifyOptions = {}
  ): Promise<JwtPayload> {
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => part === '')) {
      throw new JwtError('malformed token', 'JWT_MALFORMED');
    }
    const [headerPart, payloadPart, signaturePart] = parts;

    let header: JwtHeader;
    try {
      header = JSON.parse(decoder.decode(base64UrlDecode(headerPart)));
    } catch {
      throw new JwtError('invalid header', 'JWT_MALFORMED');
    }
    if (header.typ !== 'JWT' || !(header.alg in HASH_ALGORITHMS)) {
      throw new JwtError('unsupported header', 'JWT_MALFORMED');
    }

    let payload: JwtPayload;
    try {
      payload = JSON.parse(decoder.decode(base64UrlDecode(payloadPart)));
    } catch {
      throw new JwtError('invalid payload', 'JWT_MALFORMED');
    }

    const signingInput = encoder.encode(`${headerPart}.${payloadPart}`);
    const signature = new Uint8Array(base64UrlDecode(signaturePart));
    const key = await importKey(this.#secret, HASH_ALGORITHMS[header.alg]);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      signingInput
    );
    if (!valid) {
      throw new JwtError('invalid signature', 'JWT_BAD_SIGNATURE');
    }

    const now = Math.floor(Date.now() / 1000);
    const tolerance = options.clockTolerance ?? 0;
    // 容差用于吸收签发方 / 校验方时钟偏差：过期判定放宽 tolerance 秒
    if (typeof payload.exp === 'number' && payload.exp <= now - tolerance) {
      throw new JwtError('token expired', 'JWT_EXPIRED');
    }
    if (typeof payload.nbf === 'number' && payload.nbf > now + tolerance) {
      throw new JwtError('token not yet valid', 'JWT_NOT_YET_VALID');
    }

    if (options.issuer !== undefined && payload.iss !== options.issuer) {
      throw new JwtError('issuer mismatch', 'JWT_CLAIM_MISMATCH');
    }
    if (options.audience !== undefined) {
      const expected = Array.isArray(options.audience)
        ? options.audience
        : [options.audience];
      const actual =
        typeof payload.aud === 'string' ? [payload.aud] : (payload.aud ?? []);
      const matched = actual.some((aud) => expected.includes(aud));
      if (!matched) {
        throw new JwtError('audience mismatch', 'JWT_CLAIM_MISMATCH');
      }
    }

    return payload;
  }
}
