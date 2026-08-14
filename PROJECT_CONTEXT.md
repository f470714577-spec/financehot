# PROJECT_CONTEXT.md

> FinanceHot 项目当前状态的短期事实源。每次阶段完成后更新，防止长对话或新会话产生架构漂移。
> 权威基线仍是《FinanceHot DeepSeek 开发总控包 V1》+ `docs/architecture.md` + ADR。

## 当前阶段

阶段 02 —— 数据库 Schema、Migration 与 Seed（已完成，待审核）

## 项目目标

FinanceHot 是面向中文用户的"全球财经新闻实时聚合、过滤、事件化与 AI 分析平台"。链路：采集 → 解析 → 中文化 → 财经过滤 → 去重 → 同事件聚类 → 多信源交叉验证 → AI 摘要/"为什么重要" → Finance/Heat 双评分 → 精选/热点榜/日报/搜索/主题。

## 当前冻结架构（阶段 00.1 通过）

- **技术栈**：Next.js(App Router) + TypeScript(strict) + Tailwind + shadcn/ui / PostgreSQL 16 + pgvector / Drizzle / Redis + BullMQ / Node.js Worker / pnpm workspace + Turborepo / LLMProvider 抽象 + zod / Docker。
- **核心拓扑**：`Web/API → Redis Queue(BullMQ) → Worker`，耗时任务全异步。

## Package 职责与依赖

- `shared`：唯一基础层（类型/常量/工具/zod DTO/错误）。
- `db`：Drizzle schema、client、migration（仅依赖 shared）。
- `ai`：LLMProvider/EmbeddingProvider 接口 + Structured Output（仅依赖 shared）。
- `crawler`：SourceAdapter 接口 + RSS/API/Web 实现（仅依赖 shared）。
- `ui`：Design Token + 基础组件（依赖 shared）。
- `apps/web`：前台 + 后台 + API，可短事务 CRUD 与入队（组合 ui+db+shared）。
- `apps/worker`：流程编排（组合 db+ai+crawler+shared）。
- 规则：crawler 不依赖 ai/db；ai 不依赖 crawler/db；持久化与编排归 Worker。

## Web/Worker 边界

- `apps/web` 可执行短事务 CRUD 与任务入队，**禁止在 HTTP 请求内执行 Crawler、LLM、Embedding、Event Cluster 等耗时流水线**。
- `apps/worker` 负责持久化与工作流编排，crawler/ai 只产出 DTO，不写库。

## Article/Event 核心原则

- `Article`（单信源单篇）≠ `Event`（多篇报道的同一财经事实）。
- 关系唯一权威 = `event_articles`（多对多，含 `is_primary`）；`articles` **无 event_id**。
- `articles` **无 heat_score**；Heat Score 以 Event 为唯一权威对象。
- `raw_articles` 0..1 → `articles`（可 FILTERED_OUT / DUPLICATE / FAILED）。

## 数据库 Extension（阶段 01 已准备）

- PostgreSQL 用 `pgvector/pgvector:pg16` 镜像。
- 初始化脚本 `docker/init/000-extensions.sql`：`CREATE EXTENSION IF NOT EXISTS vector;` + `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
- 阶段 02 首个 Drizzle migration 同样执行上述两个扩展。

## 表结构状态

- 阶段 02 已建 **P0 20 张表**（Drizzle schema + migration + seed）；P1 8 张表未落库（阶段 17/18 再建）。
- `articles` 无 `heat_score`、无 `event_id`；Article↔Event 唯一权威 = `event_articles`。
- 完整表清单见 `docs/architecture.md` §4。

## 已完成阶段

- 阶段 00：架构冻结（PASS）
- 阶段 00.1：架构修订（PASS）
- 阶段 01：项目基础工程与开发环境（待审核）
- 阶段 02：数据库 Schema、Migration 与 Seed（待审核）

## 阶段 01 验证结果

- `pnpm install` ✓（pnpm 11.21.0，workspace 依赖解析成功）
- `typecheck` 9/9 ✓ / `lint` 7/7 ✓ / `test` 7/7 ✓ / `build` 7/7 ✓（Next 15.5.23 编译成功，产物路由 `/` + `/_not-found`）
- Web 启动：`next start` → http://localhost:3000，HTTP 200，页面含 "FinanceHot"
- Worker 启动：输出 `FinanceHot Worker started` + env 读取日志，进程保持存活
- **Docker 已安装并打通**：Docker Desktop 4.86.0 + WSL2 后端；`postgres`（pgvector:pg16）与 `redis`（7-alpine）容器 healthy，扩展 `vector`/`pg_trgm`/`plpgsql` 就绪，Redis `PONG`。因本机无法直连 Docker Hub，已配置镜像加速（`~/.docker/daemon.json` 的 `registry-mirrors`），见 `docs/本地环境-Docker安装.md`。

## 阶段 02 验证结果

- Drizzle 定义 20 张 P0 表（`src/schema/` 按域拆分），migration `drizzle/0000_*.sql` 顶部含 `vector`/`pg_trgm` 扩展。
- migrate ✓（20 表）/ seed ✓（sources 15、articles 82、events 12、topics 8、daily_reports 1）/ test 4/4 ✓ / typecheck ✓ / lint ✓。
- 测试含 vector 列往返验证（customType 写入/读取正确）。
- **宿主机端口 5433**：本机 PostgreSQL 14 占用 5432，`docker-compose.yml` 与 `.env.example` 统一用 `5433:5432` 映射；容器内部仍走 `postgres:5432`。

## 下一阶段

阶段 03 —— UI 设计系统与整体框架（Design Tokens + Light/Dark + App Shell + 13 组件骨架 + demo 页）

## 架构待办

- 阶段 03：UI 设计系统（Design Tokens + Light/Dark + App Shell + 13 组件骨架 + demo 页）。
- 阶段 04：核心前台页面（Seed/mock 数据版）。
- 阶段 05：新闻查询 API、筛选、搜索与分页。
- 阶段 06：crawler 实现 RSS/API/Web Adapter + SSRF 防护。
- 阶段 07：BullMQ Queue + Worker 状态机。
- 阶段 08：LLM Provider 实现 + Structured Output + 翻译/摘要/分类/过滤。
- 阶段 16：多阶段生产 Dockerfile + 部署。

## 禁止事项

- 不写死数据、不伪造测试成功、不复制参考站源码/品牌资产。
- 不绕过付费墙/验证码/访问控制；不全文转载版权新闻。
- 不让 LLM 编造财经事实；不为丰富内容强行关联股票。
- 不在 HTTP 请求内执行耗时流水线。
- 一次只做一个阶段，未经允许不提前开发下一阶段。
