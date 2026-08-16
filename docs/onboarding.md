# FinanceHot 新机器接手说明（Onboarding）

> 状态：当前有效 · 最近核对：2026-08-16
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

2026-08-16 最近复验：7 个 TypeScript 配置检查通过、ESLint 通过、数据库测试 4/4 通过、Next.js 生产构建通过，10 条核心路由 HTTP 冒烟均返回 200。构建仍提示 ESLint 未检测到 Next.js 插件。

## 5. 启动

```bash
# 起 PostgreSQL + Redis（阶段 02 起必需）
docker compose up -d postgres redis

# 起 Web（http://localhost:3000）与 Worker
pnpm dev
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
- 阶段 05：查询 API、筛选、搜索、分页和前台 DB 接入代码已完成；必须先启动 5433 PostgreSQL、migrate+seed，并完成 `docs/acceptance/phase-05.md` 中的真实测试后再视为通过。
- 下一阶段：阶段 06 —— crawler 实现 RSS/API/Web Adapter + SSRF 防护。
- 注意：宿主机 Postgres 端口用 **5433**（本机 PG14 占 5432 的规避，见 `.env.example`）；接手后 `docker compose up -d postgres redis` 即可。
