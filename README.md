# BackOne Monorepo

基于 Bun 的轻量级服务端框架与技术栈，纯 TypeScript，零运行时依赖。

## Packages

| 包 | 目录 | 说明 |
| --- | --- | --- |
| `@geektech/backone` | `packages/backone` | 服务端框架：路由、中间件、上下文、静态文件、WebSocket |
| `@geektech/backone-utils` | `packages/backone-utils` | 通用工具包：数据库 CRUD、ID、缓存、JWT、HTTP、限流、校验、配置 |
| `@geektech/backone-cli` | `packages/backone-cli` | 脚手架 CLI：生成 BackOne 服务端应用 |

`playground/backone-demo` 是本地演练应用，覆盖框架与工具包的典型用法。

## Commands

```sh
bun install            # 安装依赖
bun test               # 全量测试
bun run build          # 全量构建（backone → backone-utils → backone-cli）
bun run lint           # eslint
bunx tsc --noEmit      # 根 tsconfig 类型检查
bun run dev            # 启动 playground/backone-demo
```

单包操作：

```sh
bun run build:backone
bun run build:backone-utils
bun run build:backone-cli
```

## Repository

- GitHub: <https://github.com/geektech-team/backone>
- License: MIT
