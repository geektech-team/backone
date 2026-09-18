/** JWT 错误 */

import { BackoneError } from '../errors';

export type JwtErrorCode =
  | 'JWT_MALFORMED'
  | 'JWT_BAD_SIGNATURE'
  | 'JWT_EXPIRED'
  | 'JWT_NOT_YET_VALID'
  | 'JWT_CLAIM_MISMATCH';

/** JWT 错误（签名 / 结构 / 时间与声明校验失败） */
export class JwtError extends BackoneError<JwtErrorCode> {
  constructor(message: string, code: JwtErrorCode) {
    super(message, code);
    this.name = 'JwtError';
  }
}
