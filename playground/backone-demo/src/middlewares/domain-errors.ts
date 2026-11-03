import { HttpError, type Middleware } from '@geektech/backone';
import { DemoError, type DemoErrorCode } from '../errors';

const HTTP_STATUS: Record<DemoErrorCode, number> = {
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  RATE_LIMITED: 429,
};

export const domainErrors: Middleware = async (_ctx, next) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof DemoError)
      throw new HttpError(HTTP_STATUS[error.code], error.message);
    throw error;
  }
};
