import type { VNode } from '@geektech/tsone';
import {
  h,
  H2,
  H3,
  P,
  Pre,
  Code,
  Ul,
  Li,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Span,
} from '@geektech/tsone';

type Child = VNode | string;

/** 行内代码 */
export function inline(text: string): VNode {
  return h('code', {}, [text]);
}

/** 代码块：深色背景 + 可选语言标签 */
export function codeblock(codeText: string, lang = 'ts'): VNode {
  return h('div', { className: 'docs-codeblock' }, [
    h('div', { className: 'docs-codeblock-head' }, [lang]),
    Pre({
      props: { className: 'docs-codeblock-pre' },
      children: [
        Code({
          props: { className: 'docs-codeblock-code' },
          children: [codeText],
        }),
      ],
    }),
  ]);
}

/** 二级标题 */
export function h2(text: string): VNode {
  return H2({ props: { className: 'docs-h2' }, children: [text] });
}

/** 三级标题 */
export function h3(text: string): VNode {
  return H3({ props: { className: 'docs-h3' }, children: [text] });
}

/** 段落 */
export function p(children: Child | Child[]): VNode {
  return P({
    props: { className: 'docs-p' },
    children: Array.isArray(children) ? children : [children],
  });
}

/** 无序列表 */
export function ul(items: (Child | Child[])[]): VNode {
  return Ul({
    props: { className: 'docs-list' },
    children: items.map((item) =>
      Li({
        children: Array.isArray(item) ? item : [item],
      })
    ),
  });
}

/** 提示块 */
export function callout(
  title: string,
  children: Child | Child[],
  kind: 'info' | 'tip' | 'warn' = 'info'
): VNode {
  const text =
    title || (kind === 'warn' ? '注意' : kind === 'tip' ? '提示' : '说明');
  return h('div', { className: 'docs-callout' }, [
    h('div', { className: 'docs-callout-title' }, [text]),
    ...(Array.isArray(children) ? children : [children]),
  ]);
}

/** 表格 */
export function table(headers: string[], rows: (Child | Child[])[][]): VNode {
  return h('div', { className: 'docs-table-wrap' }, [
    Table({
      props: { className: 'docs-table' },
      children: [
        Thead({
          children: [
            Tr({
              children: headers.map((head) => Th({ children: [head] })),
            }),
          ],
        }),
        Tbody({
          children: rows.map((row) =>
            Tr({
              children: row.map((cell) =>
                Td({
                  children: Array.isArray(cell) ? cell : [cell],
                })
              ),
            })
          ),
        }),
      ],
    }),
  ]);
}

/** 横线分隔 */
export function hr(): VNode {
  return h('hr', { className: 'docs-hr' });
}

/** 强调行内文本 */
export function strong(text: string): VNode {
  return Span({ props: { fontWeight: 700 }, children: [text] });
}

/** 代码块 + 表格组合（用于 API 签名列表） */
export function apiTable(
  headers: string[],
  rows: (Child | Child[])[][]
): VNode {
  return table(headers, rows);
}
