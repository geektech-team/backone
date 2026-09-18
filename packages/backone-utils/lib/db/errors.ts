/** BackOne 工具包数据库错误 */

import { BackoneError } from '../errors';

export type DbErrorCode =
  | 'DB_ERROR'
  | 'DB_ALREADY_REGISTERED'
  | 'DB_NOT_FOUND'
  | 'DB_CLOSED'
  | 'DB_MISSING_URL'
  | 'DB_EMPTY_WRITE'
  | 'DB_EMPTY_WHERE';

export class BackoneDbError extends BackoneError<DbErrorCode> {
  constructor(message: string, code: DbErrorCode = 'DB_ERROR') {
    super(message, code);
    this.name = 'BackoneDbError';
  }
}
