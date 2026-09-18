/** JWT 工具统一出口 */

import type { JwtAlgorithm } from './types';
import { Jwt } from './service';

export type {
  JwtAlgorithm,
  JwtHeader,
  JwtPayload,
  JwtSignOptions,
  JwtVerifyOptions,
} from './types';
export { JwtError, type JwtErrorCode } from './errors';
export { Jwt } from './service';

/**
 * 创建 JWT 服务。
 *
 * ```ts
 * const jwt = createJwt({ secret: process.env.JWT_SECRET });
 * const token = await jwt.sign({ sub: '42', role: 'admin' }, { expiresIn: 3600 });
 * const payload = await jwt.verify(token, { issuer: 'city-index' });
 * ```
 */
export function createJwt(options: {
  secret: string | Uint8Array;
  algorithm?: JwtAlgorithm;
}): Jwt {
  return new Jwt(options);
}
