# BackOne Monorepo

基于 Bun 的轻量级服务端框架与技术栈，纯 TypeScript，零运行时依赖。

业务开发推荐以对象组织：`Application → Module → Controller/Gateway →
Service → Repository → Database/Table`。同一业务就近放在 `modules/<feature>/`，由 `@Module` 包装并通过
构造函数显式组合；Application 负责初始化、
监听和关闭资源。框架同时保留函数式 API。

## Packages

| 包                        | 目录                     | 说明                                                           |
| ------------------------- | ------------------------ | -------------------------------------------------------------- |
| `@geektech/backone`       | `packages/backone`       | 服务端框架：路由、中间件、上下文、静态文件、WebSocket          |
| `@geektech/backone-utils` | `packages/backone-utils` | 通用工具包：数据库 CRUD、ID、缓存、JWT、HTTP、限流、校验、配置 |
| `@geektech/backone-cli`   | `packages/backone-cli`   | 脚手架 CLI：生成 BackOne 服务端应用                            |

`playground/backone-demo` 是本地演练应用，覆盖框架与工具包的典型用法。

## 创建类应用

```sh
bunx @geektech/backone-cli init my-api --template rest-api
cd my-api
bun run typecheck
bun run dev
```

三个模板统一生成 Application 和业务 Module。REST 的 `modules/users` 包含
Controller、Service、Repository、模型、Schema 与 SQLite；WebSocket 的
`modules/chat` 包含 Gateway 和聊天 Service。Application 通过 `registerModules`
统一挂载。要求
Bun >=1.3.10、TypeScript >=5.2，使用标准装饰器。

参见[对象优先开发指南](docs/object-first.md)、[CLI](packages/backone-cli/README.md)
和 [demo](playground/backone-demo/README.md)。

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
