# Object First BackOne Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans and parallel independent tasks. Steps use checkbox syntax for tracking.

**Goal:** 统一类优先的业务架构、初始化模板、demo 和文档。

**Architecture:** 复用现有 BackOneServer 和标准装饰器。Application 显式组装 Controller/Gateway → Service → Repository → Database/Table；所有权决定关闭职责。

**Tech Stack:** Bun、strict TypeScript、bun:test、SQLite，无新增运行时依赖。

**Spec:** docs/superpowers/specs/2026-11-03-object-first-design.md

## Global Constraints

- 保留已有工作区改动、版本号、框架函数式 API 和初始化覆盖确认。
- 所有模板使用类；Bun >=1.3.10、TypeScript >=5.2。
- 不自动扫描、不新增 DI 容器、通用 Repository 基类或空装饰器。
- 当前 checkout 内执行；本任务不提交、不发布。

## Review Focus

- 导入与构造不监听；资源关闭及启动失败清理。
- 多应用实例数据隔离；重复初始化不重复 seed/register。
- Repository 事务使用 tx 连接，失败回滚。
- CLI 三模板默认一致且保持逐文件覆盖安全。
- Demo 现有接口、WS、SSE 和状态语义保留。

### Task 1: Unified class templates

**Files:** packages/backone-cli/src/{templates,controller-template,types,cli}.ts、commands/init.ts、tests；scripts/release.ts。

**Interfaces:** 生成 src/app.ts 导出 Application，server 供 handle 测试，initialize/start/stop 管理生命周期；REST Repository 组合 Database/Table。

- [x] 更新行为测试，确认默认类模板与 SQLite/WS 能力缺失导致失败。
- [x] 实现三个类模板、CLI 统一选择和弃用 functional 的明确错误。
- [x] 验证生成应用类型、CRUD、实例隔离、持久化、关闭和 WS；同步 utils 发布引用。

### Task 2: Class based playground

**Files:** playground/backone-demo/src/**、packages/backone/tests/controller-demo.test.ts、新 demo 集成测试。

**Interfaces:** src/app.ts 导出 DemoApplication，server、initialize/start/stop；数据库资源由应用拥有，Controller 示例保留 registerControllerDemo 包装。

- [x] 先补测试验证无导入副作用、任务 CRUD/审计、事务失败回滚、实例隔离及并发生命周期。
- [x] 将入口、数据库访问、业务逻辑和路由拆成类并显式组装。
- [x] 保留原路径与行为，验证主要 HTTP/WS/SSE，更新 demo 说明。

### Task 3: Documentation and verification

**Files:** 根 README、框架/工具包/CLI README、docs/src/pages/**、docs/src/content.ts、AGENTS.md（如有必要）。

**Interfaces:** 文档引用已落地的 Application/Repository 和 CLI 默认行为；新增 /backone/architecture 页面。

- [x] 更新首选用法、分层职责、可复制示例与模板目录/迁移说明。
- [x] 独立审查实现并修复具体问题。
- [x] 执行全量测试、类型检查、构建、Lint、格式和打包检查，记录范围与限制。

## Execution record

- 2026-11-03：已确认框架和数据库核心已有类 API，本次重构业务组织与推荐入口。
- 当前 checkout 保留先前装饰器未提交工作；按授权直接执行，不创建新 worktree。
- Builder check：固定 start 自动初始化、并发共用 Promise、关闭幂等且不重启；补充事务失败回滚验收。
- Ruling：策略装饰器在定义期求值，允许专用类工厂绑定应用 Service 配置；不为此扩展内核或引入服务定位器。

- Task 1 complete：三个统一类模板、显式构造注入、SQLite Repository、发布引用同步及生成应用集成通过。
- Task 2 complete：DemoApplication、Controller/Gateway、Service、Repository、领域错误映射、双库/SSE 生命周期及原接口兼容完成。
- Task 3 complete：中英文 README、对象优先指南、文档站架构/快速开始/CLI/数据库页及项目开发约定同步。
- 独立审查发现 SSG pages 漏登记 architecture/decorators，已补齐；正常与 GitHub Pages base 构建均产出42个资源及两个目标HTML。
- 验证：全量308 pass / 0 fail，3164断言、26文件；根与文档类型检查、全包构建通过；三个包 dry-run 打包通过。
- Lint：0错误；工具包保留18条原有警告。新demo、模板及新文档代码定向Lint无警告。可执行文档示例已提取、类型检查并实际运行。
- 初次全量307 pass / 1 fail：既有gzip用例期望identity收到null；隔离features文件21 pass，未改代码全量复跑308 pass。独立临时循环2000个短时服务器另复现2次空404、没有业务标识且端口无重复，尚不能确定Bun内部原因；本次不盲改gzip，保留该偶发记录。
- 已用本地SQLite及真实HTTP/WS验证CRUD、持久化、事务失败回滚、实例隔离、并发关闭和资源释放；未连接外部PostgreSQL/MySQL/MariaDB，未部署、提交或发布。
