import { Component, type VNode } from '@geektech/tsone';
import { h } from '@geektech/tsone';
import {
  sections,
  homePage,
  createPageContext,
  pageHref,
  type DocPage,
  type DocSection,
} from './content';

export interface DocsAppProps {
  page: DocPage;
  basePath: string;
}

/** 全站导航顺序：首页 + 各 section 页面（用于上一页 / 下一页） */
const navOrder = [homePage, ...sections.flatMap((section) => section.pages)];

export class DocsApp extends Component<DocsAppProps> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {}

  protected render(): VNode {
    const { page, basePath } = this.props;
    const ctx = createPageContext(basePath);
    const section = this.resolveSection(page);

    return h('div', { className: 'docs-shell' }, [
      this.renderTopbar(basePath),
      h('div', { className: 'docs-layout' }, [
        this.renderSidebar(page, basePath),
        this.renderMain(page, section, basePath, ctx),
      ]),
    ]);
  }

  private resolveSection(page: DocPage) {
    return sections.find((section) =>
      section.pages.some((candidate) => candidate.route === page.route)
    );
  }

  private renderTopbar(basePath: string): VNode {
    return h('header', { className: 'docs-topbar' }, [
      h('a', { className: 'docs-brand', href: pageHref(basePath, '/') }, [
        h('span', { className: 'docs-brand-mark' }, ['B']),
        h('span', {}, ['BackOne Docs']),
        h('span', { className: 'docs-brand-sub' }, ['server · utils · cli']),
      ]),
      h('div', { className: 'docs-tools' }, [
        h('span', { className: 'docs-badge' }, ['Bun-native']),
        h(
          'a',
          {
            className: 'docs-link',
            href: 'https://github.com/geektech-team/backone',
          },
          ['GitHub ↗']
        ),
      ]),
    ]);
  }

  private renderSidebar(page: DocPage, basePath: string): VNode {
    return h('aside', { className: 'docs-sidebar' }, [
      h('div', { className: 'docs-search' }, [
        h('input', {
          className: 'docs-search-input',
          type: 'search',
          placeholder: '搜索文档…',
          'data-docs-search': '',
        }),
      ]),
      h('nav', { className: 'docs-nav', 'data-docs-nav': '' }, [
        h(
          'a',
          {
            className:
              page.route === homePage.route
                ? 'docs-nav-item docs-nav-item-active'
                : 'docs-nav-item',
            href: pageHref(basePath, homePage.route),
            'data-docs-nav-title': homePage.title,
          },
          [homePage.title]
        ),
        ...sections.map((section) =>
          h(
            'div',
            { className: 'docs-nav-section', 'data-docs-section': section.id },
            [
              h('div', { className: 'docs-nav-heading' }, [
                h('span', {}, [section.label]),
                h('span', { className: 'docs-nav-pkg' }, [section.packageName]),
              ]),
              ...section.pages.map((candidate) =>
                h(
                  'a',
                  {
                    className:
                      candidate.route === page.route
                        ? 'docs-nav-item docs-nav-item-active'
                        : 'docs-nav-item',
                    href: pageHref(basePath, candidate.route),
                    'data-docs-nav-title': candidate.title,
                  },
                  [candidate.title]
                )
              ),
            ]
          )
        ),
      ]),
    ]);
  }

  private renderMain(
    page: DocPage,
    section: DocSection | undefined,
    basePath: string,
    ctx: ReturnType<typeof createPageContext>
  ): VNode {
    const isHome = page.route === homePage.route;
    const { prev, next } = this.resolvePagination(page);
    const content = page.render(ctx);

    return h('main', { className: 'docs-main' }, [
      h('article', { className: 'docs-article' }, [
        ...(isHome
          ? []
          : [
              h('div', { className: 'docs-eyebrow' }, [
                section ? section.packageName : 'BackOne Docs',
              ]),
            ]),
        h('h1', { className: 'docs-title' }, [isHome ? '欢迎' : page.title]),
        ...(isHome
          ? []
          : [h('p', { className: 'docs-lead' }, [page.description])]),
        h('div', { className: 'docs-content' }, [
          ...(Array.isArray(content) ? content : [content]),
        ]),
      ]),
      ...(isHome
        ? []
        : [
            h('div', { className: 'docs-pagenav' }, [
              prev
                ? h(
                    'a',
                    {
                      className: 'docs-pagenav-link',
                      href: pageHref(basePath, prev.route),
                    },
                    [
                      h('span', { className: 'docs-pagenav-muted' }, [
                        '← 上一页',
                      ]),
                      prev.title,
                    ]
                  )
                : h('span', {}),
              next
                ? h(
                    'a',
                    {
                      className: 'docs-pagenav-link docs-pagenav-next',
                      href: pageHref(basePath, next.route),
                    },
                    [
                      h('span', { className: 'docs-pagenav-muted' }, [
                        '下一页 →',
                      ]),
                      next.title,
                    ]
                  )
                : h('span', {}),
            ]),
          ]),
    ]);
  }

  private resolvePagination(page: DocPage): {
    prev: DocPage | null;
    next: DocPage | null;
  } {
    const index = navOrder.findIndex(
      (candidate) => candidate.route === page.route
    );
    if (index < 0) {
      return { prev: null, next: null };
    }
    return {
      prev: index > 0 ? navOrder[index - 1] : null,
      next: index < navOrder.length - 1 ? navOrder[index + 1] : null,
    };
  }
}
