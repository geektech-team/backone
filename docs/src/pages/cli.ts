import type { VNode } from '@geektech/tsone';
import { h } from '@geektech/tsone';
import { codeblock, h2, h3, p, table, inline, ul } from '../components';
import type { PageContext } from '../content';

export function renderCliOverview(ctx: PageContext): VNode | VNode[] {
  return [
    p(
      '@geektech/backone-cli 用一条命令创建类应用。minimal、rest-api、websocket 三个模板统一使用 Application + Module，业务代码就近放在 modules/<feature>/，通过构造函数显式组合 Controller/Gateway、Service 和 Repository。CLI 本身零运行时依赖。'
    ),
    h2('安装与运行'),
    codeblock(
      'bunx @geektech/backone-cli init my-api --template rest-api\ncd my-api\nbun run typecheck\nbun run dev',
      'sh'
    ),
    p(
      '也可 bun add -d @geektech/backone-cli 后使用 backone init。所有模板要求 Bun >=1.3.10、TypeScript >=5.2，使用标准装饰器，保持 experimentalDecorators 和 emitDecoratorMetadata 关闭。'
    ),
    h2('模板'),
    table(
      ['名称', '结构'],
      [
        [['minimal'], ['Application + HomeModule → HomeController']],
        [
          ['rest-api'],
          [
            'Application + UsersModule → Controller → Service → Repository → SQLite',
          ],
        ],
        [
          ['websocket'],
          ['Application + ChatModule → Gateway → Service + 浏览器客户端'],
        ],
      ]
    ),
    p(
      '生成应用依赖 backone，REST 额外依赖 backone-utils。两个运行时包都没有外部运行时依赖。'
    ),
    p([
      '继续阅读 ',
      h('a', { href: ctx.href('/cli/commands') }, ['命令']),
      '、',
      h('a', { href: ctx.href('/cli/templates') }, ['模板']),
      ' 和 ',
      h('a', { href: ctx.href('/backone/architecture') }, ['对象优先开发']),
      '。',
    ]),
  ];
}

export function renderCliCommands(_ctx: PageContext): VNode | VNode[] {
  return [
    h2('init'),
    codeblock('backone init <project-name> [options]', 'sh'),
    table(
      ['选项', '说明'],
      [
        [
          [inline('--template <name>')],
          [
            'minimal | rest-api | websocket。省略时交互选择；非 TTY 默认 minimal。',
          ],
        ],
        [
          [inline('--style controller')],
          [
            '可选，显式使用统一类风格，三个模板都支持。单独使用时兼容选择 rest-api。',
          ],
        ],
        [[inline('--no-install')], ['跳过 bun install。']],
      ]
    ),
    h3('示例'),
    codeblock(
      'backone init my-app\nbackone init my-api --template rest-api\nbackone init my-chat --template websocket --no-install',
      'sh'
    ),
    h3('风格迁移'),
    p(
      '所有模板已经统一为类，不再需要 --style。旧 --style functional 会在写文件前报迁移错误；改为省略该参数或使用 --style controller。框架仍支持 createServer、app.get、app.ws 等函数式 API。'
    ),
    h2('已有文件保护'),
    p(
      '目标目录已存在时仍可初始化。每个已有模板文件单独询问 Overwrite? (y/N)：y/yes 覆盖，回车保留；非 TTY 自动保留。缺失文件正常生成，模板之外的文件不会删除。迁移已有项目时请检查保留下来的旧文件。'
    ),
    h2('版本与帮助'),
    codeblock('backone --version   # 0.4.0\nbackone --help', 'sh'),
    h2('编程式 API'),
    codeblock(`import { initProject, TEMPLATES } from '@geektech/backone-cli';

const result = await initProject({
  name: 'my-api',
  template: 'rest-api',
  skipInstall: true,
  cwd: process.cwd(),
  confirmOverwrite: async (filePath) => filePath === 'README.md',
});

console.log(result.projectPath, result.template, result.installed);
const files = TEMPLATES['minimal']('another-app');
console.log(files.map((file) => file.path));`),
    ul([
      'confirmOverwrite 接受同步或异步布尔值，传入的路径相对项目根目录。省略时使用终端询问或非交互保留策略。',
      '未知模板、风格或缺少选项值时，在写入前报错。',
      '目标路径为文件，或模板文件路径已是目录时，明确报错。',
      '安装失败会保留已生成文件，提示手动运行 bun install。',
    ]),
  ];
}

