# BackOne Docs

BackOne 生态文档站，由 [@geektech/tsone](https://www.npmjs.com/package/@geektech/tsone) 框架驱动，
覆盖三个包的文档：

| 包                                      | 文档目录                    |
| --------------------------------------- | --------------------------- |
| `@geektech/backone`（服务端框架）       | `docs/src/pages/backone.ts` |
| `@geektech/backone-utils`（通用工具包） | `docs/src/pages/utils.ts`   |
| `@geektech/backone-cli`（脚手架 CLI）   | `docs/src/pages/cli.ts`     |

## 目录结构

```
docs/
├── package.json          # 私有 workspace 包：@geektech/tsone + tsone-cli
├── tsconfig.json         # 继承根 tsconfig，补充 DOM lib
├── tsone.config.ts       # 多页面静态站配置（pages / basePath / outDir）
└── src/
    ├── main.ts           # 入口：按 URL 解析页面并创建应用（SSR + 浏览器共用）
    ├── app.ts            # 根组件：顶栏 + 侧边栏导航 + 正文
    ├── content.ts        # 页面目录与路由解析（含 GitHub Pages base 处理）
    ├── components.ts     # 内容构件：codeblock / table / callout / h2…
    ├── styles.ts         # 全站样式（StyleSheet）
    ├── client.ts         # 浏览器端增强（导航搜索过滤）
    └── pages/            # 三个包的文档内容
```

## 本地开发

```bash
bun install                          # 根目录安装（docs 是 workspace 成员）
bun run docs                         # 开发服务器，默认 http://127.0.0.1:52211
```

## 构建

```bash
bun run docs:build                   # 构建到 docs/dist（无 base，本地预览用）
bun run docs:build:pages             # 构建到 docs/dist（base=/backone/，GitHub Pages 用）
```

构建产物是纯静态多页面 HTML，可直接 `bunx serve docs/dist` 预览。

## 部署到 GitHub Pages

仓库已配置 `.github/workflows/docs-pages.yml`：push 到 `main` 时自动构建文档并部署到
`https://<owner>.github.io/backone/`。

首次启用：

1. 打开仓库 **Settings → Pages**，将 **Source** 设为 **GitHub Actions**。
2. push 任意修改触发 `Deploy Docs to GitHub Pages` 工作流。

## 新增页面

1. 在 `src/pages/` 对应文件新增 `renderXxx(ctx)` 函数。
2. 在 `src/content.ts` 的 `sections` 中登记 route / title / description。
3. 在 `tsone.config.ts` 的 `pages` 中登记 route（指向 `src/main.ts`）。

页面路由解析同时支持开发环境（无 base）与 Pages 子路径（`/backone/` 前缀），
无需为不同环境改代码。
