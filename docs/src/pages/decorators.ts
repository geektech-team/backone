import type { VNode } from '@geektech/tsone';
import { codeblock, h2, inline, p, table, ul } from '../components';

export function renderBackoneDecorators(): VNode | VNode[] {
  return [
    p([
      '通过可选入口 ',
      inline('@geektech/backone/decorators'),
      ' 使用标准装饰器组织业务路由，零运行时依赖。装饰器记录声明，显式注册时绑定实例方法并复用现有路由、中间件与响应序列化。',
    ]),
    h2('快速开始'),
    codeblock(`import { createServer, type Context } from '@geektech/backone';
import { Controller, Get, Use, registerControllers } from '@geektech/backone/decorators';

@Controller('/users')
@Use((ctx, next) => {
  ctx.set('x-request-id', crypto.randomUUID());
  return next();
})
class UsersController {
  @Get('/:id')
  detail(ctx: Context) {
    return { id: ctx.params.id };
  }
}

const app = createServer();
app.usePrefix('/api', (api) => {
  const routes = registerControllers(api, [new UsersController()]);
  console.table(routes); // GET /api/users/:id
});
await app.listen();`),
    h2('API'),
    table(
      ['API', '说明'],
      [
        [
          [inline('@Controller(prefix = "")')],
          ['声明 Controller 前缀，与当前 app.prefix 叠加。'],
        ],
        [
          [
            inline(
              '@Get/@Post/@Put/@Patch/@Delete/@Options/@Head/@All(path = "")'
            ),
          ],
          ['声明公开实例方法的路由；可在同一方法声明多个不同路由。'],
        ],
        [
          [inline('@Use(...middlewares)')],
          ['可用于类和方法，参数与 app.use() 共用 Middleware 类型。'],
        ],
        [
          [inline('registerControllers(app, instances)')],
          [
            '显式传入已创建的实例，返回本批只读路由清单：method、path、controller、handler。',
          ],
        ],
      ]
    ),
    h2('顺序与生命周期'),
    ul([
      [
        '进入顺序：全局中间件 → 基类中间件 → 当前类中间件 → 方法中间件 → 方法；返回时反向退出。',
      ],
      [
        '多个 @Use 从上到下进入，单个 @Use(a, b) 从左到右进入，支持提前返回 Response。',
      ],
      [
        '实例及其构造函数依赖由业务端创建并复用；将每个请求的数据保存在 ctx，避免保存在实例字段。',
      ],
      [
        '方法调用绑定原实例，支持 this 和私有依赖。返回对象自动转 JSON，HttpError 沿用现有错误处理。',
      ],
      [
        '构造函数中的方法 bind 保留原型路由声明。继承方法会注册；派生类同名原型方法覆盖会隐藏基类路由，覆盖后需重新声明装饰器；派生类需显式 @Controller，类中间件按基类优先合并。',
      ],
    ]),
    h2('注册校验'),
    ul([
      ['先校验整个批次，再注册路由；失败时本批路由均不生效。'],
      [
        '同一 app 通过本入口注册的相同 HTTP 方法和匹配路径会报错；参数名与多余斜线不会绕过重复检查，不同 app 独立。',
      ],
      [
        '共享动态路径段需使用相同参数名，例如 /users/:id/view 与 /users/:id/edit，避免路由树覆盖参数名。',
      ],
      [
        '重复检查覆盖装饰器注册范围；与函数式路由混用时，业务端需确保路径不冲突。',
      ],
      [
        '仅支持公开实例方法；static、#private 方法、包含 query/hash 的路径会报错。',
      ],
    ]),
    h2('环境要求'),
    p([
      '直接运行标准装饰器源码要求 Bun ',
      inline('>=1.3.10'),
      '、TypeScript >=5.0。保持 experimentalDecorators 和 emitDecoratorMetadata 关闭；使用 ctx 读取参数。',
    ]),
    p([
      '在当前 Bun 1.4.0 上，装饰过的方法直接更新 #private 字段会触发转译错误；将此类更新放入 service 或未装饰的方法。私有依赖读取和实例方法绑定已通过测试。',
    ]),
    h2('CLI 与演练'),
    codeblock('backone init my-api --template rest-api --style controller'),
    p([
      '模板包含 app 工厂、controllers、services、middlewares 与 CRUD；可通过 app.handle(new Request(...)) 测试而无需监听端口。',
    ]),
    p([
      '本仓库运行 bun run dev 后，可访问 /controller-api/users 与 /controller-api/users/:id，POST 接受带 name 的 JSON。',
    ]),
  ];
}
