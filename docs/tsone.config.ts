import { defineConfig } from '@geektech/tsone-cli';

// 文档站为「多页面」静态站：每个路由渲染一个独立 HTML 页（SSG），
// 全部共享同一个数据驱动入口 src/main.ts（入口按当前 URL 解析渲染哪页）。
// 部署到 GitHub Pages 时位于项目子路径（如 https://<owner>.github.io/backone/），
// 用 TSONE_BASE_PATH 覆盖 basePath，例如 `TSONE_BASE_PATH=/backone/ bun run build`。
export default defineConfig({
  entry: 'src/main.ts',
  pages: {
    // BackOne 框架
    '/backone': 'src/main.ts',
    '/backone/quickstart': 'src/main.ts',
    '/backone/server': 'src/main.ts',
    '/backone/middleware': 'src/main.ts',
    '/backone/context': 'src/main.ts',
    '/backone/websocket': 'src/main.ts',
    // BackOne Utils
    '/utils': 'src/main.ts',
    '/utils/db': 'src/main.ts',
    '/utils/id': 'src/main.ts',
    '/utils/cache': 'src/main.ts',
    '/utils/jwt': 'src/main.ts',
    '/utils/http': 'src/main.ts',
    '/utils/rate-limit': 'src/main.ts',
    '/utils/schema': 'src/main.ts',
    '/utils/config': 'src/main.ts',
    // BackOne CLI
    '/cli': 'src/main.ts',
    '/cli/commands': 'src/main.ts',
    '/cli/templates': 'src/main.ts',
  },
  server: {
    host: '127.0.0.1',
    port: 52211,
  },
  build: {
    outDir: 'dist',
    basePath: process.env.TSONE_BASE_PATH ?? '',
    directoryPages: true,
  },
});