export function renderCliTemplates(ctx: PageContext): VNode | VNode[] {
  return [
    p(
      '所有模板包含 package.json、tsconfig.json、README.md、.gitignore、src/index.ts 和 src/app.ts。入口创建 Application 并启动；app.ts 创建业务 Module，调用 registerModules 统一挂载。'
    ),
    h2('minimal'),
    codeblock(
      'src/\n  index.ts\n  app.ts\n  modules/home/\n    home-module.ts\n    home-controller.ts',
      'text'
    ),
    p(
      'HomeController 用 @Controller / @Get 声明 GET /，返回 Hello, BackOne!。HomeModule 用 @Module 包装，Application 创建 BackOneServer 并调用 registerModules。'
    ),
    h2('rest-api'),
    codeblock(
      'src/\n  index.ts\n  app.ts\n  modules/users/\n    users-module.ts\n    users-controller.ts\n    users-service.ts\n    users-repository.ts\n    user.ts\n    user-schema.ts\n  middlewares/request-id.ts',
      'text'
    ),
    p(
      'UsersController 负责 HTTP、校验和业务错误映射；UsersService 负责业务；UsersRepository 组合 Database/Table 操作 SQLite。UsersModule 显式组合依赖，Application 注入数据库并注册模块，没有自动扫描。'
    ),
    table(
      ['接口', '行为'],
      [
        [['GET /api/users'], ['用户列表']],
        [['GET /api/users/:id'], ['详情，未命中 404']],
        [['POST /api/users'], ['name/email 非空字符串，成功 201']],
        [['PUT /api/users/:id'], ['替换 name/email，未命中 404']],
        [['DELETE /api/users/:id'], ['删除成功 204，未命中 404']],
      ]
    ),
    p(
      '使用 @Validate / validatedBody、@Status、@Header 和 @Timeout(5000)。超时只限制响应等待，不会取消已开始的数据库操作。默认 SQLite 内存库；ApplicationOptions.databaseUrl 可配置文件持久化。DDL 使用 SQLite 语法。'
    ),
    h2('websocket'),
    codeblock(
      'src/\n  index.ts\n  app.ts\n  modules/chat/\n    chat-module.ts\n    chat-gateway.ts\n    chat-service.ts\npublic/index.html',
      'text'
    ),
    p(
      'ChatModule 用 @Module 声明网关，ChatGateway 用 @WebSocket 与 @OnOpen / @OnMessage / @OnClose 声明 /chat，注入 ChatService 维护实例内的客户端集合并广播。静态目录提供浏览器客户端，打开多个标签页即可聊天。'
    ),
    h2('不监听端口的测试'),
    codeblock(`import { Application } from './src/app';

const application = new Application({ databaseUrl: ':memory:' });
try {
  await application.initialize();
  const response = await application.server.handle(
    new Request('http://localhost/api/users')
  );
  console.log(await response.json());
} finally {
  await application.stop();
}`),
    p(
      '以上为 REST 应用。构造不监听和建表；initialize 准备资源，start 自动等待 initialize 再监听，stop 幂等释放资源。并发初始化共享结果，关闭后创建新实例。每个默认应用的内存数据隔离；相同文件路径会共享存储。'
    ),
    p([
      '更多职责、事务与状态约定见 ',
      h('a', { href: ctx.href('/backone/architecture') }, ['对象优先开发']),
      '。',
    ]),
  ];
}
