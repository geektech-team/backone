/**
 * 文档客户端：在 SSR 渲染出的静态页面上附加交互能力。
 * 当前实现导航搜索过滤——输入关键词后按标题过滤侧边栏条目。
 */

function bindSearchFilter(): void {
  const input = document.querySelector<HTMLInputElement>('[data-docs-search]');
  const nav = document.querySelector<HTMLElement>('[data-docs-nav]');
  if (!input || !nav) {
    return;
  }

  const items = Array.from(
    nav.querySelectorAll<HTMLElement>('[data-docs-nav-title]')
  );

  input.addEventListener('input', () => {
    const keyword = input.value.trim().toLowerCase();
    for (const item of items) {
      const title = (item.dataset.docsNavTitle ?? '').toLowerCase();
      const visible = keyword === '' || title.includes(keyword);
      item.style.display = visible ? '' : 'none';
    }
    // 空关键词时恢复所有 section 显示
    const sections = nav.querySelectorAll<HTMLElement>('[data-docs-section]');
    sections.forEach((sectionEl) => {
      const anyVisible = Array.from(
        sectionEl.querySelectorAll<HTMLElement>('[data-docs-nav-title]')
      ).some((item) => item.style.display !== 'none');
      sectionEl.style.display = anyVisible || keyword === '' ? '' : 'none';
    });
  });
}

bindSearchFilter();

export {};
