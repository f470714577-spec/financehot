# FinanceHot 项目规则

## 项目定位

FinanceHot 是面向中文用户的全球财经新闻聚合、事件化与 AI 分析平台；当前仍是开发中的 Seed 数据版本，不是已上线的实时财经服务。

## 启动与验证

- 使用 Node.js 22+、`pnpm@11.21.0`；先运行 `corepack enable` 和 `pnpm install`。
- 复制 `.env.example` 为 `.env`，再以 `docker compose up -d postgres redis` 启动 PostgreSQL 与 Redis。
- 本地开发运行 `pnpm dev`；Web 默认地址为 `http://localhost:3000`。
- 交付前运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。数据库测试需要已迁移并完成 Seed 的 PostgreSQL。

## 技术栈

Next.js App Router、React、TypeScript strict、Tailwind CSS、PostgreSQL 16 + pgvector、Drizzle、Redis、BullMQ、pnpm workspace 与 Turborepo。

## 目录与约定

- `apps/web`：前台、未来后台与 API；HTTP 请求内禁止执行采集、LLM、Embedding 或事件聚类等耗时任务。
- `apps/worker`：异步流程编排；`packages/crawler` 与 `packages/ai` 只产出 DTO，不直接写库。
- `packages/shared` 是基础层；`db`、`ai`、`crawler`、`ui` 只依赖 `shared`，应用层负责组合。
- Article 与 Event 是不同实体；唯一关系权威为 `event_articles`，Heat Score 只属于 Event。
- 对话、说明和代码注释统一使用简体中文；仅保留行业通用技术缩写。
- 真实密钥只放未入库的 `.env`；不绕过付费墙、验证码或访问控制，不全文转载版权新闻。

## 当前状态与下一步

- 当前阶段：阶段 08 Article AI 处理流水线已实现，根级测试已通过入口级串行化修复跨包共享数据库 fixture 竞争并恢复稳定门禁。项目仍未推送、未部署、未上线，真实模型质量待供应商选定后在上线前验收。
- 下一阶段：阶段 09 Embedding、事件聚类与关联仍未开始；未经允许不提前开发后续阶段。
- 现役进度以 `PROJECT_CONTEXT.md` 为准，架构机制以 `docs/architecture.md` 与 ADR 为准，使用和接手流程见 `README.md`、`docs/onboarding.md`。
