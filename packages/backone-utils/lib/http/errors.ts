/** HTTP 客户端错误 */

import { BackoneError } from '../errors';

export type HttpErrorCode =
  | 'HTTP_NETWORK'
  | 'HTTP_TIMEOUT'
  | 'HTTP_ABORTED'
  | 'HTTP_STATUS'
  | 'HTTP_BAD_RESPONSE';

/** HTTP 客户端错误（网络 / 超时 / 取消 / 非 2xx / 响应解析失败） */
export class HttpError extends BackoneError<HttpErrorCode> {
  /** HTTP 状态码；非 HTTP 响应类错误为 0 */
  readonly status: number;

  constructor(message: string, code: HttpErrorCode, status = 0) {
    super(message, code);
    this.name = 'HttpError';
    this.status = status;
  }
}
