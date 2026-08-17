# FinanceHot

面向中文用户的**全球财经新闻实时聚合、过滤、事件化与 AI 分析平台**。不是门户新闻站，也不是简单 RSS 阅读器，而是 AI 驱动的全球财经情报过滤器。

> 当前开发阶段：**阶段 06（安全采集 Adapter 与同步 crawl-once，已完成本地验收）**。阶段 06 仍是受控本地采集链路，不是已上线的实时财经服务；AI、事件聚类、队列化调度和生产评分仍未实现。

当前进度与验证快照以 [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) 为准。

## Monorepo 结构

```
financehot/
├── apps/
│   ├── web/            # Next.js 前台；后台 /admin 与业务 API 尚待后续阶段
│   └── worker/         # 独立后台 Worker；BullMQ 消费流程尚待阶段 07
├── packages/
│   ├── shared/         # 基础公共层（类型/常量/工具/zod DTO/错误）
│   ├── db/             # Drizzle schema、client、migration
│   ├── ai/             # LLMProvider/EmbeddingProvider 接口骨架
│   ├── crawler/        # RSS/API/Web Adapter、SafeFetcher、robots 与 DTO 产出
│   └── ui/             # Design Token + 基础组件
├── scripts/            # 运维脚本
├── docker/             # Dockerfile + 初始化脚本
└── docs/               # 架构文档 + ADR
```

## 环境要求

- Node.js >= 22
- pnpm 11.21.0（由根目录 `packageManager` 锁定，推荐使用 Corepack）
- PostgreSQL 16 + pgvector（见下方 Docker）
- Redis 7

## 安装

```bash
corepack enable
pnpm install
```

## 环境变量

复制 `.env.example` 为 `.env`，按需填写：

```bash
cp .env.example .env
```

关键变量：`DATABASE_URL`、`REDIS_URL`、`APP_URL`、`LLM_PROVIDER`、`LLM_API_KEY`、`LLM_MODEL`、`EMBEDDING_PROVIDER`、`EMBEDDING_MODEL`。**真实密钥绝不写入 `.env` 以外且不入库。**

## Docker 启动（PostgreSQL + Redis）

```bash
docker compose up postgres redis
```

> PostgreSQL 使用 `pgvector/pgvector:pg16` 镜像（含 vector 扩展），初始化脚本自动执行 `CREATE EXTENSION vector / pg_trgm`。

完整启动（含 Web/Worker 开发镜像）：

```bash
docker compose up
```

## 本地启动

### Web（Next.js）

```bash
pnpm --filter @financehot/web dev
# 打开 http://localhost:3000
```

### Worker

```bash
pnpm --filter @financehot/worker install-sources
pnpm --filter @financehot/worker crawl-once
# crawl-once 是阶段06同步单轮入口；BullMQ/常驻调度留到阶段07
```

### Redis PING 测试（可选）

```bash
pnpm --filter @financehot/worker ping:redis
```

## 常用命令

```bash
pnpm build       # 构建
pnpm lint        # 代码检查
pnpm typecheck   # 类型检查
pnpm test        # 测试；需先 migrate，worker/crawler 含真实阶段06测试
```

阶段 06 首次接手时先执行：

```bash
pnpm --filter @financehot/db db:migrate
pnpm --filter @financehot/db db:seed
pnpm --filter @financehot/worker install-sources
```

采集只保存来源允许的元数据和摘要/摘录，不全文转载版权新闻；API 密钥只引用环境变量名，不写入 `sources.adapter_config`。

## 目前开发阶段

- [x] 阶段 00：架构冻结
- [x] 阶段 01：基础工程与开发环境
- [x] 阶段 02：数据库 Schema / Migration / Seed
- [x] 阶段 03：UI 设计系统与整体框架
- [x] 阶段 04：核心前台页面（Seed 数据版）
- [x] 阶段 05：新闻 API / 筛选 / 搜索 / 分页
- [x] 阶段 06：RSS/API/Web Adapter、安全抓取、来源表驱动 crawl-once 与 Raw/Article 幂等
- [ ] 阶段 07+：BullMQ 队列 / AI / 聚类 / 评分 / 日报 / 后台 / 部署

> 尚未实现：BullMQ 常驻队列、AI 调用、Embedding、Event Cluster、Finance/Heat Score、后台业务、用户系统。请勿把阶段06的本地 run-once 误解为生产调度。
