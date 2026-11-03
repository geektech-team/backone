import { describe, expect, it } from 'bun:test';
import { Context, createServer } from '../lib/index';
import {
  Controller,
  Get,
  Post,
  Use,
  registerControllers,
} from '../lib/decorators';
import {
  Validate,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../lib/decorators/validation';
import type { InputSchema } from '../lib/decorators/validation';

const request = (path: string, body?: string) =>
  new Request(`http://localhost${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined
      ? {}
      : { body, headers: { 'Content-Type': 'application/json' } }),
  });

describe('system validation decorators', () => {
  it('exposes parser output while retaining the raw body and path inputs', async () => {
    const body: InputSchema<{ name: string }> = {
      parse(value) {
        const input = value as { name: string };
        input.name = input.name.trim();
        return input;
      },
    };
    const params: InputSchema<{ id: number }> = {
      parse(value) {
        const input = value as { id: string };
        const id = Number(input.id);
        input.id = 'changed by parser';
        return { id };
      },
    };
    @Controller('/validated')
    class Validated {
      @Post('/:id')
      @Validate({ body, params })
      async create(ctx: Context) {
        const parsed = validatedBody(ctx, body);
        const id: number = validatedParams(ctx, params).id;
        return {
          name: parsed.name,
          id,
          rawBody: await ctx.bodyJson(),
          rawParams: ctx.params,
        };
      }
    }
    const app = createServer();
    registerControllers(app, [new Validated()]);
    const response = await app.handle(
      request('/validated/7', '{"name":"  Ada  "}')
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: 'Ada',
      id: 7,
      rawBody: { name: '  Ada  ' },
      rawParams: { id: '7' },
    });
  });

  it('keeps query strings and repeated keys intact until the parser converts them', async () => {
    const query: InputSchema<{
      page: number;
      tags: string[];
      rawPage: string;
      rawEmpty: string;
    }> = {
      parse(value) {
        const input = value as Record<string, string | string[]>;
        if (typeof input.page !== 'string' || typeof input.empty !== 'string') {
          throw new Error('Expected query strings');
        }
        return {
          page: Number(input.page),
          tags: input.tag as string[],
          rawPage: input.page,
          rawEmpty: input.empty,
        };
      },
    };
    @Controller('/query')
    class Query {
      @Get()
      @Validate({ query })
      get(ctx: Context) {
        return {
          parsed: validatedQuery(ctx, query),
          raw: ctx.query.getAll('tag'),
        };
      }
    }
    const app = createServer();
    registerControllers(app, [new Query()]);
    expect(
      await (
        await app.handle(request('/query?page=02&tag=a&tag=b&empty='))
      ).json()
    ).toEqual({
      parsed: { page: 2, tags: ['a', 'b'], rawPage: '02', rawEmpty: '' },
      raw: ['a', 'b'],
    });
  });

  it('treats special query keys as ordinary own properties', async () => {
    const schema: InputSchema<unknown> = { parse: (value) => value };
    @Controller('/special-query')
    class Query {
      @Get()
      @Validate({ query: schema })
      get(ctx: Context) {
        return validatedQuery(ctx, schema);
      }
    }
    const app = createServer();
    registerControllers(app, [new Query()]);
    expect(
      await (
        await app.handle(
          request('/special-query?__proto__=one&__proto__=two&constructor=x')
        )
      ).json()
    ).toEqual({ ['__proto__']: ['one', 'two'], constructor: 'x' });
  });

  it('returns 400 for malformed JSON before calling a parser or business method', async () => {
    let parsed = false;
    let handled = false;
    @Controller('/malformed')
    class Malformed {
      @Post()
      @Validate({
        body: {
          parse(value) {
            parsed = true;
            return value;
          },
        },
      })
      create() {
        handled = true;
        return 'unexpected';
      }
    }
    const app = createServer();
    registerControllers(app, [new Malformed()]);
    expect((await app.handle(request('/malformed', '{'))).status).toBe(400);
    expect(parsed).toBe(false);
    expect(handled).toBe(false);
  });

  it('returns 400 for a failing schema without running the handler', async () => {
    for (const source of ['body', 'query', 'params'] as const) {
      let handled = false;
      @Controller('/invalid')
      class Invalid {
        @Post('/:id')
        @Validate({
          [source]: {
            parse() {
              throw new Error('Input rejected');
            },
          },
        })
        create() {
          handled = true;
          return 'unexpected';
        }
      }
      const app = createServer();
      registerControllers(app, [new Invalid()]);
      const response = await app.handle(request('/invalid/7', '{}'));
      expect(response.status).toBe(400);
      expect(handled).toBe(false);
    }
  });

  it('retains each matching schema result across class and method validation', async () => {
    const first: InputSchema<string> = { parse: () => 'first' };
    const second: InputSchema<string> = { parse: () => 'second' };
    @Controller('/schemas')
    @Validate({ query: first })
    class Schemas {
      @Get()
      @Validate({ query: second })
      get(ctx: Context) {
        return [validatedQuery(ctx, first), validatedQuery(ctx, second)];
      }
    }
    const app = createServer();
    registerControllers(app, [new Schemas()]);
    expect(await (await app.handle(request('/schemas'))).json()).toEqual([
      'first',
      'second',
    ]);
  });

  it('distinguishes a successful undefined result from missing validation', async () => {
    const schema: InputSchema<undefined> = { parse: () => undefined };
    @Controller('/undefined')
    class UndefinedResult {
      @Get()
      @Validate({ query: schema })
      get(ctx: Context) {
        return { present: validatedQuery(ctx, schema) === undefined };
      }
    }
    const app = createServer();
    registerControllers(app, [new UndefinedResult()]);
    expect(await (await app.handle(request('/undefined'))).json()).toEqual({
      present: true,
    });
  });

  it('rejects helper calls without the matching request, source and schema', async () => {
    const schema: InputSchema<string> = { parse: () => 'validated' };
    const other: InputSchema<string> = { parse: () => 'other' };
    const empty = new Context(request('/empty'));
    for (const read of [validatedBody, validatedQuery, validatedParams]) {
      expect(() => read(empty, schema)).toThrow(/validat/i);
    }
    @Controller('/missing-schema')
    class MissingSchema {
      @Get()
      @Validate({ query: schema })
      get(ctx: Context) {
        expect(() => validatedQuery(ctx, other)).toThrow(/validat/i);
        expect(() => validatedBody(ctx, schema)).toThrow(/validat/i);
        return validatedQuery(ctx, schema);
      }
    }
    const app = createServer();
    registerControllers(app, [new MissingSchema()]);
    expect(await (await app.handle(request('/missing-schema'))).text()).toBe(
      'validated'
    );
    expect(() => validatedQuery(empty, schema)).toThrow(/validat/i);
  });

  it('allows an outer Use middleware to short circuit before validation', async () => {
    @Controller('/short-circuit')
    @Validate({
      query: {
        parse() {
          throw new Error('Must not parse');
        },
      },
    })
    class ShortCircuit {
      @Get()
      @Use(() => new Response('blocked', { status: 401 }))
      get() {
        throw new Error('Must not execute');
      }
    }
    const app = createServer();
    registerControllers(app, [new ShortCircuit()]);
    const response = await app.handle(request('/short-circuit'));
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('blocked');
  });
});
