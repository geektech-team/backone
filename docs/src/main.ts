import { createApp } from '@geektech/tsone';
import { DocsApp } from './app';
import { resolveRequest, homePage, sections } from './content';
import { docsStyles } from './styles';

/**
 * 文档站入口：按当前 URL 解析要渲染的页面，创建应用并导出。
 * - SSR（tsone build / dev）：导出 app，renderHtmlDocument 生成静态 HTML
 * - 浏览器：同一入口重新解析真实 URL，执行客户端增强（搜索过滤）
 */
const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
const { page, basePath } = resolveRequest(pathname);

const section = sections.find((candidate) =>
  candidate.pages.some((item) => item.route === page.route)
);
const sectionLabel = section ? section.packageName : 'BackOne Docs';

export const app = createApp({
  root: DocsApp,
  rootProps: { page, basePath },
  document: {
    lang: 'zh-CN',
    title:
      page.route === homePage.route
        ? 'BackOne Docs — server · utils · cli'
        : `${page.title} · ${sectionLabel} — BackOne Docs`,
    description: page.description,
    // SSR 渲染文档正文：renderHtmlDocument 渲染 document.body 而非 root
    body: {
      component: DocsApp,
      props: { page, basePath },
    },
    styles: docsStyles,
  },
});

// 浏览器端挂载文档客户端（搜索过滤）；SSR（Bun）阶段跳过。
if (typeof process === 'undefined') {
  await import('./client');
}
