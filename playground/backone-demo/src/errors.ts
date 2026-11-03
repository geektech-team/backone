export type DemoErrorCode =
  'NOT_FOUND' | 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'RATE_LIMITED';

/** 与 HTTP 无关的业务错误，Controller 管线负责传输协议映射。 */
export class DemoError extends Error {
  constructor(
    readonly code: DemoErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DemoError';
  }
}
