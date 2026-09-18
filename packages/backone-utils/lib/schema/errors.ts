/** 校验错误 */

import { BackoneError } from '../errors';

/** 单条校验问题 */
export interface SchemaIssue {
  /** 字段路径，如 ['user', 'address', 0, 'city'] */
  path: (string | number)[];
  message: string;
}

/** 校验错误码 */
export type ValidationErrorCode = 'VALIDATE_FAILED';

/** 校验错误：携带全部问题列表，message 为可读的路径摘要 */
export class ValidationError extends BackoneError<ValidationErrorCode> {
  /** 全部校验问题（parse 可能同时命中多条） */
  readonly issues: SchemaIssue[];

  constructor(issues: SchemaIssue[]) {
    super(formatIssues(issues), 'VALIDATE_FAILED');
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

function formatIssues(issues: SchemaIssue[]): string {
  return issues
    .map((issue) => `${formatPath(issue.path)}: ${issue.message}`)
    .join('; ');
}

/** 路径数组 → 可读路径，如 ['a', 0, 'b'] → 'a[0].b' */
export function formatPath(path: (string | number)[]): string {
  return path.reduce<string>((acc, segment, index) => {
    if (index === 0) {
      return String(segment);
    }
    return typeof segment === 'number'
      ? `${acc}[${segment}]`
      : `${acc}.${segment}`;
  }, '');
}

/** 构造单条问题 */
export function issue(path: (string | number)[], message: string): SchemaIssue {
  return { path, message };
}
