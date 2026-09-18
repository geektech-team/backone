# BackOne Agent Guide

本文件给 Codex 和其他协作代理提供项目级约定。开始任何改动前，先读本文件，
再按改动范围阅读相邻源码、测试和文档。

## 项目定位

本仓库是 Bun workspace monorepo，BackOne 技术栈独立于前端框架 TSone，
三个发布包全部零运行时依赖：

- `packages/backone` 的 `@geektech/backone`：Bun 原生服务端框架，提供路由
  （分段基数树）、洋葱模型中间件、请求上下文、静态文件、WebSocket。
- `packages/backone-utils` 的 `@geektech/backone-utils`：通用工具包，覆盖
  数据库（多库 CRUD，基于 `Bun.SQL`）、ID、缓存、JWT、HTTP 客户端、限流、
  校验、全局配置。
- `packages/backone-cli` 的 `@geektech/backone-cli`：脚手架 CLI，生成
  BackOne 服务端应用。

不要向任何包引入运行时依赖；框架运行时代码保持零外部依赖。不要把
`@geektech/tsone`、`@geektech/tsone-cli` 或前端运行时依赖带回来。

## 技术栈和命令

Bun-first。测试用 `bun:test`（服务端场景，无需 DOM preload）。

- 安装依赖：`bun install`
- 全量测试：`bun test`
- 单包测试：`bun test packages/backone`（或 backone-utils / backone-cli）
- 类型检查：`bunx tsc --noEmit`（根 tsconfig，含 paths 映射）
- 构建：`bun run build`（backone → backone-utils → backone-cli）
- 单包构建：`bun run build:backone` / `build:backone-utils` / `build:backone-cli`
- 代码检查：`bun run lint`
- 演练服务：`bun run dev`（playground/backone-demo）
- 发布前建议检查：`bun test && bunx tsc --noEmit && bun run build && bun pm pack --cwd packages/<pkg> --dry-run`

## 代码地图

- 根 `package.json` 是私有 workspace manifest，根脚本协调各 workspace。
- `packages/backone/package.json` 是发布包 manifest，保留 exports、files 和
  publishConfig；`lib/index.ts` 导出入口与 `name` / `version`。
- `packages/backone/lib/` 存放框架核心：
  - `server.ts` 应用与 `createServer`，`types.ts` 公开类型
  - `router/` 路由表与分段基数树匹配
  - `middleware/` 内置中间件（compose、logger、cors、gzip、helmet、static、
    timeout）与洋葱模型组合
  - `context.ts` / `response.ts` / `errors.ts` / `websocket.ts`
- `packages/backone/scripts/build.ts` 用 Bun.build + tsc 产出 dist。
- `packages/backone-utils/lib/` 按模块划分（db / id / cache / jwt / http /
  rate-limit / schema / config），错误统一携带稳定 `code`。
- `packages/backone-cli/src/` 实现 CLI：`cli.ts` 入口，`commands/init.ts` 建项，
  `templates.ts` 定义脚手架模板；模板中生成应用对 `@geektech/backone` 的
  caret 依赖范围需与包版本同步。
- `playground/backone-demo/` 本地演练应用，覆盖框架与工具包典型用法。

## 开发约定

- 使用 TypeScript strict 风格，避免新增 `any`；公共 API 优先用泛型、显式
  接口或受限记录类型表达。
- 面向对象关系需要清晰（依赖、关联、聚合、组合、继承或实现之一），遵守
  SOLID；策略差异（如数据库方言、ID 生成）用策略模式表达。
- 文件命名：目录和文件多用 kebab-case，类用 PascalCase，函数和变量用
  camelCase，常量用 UPPER_SNAKE_CASE。
- 格式遵守 Prettier：2 spaces、single quote、semicolons、trailingComma es5、
  printWidth 80。注释少而有用，可继续使用中文。
- 不要提交 `dist/`、`coverage/`、`node_modules/`、`.tsone/`、`.DS_Store`、
  日志、`.env*` 等生成或本地文件。

## 发布

版本升级用脚本同步硬编码引用（backone 的 `lib/index.ts`、backone-utils 的
`lib/index.ts`、backone-cli 的 `src/cli.ts`，以及 backone-cli 模板中
`@geektech/backone` 的 caret 范围）。发布使用 `bun publish`，需要已登录 npm。
