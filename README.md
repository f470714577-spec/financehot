# FinanceHot

面向中文用户的**全球财经新闻实时聚合、过滤、事件化与 AI 分析平台**。不是门户新闻站，也不是简单 RSS 阅读器，而是 AI 驱动的全球财经情报过滤器。

> 当前开发阶段：**阶段 01（项目基础工程与开发环境）**。核心业务（采集 / AI / 去重 / 聚类 / 评分）尚未实现。

## Monorepo 结构

```
financehot/
├── apps/
│   ├── web/            # Next.js 前台 + 后台 /admin + API
│   └── worker/         # 独立后台 Worker（BullMQ 消费者，流程编排）
├── packages/
│   ├── shared/         # 基础公共层（类型/常量/工具/zod DTO/错误）
│   ├── db/             # Drizzle schema、client、migration
│   ├── ai/             # LLMProvider/EmbeddingProvider 接口
│   ├── crawler/        # SourceAdapter 接口 + 采集实现
│   └── ui/             # Design Token + 基础组件
├── prompts/            # 核心 Prompt 模板
├── scripts/            # 运维脚本
├── docker/             # Dockerfile + 初始化脚本
└── docs/               # 架构文档 + ADR
```

## 环境要求

- Node.js >= 22
- pnpm >= 9（推荐通过 `npm install -g pnpm` 安装）
- PostgreSQL 16 + pgvector（见下方 Docker）
- Redis 7

## 安装

```bash
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
pnpm --filter @financehot/worker start
# 应输出 "FinanceHot Worker started"
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
pnpm test        # 测试（当前各包暂无测试，安全执行并明确结果）
```

## 目前开发阶段

- [x] 阶段 00：架构冻结
- [x] 阶段 01：基础工程与开发环境（当前）
- [ ] 阶段 02：数据库 Schema / Migration / Seed
- [ ] 阶段 03+：UI 设计系统 / 核心页面 / API / 采集 / AI / 去重 / 聚类 / 评分 / 日报 / 后台 / 部署

> 尚未实现：新闻爬取、AI 调用、去重、Embedding、Event Cluster、Finance/Heat Score、后台业务、用户系统。请勿按已完成的业务功能理解本项目。
