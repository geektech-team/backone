import type { VNode } from '@geektech/tsone';
import { h } from '@geektech/tsone';
import {
  codeblock,
  h2,
  h3,
  p,
  ul,
  table,
  callout,
  inline,
  hr,
} from '../components';
import type { PageContext } from '../content';

/* ------------------------------------------------------------------ */
/* 概览                                                                 */
/* ------------------------------------------------------------------ */

export function renderCliOverview(ctx: PageContext): VNode | VNode[] {
  return [
    p([
      '@geektech/backone-cli 是 BackOne 的脚手架 CLI：一条命令生成可运行的 BackOne 项目骨架，内置 minimal / rest-api / websocket 三种模板。完全基于 Bun 构建（Bun-native），同时暴露编程式 API 便于脚本化使用。',
    ]),
    h2('安装'),
    codeblock('bun add -d @geektech/backone-cli'),
    p(['或全局安装后直接使用：']),
    codeblock('bun add -g @geektech/backone-cli'),
    h2('命令一览'),
    table(
      ['命令', '说明'],
      [
        [[inline('backone init <name>')], ['创建新项目（可交互选择模板）']],
        [[inline('backone --version / -v')], ['版本号']],
        [[inline('backone --help / -h')], ['帮助信息']],
      ]
    ),
    h2('快速开始'),
    codeblock(
      [
        'backone init my-app',
        'cd my-app',
        'bun run dev',
        '',
        '# 或跳过交互，直接指定模板',
        'backone init my-api --template rest-api --no-install',
      ].join('\n')
    ),
    p([
      '项目生成后，',
      inline('bun run dev'),
      ' 即启动带热重载的开发服务（详见 ',
      h('a', { href: ctx.href('/cli/commands') }, ['命令']),
      ' 与 ',
      h('a', { href: ctx.href('/cli/templates') }, ['项目模板']),
      '）。',
    ]),
    hr(),
    p([
      'CLI 生成的模板依赖 ',
      inline('@geektech/backone'),
      '（caret 范围），零额外运行时依赖。',
    ]),
  ];
}

/* ------------------------------------------------------------------ */
/* 命令                                                                 */
/* ------------------------------------------------------------------ */

export function renderCliCommands(_ctx: PageContext): VNode | VNode[] {
  return [
    h2('init'),
    p(['创建新的 BackOne 项目骨架：']),
    codeblock('backone init <project-name> [options]'),
    table(
      ['选项', '说明'],
      [
        [
          [inline('--template <name>')],
          [
            '指定模板：minimal | rest-api | websocket（缺省时交互式选择，非 TTY 默认 minimal）',
          ],
        ],
        [[inline('--no-install')], ['跳过 bun install']],
      ]
    ),
    h3('交互式模板选择'),
    p([
      '不带 ',
      inline('--template'),
      ' 参数且处于终端（TTY）时，会提示选择模板：',
    ]),
    codeblock(
      [
        '$ backone init my-app',
        'Select a template:',
        '  1. Minimal — single route, zero extras',
        '  2. REST API — CRUD example with route groups and middleware',
        '  3. WebSocket — real-time chat with browser client',
        'Enter choice (1-3, default 1): ',
      ].join('\n'),
      'text'
    ),
    h2('版本与帮助'),
    codeblock(
      [
        'backone --version   # 0.2.0',
        'backone --help',
        '',
        'Usage:',
        '  backone init <project-name> [options]  Create a new BackOne project',
        '  backone --version                        Show version',
        '  backone --help                           Show this help',
        '',
        'Options:',
        '  --template <name>   Template: minimal | rest-api | websocket',
        '  --no-install        Skip bun install',
      ].join('\n'),
      'text'
    ),
    h2('编程式 API'),
    p(['initProject 支持脚本化创建项目，便于自动化与测试：']),
    codeblock(
      [
        "import { initProject, TEMPLATES } from '@geektech/backone-cli';",
        '',
        'const result = await initProject({',
        "  name: 'my-app',",
        "  template: 'rest-api',",
        '  skipInstall: true,',
        '});',
        '',
        'result.projectPath; // 项目绝对路径',
        'result.template;    // "rest-api"',
        'result.installed;   // false（跳过安装）',
      ].join('\n')
    ),
    h2('行为约定'),
    ul([
      ['目标目录已存在时抛出错误，不覆盖已有文件。'],
      ['模板文件内容中 ', inline('{{name}}'), ' 占位会被替换为项目名。'],
      ['依赖安装失败时打印警告，不阻断项目生成。'],
    ]),
  ];
}

