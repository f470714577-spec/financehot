# FinanceHot 新机器接手说明（Onboarding）

> 状态：当前有效 · 日期：2026-08-13
> 目标：让另一台机器上的开发者 / Agent 快速拉起环境并接上开发进度

## 1. 项目与仓库

- 项目：FinanceHot —— 面向中文用户的全球财经新闻实时聚合、过滤、事件化与 AI 分析平台。
- 技术栈：Next.js(App Router) + TypeScript(strict) + Tailwind + shadcn/ui / PostgreSQL 16(pgvector) + Drizzle / Redis + BullMQ / Node Worker / pnpm workspace + Turborepo。
- 仓库：https://github.com/f470714577-spec/financehot.git（分支 `master`）

## 2. 前置要求

- Node 18.18+（建议 20 LTS）
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
# 阶段 01 启动 web/worker 不依赖真实 DB；LLM_* 留空也能启动
cp .env.example .env

# git 身份（用于后续提交）
git config user.name "f470714577-spec"
git config user.email "f470714577-spec@users.noreply.github.com"
```

## 4. 验证环境

```bash
pnpm typecheck   # 阶段 01 结果 9/9
pnpm lint        # 7/7
pnpm test        # 7/7
pnpm build       # 7/7
```

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

- 阶段 01（项目基础工程与开发环境）：已完成，待审核。基线 commit `cc07d56`。
- 下一阶段：阶段 02 —— 数据库 Schema、Migration 与 Seed（P0 20 张表）。
- 注意：阶段 01 验证时本机无 Docker，DB 连接与 migration 尚未在真实 DB 环境跑过；阶段 02 起需在装好 Docker 的机器上验证。
