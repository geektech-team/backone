import type { VNode } from '@geektech/tsone';
import { h } from '@geektech/tsone';
import { codeblock, h2, p, hr } from '../components';
import type { PageContext } from '../content';

export function renderHome(ctx: PageContext): VNode {
  return h('div', {}, [
    h('section', { className: 'docs-hero' }, [
      h('div', { className: 'docs-eyebrow' }, [
        'Bun-first · zero runtime dependencies',
      ]),
      h('h1', { className: 'docs-hero-title' }, ['BackOne 服务端生态']),
      h('p', { className: 'docs-hero-copy' }, [
        'BackOne 是一套完全基于 TypeScript 与 Bun 的服务端开发生态：轻量级框架 ',
        h('code', {}, ['@geektech/backone']),
        '、通用工具包 ',
        h('code', {}, ['@geektech/backone-utils']),
        ' 与脚手架 CLI ',
        h('code', {}, ['@geektech/backone-cli']),
        '，全部零运行时依赖，让服务端开发保持在 TypeScript 的一个语言系统里。',
      ]),
    ]),
    h('div', { className: 'docs-home-grid' }, [
      h('a', { className: 'docs-home-card', href: ctx.href('/backone') }, [
        h('div', { className: 'docs-home-card-title' }, ['BackOne 框架']),
        h('div', { className: 'docs-home-card-pkg' }, ['@geektech/backone']),
        h('p', { className: 'docs-home-card-desc' }, [
          'Bun 原生服务端框架：分段基数树路由、洋葱模型中间件、请求上下文、静态文件与 WebSocket。',
        ]),
        h('span', { className: 'docs-home-card-link' }, ['阅读文档 →']),
      ]),
      h('a', { className: 'docs-home-card', href: ctx.href('/utils') }, [
        h('div', { className: 'docs-home-card-title' }, ['BackOne Utils']),
        h('div', { className: 'docs-home-card-pkg' }, [
          '@geektech/backone-utils',
        ]),
        h('p', { className: 'docs-home-card-desc' }, [
          '通用工具包：多库 CRUD、ID 生成、缓存、JWT、HTTP 客户端、限流、Schema 校验与全局配置。',
        ]),
        h('span', { className: 'docs-home-card-link' }, ['阅读文档 →']),
      ]),
      h('a', { className: 'docs-home-card', href: ctx.href('/cli') }, [
        h('div', { className: 'docs-home-card-title' }, ['BackOne CLI']),
        h('div', { className: 'docs-home-card-pkg' }, [
          '@geektech/backone-cli',
        ]),
        h('p', { className: 'docs-home-card-desc' }, [
          'Bun-native 脚手架：一条命令生成 minimal / rest-api / websocket 三种项目模板。',
        ]),
        h('span', { className: 'docs-home-card-link' }, ['阅读文档 →']),
      ]),
    ]),
    hr(),
    h('div', { className: 'docs-quickstart' }, [
      h2('快速开始'),
      p([
        '安装框架（需要 Bun ',
        h('code', {}, ['>= 1.3.0']),
        '），三个包全部发布在 npm：',
      ]),
      codeblock(
        'bun add @geektech/backone\nbun add @geektech/backone-utils\nbun add -d @geektech/backone-cli'
      ),
      p(['第一个服务只有几行：']),
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
      p([
        '运行 ',
        h('code', {}, ['bun src/index.ts']),
        ' 后访问 ',
        h('code', {}, ['http://127.0.0.1:3000']),
        ' 即可看到响应。更多内容见各包文档。',
      ]),
    ]),
    h('div', { className: 'docs-footer' }, [
      'BackOne Docs · 由 TSone 框架驱动的静态文档站，源码见 ',
      h('a', { href: 'https://github.com/geektech-team/backone' }, [
        'geektech-team/backone',
      ]),
      '。',
    ]),
  ]);
}
