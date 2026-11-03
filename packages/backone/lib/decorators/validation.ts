import type { Context } from '../context';
import { HttpError } from '../errors';
import type { Handler } from '../types';
import { policyDecorator } from './metadata';
import type { SystemDecorator } from './metadata';

/** 兼容任意提供同步 parse 方法的 schema，无运行时依赖。 */
export interface InputSchema<T> {
  parse(value: unknown): T;
}

export interface ValidateOptions {
  body?: InputSchema<unknown>;
  query?: InputSchema<unknown>;
  params?: InputSchema<unknown>;
}

type Source = keyof ValidateOptions;
type Results = Partial<Record<Source, Map<InputSchema<unknown>, unknown>>>;

const validated = new WeakMap<Context, Results>();

function parseQuery(ctx: Context): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = Object.create(null);
  for (const [key, value] of ctx.query) {
    const previous = query[key];
    query[key] =
      previous === undefined
        ? value
        : Array.isArray(previous)
          ? [...previous, value]
          : [previous, value];
  }
  return query;
}

function readValidated<T>(
  ctx: Context,
  schema: InputSchema<T>,
  source: Source
): T {
  const results = validated.get(ctx)?.[source];
  if (results === undefined || !results.has(schema)) {
    throw new Error(
      `No validated ${source} for this schema; apply @Validate with the matching schema first`
    );
  }
  return results.get(schema) as T;
}

export function validatedBody<T>(ctx: Context, schema: InputSchema<T>): T {
  return readValidated(ctx, schema, 'body');
}

export function validatedQuery<T>(ctx: Context, schema: InputSchema<T>): T {
  return readValidated(ctx, schema, 'query');
}

export function validatedParams<T>(ctx: Context, schema: InputSchema<T>): T {
  return readValidated(ctx, schema, 'params');
}

/** 校验结果按请求、输入来源和 schema 身份隔离，不替换 Context 原始输入。 */
export function Validate(options: ValidateOptions): SystemDecorator {
  const entries = Object.entries(options) as [Source, InputSchema<unknown>][];
  const handler: Handler = async (ctx, next) => {
    let results = validated.get(ctx);
    if (results === undefined) {
      results = {};
      validated.set(ctx, results);
    }
    for (const [source, schema] of entries) {
      if (schema === undefined) continue;
      const input =
        source === 'body'
          ? structuredClone(await ctx.bodyJson())
          : source === 'query'
            ? parseQuery(ctx)
            : { ...ctx.params };
      let output: unknown;
      try {
        output = schema.parse(input);
      } catch (cause) {
        throw new HttpError(400, `Invalid ${source}`, { cause });
      }
      let sourceResults = results[source];
      if (sourceResults === undefined) {
        sourceResults = new Map();
        results[source] = sourceResults;
      }
      sourceResults.set(schema, output);
    }
    return next();
  };
  return policyDecorator({ phase: 'validate', handler, httpOnly: true });
}