/* ------------------------------------------------------------------ */
/* 项目模板                                                              */
/* ------------------------------------------------------------------ */

export function renderCliTemplates(_ctx: PageContext): VNode | VNode[] {
  return [
    p([
      'CLI 内置三种项目模板，均生成 ',
      inline('package.json'),
      ' / ',
      inline('tsconfig.json'),
      ' / ',
      inline('src/index.ts'),
      ' / ',
      inline('README.md'),
      ' / ',
      inline('.gitignore'),
      '，并依赖 ',
      inline('@geektech/backone'),
      '。',
    ]),
    h2('模板一览'),
    table(
      ['模板', '描述', '生成内容'],
      [
        [
          [inline('minimal')],
          ['最小骨架：单路由，零额外内容'],
          ['src/index.ts：createServer + 一个 GET 路由'],
        ],
        [
          [inline('rest-api')],
          ['REST API：路由组 + 中间件 + CRUD 示例'],
          ['内存用户表 + GET/POST/DELETE 接口'],
        ],
        [
          [inline('websocket')],
          ['WebSocket 实时聊天 + 浏览器客户端'],
          ['/chat 广播 + public/index.html 聊天 UI'],
        ],
      ]
    ),
    h2('minimal'),
    p(['最小骨架，适合作为新项目起点：']),
    codeblock(
      [
        "import { createServer } from '@geektech/backone';",
        '',
        'const app = createServer({ port: 3000 });',
        '',
        "app.get('/', () => 'Hello, BackOne!');",
        '',
        'const port = await app.listen();',
        'console.log(`Server running at http://127.0.0.1:${port}`);',
      ].join('\n')
    ),
    h2('rest-api'),
    p(['REST API 模板演示路由组、路径参数、请求体与 HttpError 的完整用法：']),
    codeblock(
      [
        "import { createServer, HttpError } from '@geektech/backone';",
        '',
        'const app = createServer({ port: 3000, development: true });',
        'app.useLogger();',
        'app.useCors();',
        '',
        "app.group('/api', (api) => {",
        "  api.get('/users', () => users);",
        "  api.get<{ id: string }>('/users/:id', (ctx) => {",
        '    const user = users.find((u) => u.id === Number(ctx.params.id));',
        "    if (!user) throw new HttpError(404, 'User not found');",
        '    return user;',
        '  });',
        '',
        "  api.post('/users', async (ctx) => {",
        '    const body = await ctx.bodyJson<{ name: string; email: string }>();',
        '    const user = { id: nextId++, ...body };',
        '    users.push(user);',
        '    return ctx.json(user, 201);',
        '  });',
        '',
        "  api.delete<{ id: string }>('/users/:id', (ctx) => {",
        '    const idx = users.findIndex((u) => u.id === Number(ctx.params.id));',
        "    if (idx === -1) throw new HttpError(404, 'User not found');",
        '    users.splice(idx, 1);',
        '    return ctx.noContent();',
        '  });',
        '});',
      ].join('\n')
    ),
    h2('websocket'),
    p([
      'WebSocket 模板包含服务端广播与浏览器聊天 UI（',
      inline('public/index.html'),
      '，由 ',
      inline('serveStatic'),
      ' 托管）：',
    ]),
    codeblock(
      [
        "import { createServer } from '@geektech/backone';",
        "import type { BackOneWebSocket } from '@geektech/backone';",
        '',
        'const app = createServer({ port: 3000, development: true });',
        '',
        "app.serveStatic('/', './public');",
        '',
        'const clients = new Set<BackOneWebSocket>();',
        '',
        "app.ws('/chat', {",
        '  open(ws) { clients.add(ws); broadcast(`System: joined (${clients.size} online)`); },',
        '  message(_ws, message) { broadcast(`User: ${String(message)}`); },',
        '  close(ws) { clients.delete(ws); broadcast(`System: left (${clients.size} online)`); },',
        '});',
        '',
        'function broadcast(message: string) {',
        '  for (const client of clients) client.send(message);',
        '}',
      ].join('\n')
    ),
    callout(
      '提示',
      p([
        '打开多个浏览器标签页访问 ',
        inline('http://127.0.0.1:3000'),
        ' 即可体验实时聊天。',
      ]),
      'tip'
    ),
  ];
}
