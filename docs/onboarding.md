# FinanceHot 新机器接手说明（Onboarding）

> 状态：当前有效 · 最近核对：2026-08-17
> 目标：让另一台机器上的开发者 / Agent 快速拉起环境并接上开发进度

## 1. 项目与仓库

- 项目：FinanceHot —— 面向中文用户的全球财经新闻实时聚合、过滤、事件化与 AI 分析平台。
- 技术栈：Next.js(App Router) + TypeScript(strict) + Tailwind + shadcn/ui / PostgreSQL 16(pgvector) + Drizzle / Redis + BullMQ / Node Worker / pnpm workspace + Turborepo。
- 仓库：https://github.com/f470714577-spec/financehot.git（分支 `master`）

## 2. 前置要求

- Node.js 22+
- pnpm 11.21.0（项目已用 `packageManager` 字段锁定）
- Docker + Docker Compose（起 PostgreSQL(pgvector) 与 Redis；阶段 02 起必需）
- git

## 3. 初始化步骤

```bash
git clone https://github.com/f470714577-spec/financehot.git
cd financehot

# 对齐 pnpm 版本（二选一）
corepack enable && corepack install      # 推荐，自动读取 packageManager 锁定版本
# 或：npm i -g pnpm@11.21.0

pnpm install

# 环境变量：从样例复制，按需填写
# 当前 Seed 前台不依赖 LLM；LLM_* 留空也能启动
cp .env.example .env
```

## 4. 验证环境

```bash
pnpm typecheck
pnpm lint
pnpm test        # 数据库包需要已迁移并完成 Seed 的 PostgreSQL
pnpm build
```

2026-08-17 最近复验：crawler 测试 31/31、worker PostgreSQL 集成测试 9/9、数据库测试 4/4、Web 测试 24/24 均通过；阶段06真实 RSS run-once 已产生 Raw/Article 输入。完整门禁与来源证据见 [`docs/acceptance/phase-06.md`](./acceptance/phase-06.md)。

## 5. 启动

```bash
# 起 PostgreSQL + Redis（阶段 02 起必需）
docker compose up -d postgres redis

# 起 Web（http://localhost:3000）与 Worker
pnpm dev

# 阶段06：迁移、安装来源、同步跑一轮
pnpm --filter @financehot/db db:migrate
pnpm --filter @financehot/worker install-sources
pnpm --filter @financehot/worker crawl-once
```

> `docker compose up -d`（不带服务名）会连同 web/worker 一起按 Dockerfile 构建启动；纯本地开发用上面分步方式即可。

## 6. 接手必读（按顺序）

1. `PROJECT_CONTEXT.md` —— 当前进度事实源（阶段状态、架构冻结结论、Web/Worker 边界、下一阶段）。
2. `docs/architecture.md` —— 完整架构与表结构草案。
3. `docs/ADR-*.md` —— 已采纳的技术决策。
4. 任务书 `FinanceHot_DeepSeek_开发总控包_V1.docx` —— 权威基线。

## 7. 当前进度与下一步

- 阶段 01–02：已完成。阶段 02 已落地 20 张 P0 表、Migration、Seed 与访问层测试。
- 阶段 03：UI 设计系统与整体框架已实现。
- 阶段 04：核心前台页面 Seed 数据版已实现并完成本地验证，已形成稳定基线。
- 阶段 05：查询 API、筛选、搜索、分页和前台 DB 接入已完成并通过 PostgreSQL 真实测试。
- 阶段 06：RSS/Atom、JSON API、HTML Web Adapter、SSRF/DNS/重定向/robots/限流/重试和同步 `crawl-once` 已完成；持久化只在 `apps/worker` 组合，crawler 不写库。
- 下一阶段：阶段 07 —— BullMQ 队列化和常驻 Worker 状态机；未经允许不要提前实现。
- 注意：宿主机 Postgres 端口用 **5433**（本机 PG14 占 5432 的规避，见 `.env.example`）；接手后 `docker compose up -d postgres redis` 即可。
