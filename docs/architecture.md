# FinanceHot 架构设计（阶段 00.1 修订版）

> 版本 V1.1 · 2026-08-13 · 依据《FinanceHot DeepSeek 开发总控包 V1》+ 阶段 00.1 修订指令
> 状态：阶段 00.1 已通过并作为当前架构基线；实现进度以 `../PROJECT_CONTEXT.md` 为准

## 0. 初始仓库勘察记录（历史）

- 2026-08-13 阶段 00.1 勘察时，目录仅含开发总控包 docx 及 Word 锁文件，因此按从零项目处理。
- 当前仓库已完成阶段 01–02，并已实现阶段 03–04 的本地待审核代码；这段记录只解释架构起点，不代表当前目录状态。

## 1. 技术架构总览（保持阶段 00 总体选型不变）

```
公开财经源 → SourceAdapter(fetch/parse/normalize) → raw_articles ─┐
                                                                    │ normalize + 过滤 + 去重
                                                                    ▼
                                                          articles（标准化新闻）
                                                                    │
            Web/API ──入队──► Redis Queue(BullMQ) ──► Worker（编排：db + ai + crawler）
                                                                    │
              ┌─────────────────────────────────────────────────────┼──────────────────┐
              ▼                     ▼                               ▼                  ▼
        AI Pipeline          article_embeddings              Event 聚类(embedding)   双评分
       (过滤/翻译/摘要/       (pgvector 持久化)               (event_articles)      (Finance/Heat)
        分类/实体/评分)
                                                                    ▼
                                          events → 前台(Event优先)/热点榜/日报/搜索/主题
```

**核心拓扑：`Web/API → Redis Queue(BullMQ) → Worker`。** 耗时操作（抓取/LLM/Embedding/聚类）全部异步；HTTP 只入队与读取。

## 2. 技术选型（不变）

| 领域      | 选型                                        |
| --------- | ------------------------------------------- |
| Web       | Next.js（App Router）+ React                |
| 语言      | TypeScript（strict）                        |
| UI        | Tailwind CSS + shadcn/ui                    |
| 数据库    | PostgreSQL 16 + pgvector                    |
| ORM       | Drizzle + drizzle-kit                       |
| 队列/缓存 | Redis + BullMQ                              |
| Worker    | Node.js 独立进程 `apps/worker`              |
| 爬虫      | Node（rss-parser + cheerio + 自建 fetcher） |
| AI        | LLMProvider 抽象 + zod Structured Output    |
| Embedding | 独立 EmbeddingProvider + pgvector           |
| 包管理    | pnpm workspace + Turborepo                  |
| 部署      | Docker + docker-compose                     |

**基础设施约束（阶段 01–02 已落实）**：

- PostgreSQL 容器必须使用**含 pgvector 的镜像**（如 `pgvector/pgvector:pg16`），普通 `postgres:16` 不含 pgvector。
- Drizzle migration 首步必须执行：`CREATE EXTENSION IF NOT EXISTS vector;` 与 `CREATE EXTENSION IF NOT EXISTS pg_trgm;`

## 3. Monorepo 目录与 Package 依赖（低耦合修正）

```
financehot/
├── apps/
│   ├── web/            # Next.js 前台 + 后台 /admin + API 路由（组合 ui + db + shared）
│   └── worker/         # 独立 Worker：BullMQ 消费者，负责流程编排（组合 db + ai + crawler + shared）
├── packages/
│   ├── shared/         # 基础公共层：类型、常量、工具、zod DTO、错误类型
│   ├── db/             # Drizzle schema、client、migration、seed（仅依赖 shared）
│   ├── ai/             # 可替换 LLMProvider、五步 Prompt、Structured Output 与 usage（仅依赖 shared）
│   ├── crawler/        # SourceAdapter 骨架；采集与 SSRF 防护在阶段 06 补齐（仅依赖 shared）
│   └── ui/             # Design Tokens、基础组件（依赖 shared）
├── scripts/  docker/  docs/
├── .env.example  docker-compose.yml  README.md
└── package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json
```

**依赖图（单向、无循环）**：

```
                 ┌─────────────────────┐
                 │       shared        │  基础公共层（DTO/类型/常量/工具）
                 └──────────┬──────────┘
        ┌───────────┬───────┼──────────┬────────────┐
        ▼           ▼       ▼          ▼            ▼
   ┌─────────┐ ┌────────┐ ┌─────────┐ ┌─────────┐
   │   db    │ │   ai   │ │ crawler │ │   ui    │
   └────┬────┘ └───┬────┘ └────┬────┘ └────┬────┘
        │          │           │           │
        └──────────┴─────┬─────┴───────────┘
                         ▼
              ┌───────────────────────┐
              │  apps/web     组合 ui + db + shared        │
              │  apps/worker  编排 db + ai + crawler + shared │
              └───────────────────────┘
```

**强制依赖规则**：

- `crawler` 不依赖 `ai`、不直接依赖 `db`（ORM 实现）。
- `ai` 不依赖 `crawler`、原则上不直接依赖 `db`。
- `crawler` 与 `ai` 均**输入/输出 DTO**（DTO 定义在 `shared`）。
- **数据库持久化与工作流编排由 `apps/worker` 完成**，`crawler`/`ai` 只产出 DTO，不写库。
- `apps/web` 可执行短事务 CRUD 与任务入队，但禁止在 HTTP 请求内执行 Crawler、LLM、Embedding、Event Cluster 等耗时流水线。

## 4. 数据库 ER 设计

### 4.1 核心双层模型与关系决策

**`Article`（单信源单篇）≠ `Event`（多篇报道指向的同一财经事实）。**

- **Article↔Event 关系：仅用 `event_articles` 多对多作为唯一权威事实源**，`articles` 表**不保留**任何 event 外键字段（原 `event_id` 已移除）。
- `event_articles` 用 `is_primary` 标记该文章在事件中的"主报道"，避免引入第二事实源导致不一致。
- 理由（ADR-002）：单一事实源最稳定；`is_primary` 已可表达"主事件"语义；前台详情页是单篇查询，join `event_articles` 一次即可，无需冗余字段。

```
sources 1 ── N raw_articles 0..1 ── 1 articles N ── N sources
                        │
        raw_articles 可能不产生 article（FILTERED_OUT / DUPLICATE / FAILED）
                        │
        articles N ── N events        (via event_articles，唯一权威，含 is_primary)
        events  1 ── N event_timeline (事件时间线节点)
        articles 1 ── N article_embeddings(每 article 每个 provider/model/版本一条)
        articles N ── N categories / tags / countries / companies / industries (多对多关联表)
        events   N ── N topics        (via event_topics)
        articles N ── N topics        (via topic_articles)
        articles 1 ── N ai_tasks 1 ── N ai_usage   (ai_usage 归因到 ai_task)
        sources  1 ── N crawl_tasks
        users    1 ── N favorites / watchlists   (P1)
```

### 4.2 完整表清单（28 张）

**P0 建表并启用（20 张）**：sources、raw_articles、articles、article_embeddings、events、event_articles、event_timeline、categories、article_categories、tags、article_tags、countries、article_countries、topics、topic_articles、event_topics、ai_tasks、ai_usage、crawl_tasks、daily_reports。

**P1 预留表（8 张，仅作架构草案，阶段 02 不建表）**：users、favorites、watchlists、companies、article_companies、securities、industries、article_industries。P1 表在阶段 17/18 按最终需求创建 Migration，不因"预留"而提前落库。

### 4.3 核心表详细定义

> 约定：`id` 一律为 UUID 或 BIGSERIAL（阶段 02 定）；时间统一 UTC；`*_at` 为 timestamp；所有外键建索引。

**sources**

- 主键 `id`；唯一约束 `name`、`rss_url`（可空）
- 字段：name, type(rss/api/web), country, language, homepage, rss_url, source_level(A–E), credibility_score, enabled, crawl_interval, last_crawled_at, created_at, updated_at
- 索引：`enabled`、`source_level`

**raw_articles**（原始抓取快照，尽量保留）

- 主键 `id`；唯一约束 `(source_id, canonical_url, fetched_at)` 或 `(source_id, content_hash)`（阶段 02 定，防同一快照重复落库）
- 字段：source_id(FK), original_url, canonical_url, content_hash, raw_content, raw_title, fetched_at, language, **processing_status**(pending/normalized/filtered_out/duplicate/failed), **article_id**(FK 可空), **rejected_reason**, **duplicate_of_article_id**(FK 可空), **parser_version**, created_at, updated_at
- 索引：processing_status、article_id、canonical_url
- 关系：`raw_articles.source_id → sources.id`；`raw_articles.article_id → articles.id`（0..1，可空）

**articles**（标准化新闻）

- 主键 `id`；唯一约束 `canonical_url`
- 字段：source_id(FK), original_url, canonical_url, content_hash, title_hash, original_title, title_zh, original_summary, summary_zh, original_language, published_at, fetched_at, finance_score, financial_relevance_score, importance_score, market_impact_score, source_quality_score, is_featured, is_hidden, ai_reason, **processing_status**, created_at, updated_at
- 索引：published_at、fetched_at、finance_score、financial_relevance_score、processing_status、content_hash、title_hash；中文/英文搜索见 §7
- **不含 heat_score、不含 event_id**（见 ADR-002）
- 关系：`articles.source_id → sources.id`

**article_embeddings**（Embedding 持久化）

- 主键 `id`；**唯一约束 `(article_id, provider, model, input_hash, embedding_version)`**
- 字段：article_id(FK), provider, model, dimensions, embedding(vector), input_hash, embedding_version, created_at, updated_at
- 索引：article_id；HNSW/IVFFlat 向量索引（阶段 09 定）
- 用途：判断"哪个 Provider/Model 生成、向量维度、基于哪一版输入"；`input_hash` 变化即需重新生成；唯一约束保证同一版本不重复生成
- **MVP 不强制 Event 级 Embedding**（后续可扩展 `event_embeddings`，结构与 article_embeddings 对称）

**events**

- 主键 `id`；唯一约束 `slug`（阶段 02 定，或跳过）
- 字段：title, summary, finance_score, heat_score, first_seen_at, last_seen_at, **article_count**, **source_count**, status(confirmed/developing/rumor/disputed/retracted), created_at, updated_at
- 索引：heat_score、finance_score、first_seen_at
- `article_count`/`source_count` 为**派生缓存字段**，由 `event_articles` 聚合而来（COUNT DISTINCT）；聚类/合并/拆分在同一事务内重算，后台提供重算校验接口

**event_articles**（Article↔Event 唯一权威关系）

- 主键 `id`；**唯一约束 `(event_id, article_id)`**
- 字段：event_id(FK), article_id(FK), **is_primary**(bool, 默认 false), similarity_score, confidence, **cluster_method**(manual/title/embedding/llm/hybrid), created_at
- 索引：event_id、article_id
- **Partial Unique Index**：`(event_id) WHERE is_primary = true`（同一 event 最多一条主报道）
- 关系：`event_id → events.id`；`article_id → articles.id`

**event_timeline**（事件时间线节点）

- 主键 `id`；字段：event_id(FK), occurred_at, type(首次报道/媒体确认/官方声明/监管回应/市场反应), description, source_article_id(FK 可空)
- 索引：event_id、occurred_at

**categories / article_categories**

- categories：主键 `id`；唯一 `slug`；字段 name, slug, parent_id(可空，层级分类), sort_order
- article_categories：主键 `id`；**唯一 `(article_id, category_id)`**；字段 article_id(FK), category_id(FK), confidence

**tags / article_tags**

- tags：主键 `id`；唯一 `name`；字段 name, slug, kind(分类标签/事件标签)
- article_tags：主键 `id`；**唯一 `(article_id, tag_id)`**；字段 article_id(FK), tag_id(FK)

**countries / article_countries**

- countries：主键 `id`；唯一 `code`（ISO）；字段 name_zh, name_en, code
- article_countries：主键 `id`；**唯一 `(article_id, country_id)`**；字段 article_id(FK), country_id(FK), role(提及/主要/影响)

**topics / topic_articles / event_topics**

- topics：主键 `id`；唯一 `slug`；字段 name, description, heat_score, created_at
- topic_articles：主键 `id`；**唯一 `(topic_id, article_id)`**；字段 topic_id(FK), article_id(FK)
- event_topics：主键 `id`；**唯一 `(topic_id, event_id)`**；字段 topic_id(FK), event_id(FK)

**ai_tasks**（细粒度 AI 任务状态）

- 主键 `id`；阶段 08 增加 `cache_key`、`result_json`；缓存键包含 article、task_type、input_hash、prompt_version、provider、model，并设置唯一约束。字段：task_type(financial-filter/translate/summarize/classify/entity-extraction/finance-score/market-impact/event-cluster/daily-report), article_id(FK 可空), event_id(FK 可空), status(pending/running/success/failed/retrying), prompt_version, model, provider, input_hash, error, retry_count, created_at, updated_at。Article 删除时其 AI 任务级联删除，避免旧测试和生命周期清理留下孤儿任务。
- 索引：status、article_id、task_type
- **不承担 Pipeline 粗粒度状态**——粗粒度由 `articles.processing_status` 表达

**ai_usage**（每次 AI 调用成本）

- 主键 `id`；增加 `attempt`，与 `ai_task_id` 组成唯一约束；字段：**ai_task_id(FK → ai_tasks.id)**, provider, model, task_type, article_id(FK 可空), attempt, prompt_tokens, completion_tokens, estimated_cost, created_at
- 索引：ai_task_id、article_id、task_type、created_at
- 用途：统一 Article/Event/Daily Report 等 AI 成本归因，追溯到具体 ai_task

**crawl_tasks**（采集任务状态）

- 主键 `id`；**唯一 `(source_id, scheduled_at)` 或唯一 job key**（防并发重复抓）
- 字段：source_id(FK), status(pending/running/success/failed/retrying), error, retry_count, scheduled_at, started_at, finished_at
- 索引：status、source_id

**daily_reports**

- 主键 `id`；**唯一 `(date, timezone)`**；字段：date, timezone, model, prompt_version, content_json, created_at

**P1 预留表**

- **users**：主键 id；唯一 email；字段 email, password_hash, role, created_at
- **favorites**：主键 id；**唯一 `(user_id, target_type, target_id)`**；字段 user_id(FK), target_type(article/event/topic), target_id
- **watchlists**：主键 id；**唯一 `(user_id, watch_type, watch_id)`**；字段 user_id(FK), watch_type(security/company/industry/country/person/institution/commodity/topic), watch_id
- **companies**：主键 id；唯一 name；字段 name, aliases, country；`article_companies`：**唯一 `(article_id, company_id)`**，含 relation(direct/indirect/supply_chain)、confidence、reason
- **securities**：主键 id；唯一 `(ticker, exchange)`；字段 ticker, exchange, company_name, company_id(FK), sector, industry；**P0 仅建表，P1 阶段 17 填数并启用关联**
- **industries**：主键 id；唯一 name；`article_industries`：**唯一 `(article_id, industry_id)`**

## 5. API 设计

统一返回 `{ success, data, error }`；分页返回 `{ items, nextCursor, hasMore }`（Cursor Pagination）。

**公开 API**：

```
GET /api/news            # cursor 分页 + 时间/市场/分类/国家/source/score/featured/event 筛选
GET /api/news/:id
GET /api/events
GET /api/events/:id
GET /api/hot             # 1h/3h/6h/12h/24h/7d 窗口
GET /api/daily
GET /api/topics
GET /api/topics/:id
GET /api/search          # 见 §7 中文搜索方案
GET /api/sources
```

**后台 API（阶段 13，需服务端鉴权）**：

```
POST   /api/admin/sources          PATCH /api/admin/sources/:id
POST   /api/admin/articles/:id/reanalyze
POST   /api/admin/articles/:id/feature
POST   /api/admin/events/:id/recluster
POST   /api/admin/events/:id/merge
POST   /api/admin/events/:id/split
```

## 6. Pipeline 状态机与任务队列

### 6.1 Queue（BullMQ）

队列契约固定为 `crawl / normalize / ai_process / embedding / cluster / score / daily_report`。阶段 08 已真实接入 `ai_process` handler；当前 Worker 只启动 `crawl`、`normalize`、`ai_process`，其余名称只冻结版本化载荷契约，投递时明确拒绝，不启动消费者、不做成功占位。

阶段 07 的实际链路是：Worker 启动后按 `sources.crawl_interval` 计算到期 slot，把 source 投递到 `crawl`；`crawl` 使用 SafeFetcher/SourceAdapter，先以 `pending` 保存 Raw，再投递 `normalize`；`normalize` 复用三键去重并更新 Raw/Article。`crawl-once` 只负责入队并等待队列排空，不保留同步业务旁路。

阶段 08 在 `normalize` 创建新 Article 后，以确定性缓存键创建 `financial-filter`，成功后按 `translate → summarize → classify → entity-extraction` 顺序继续投递。非财经 Article 保留原文、设为 `filtered_out` 并隐藏；成功任务不会再次调用 Provider，Provider/模型/Prompt 版本、结构化结果和 usage 均可追踪。

运行配置集中在 `apps/worker/src/config/worker-config.ts`：默认队列前缀 `financehot:stage07`、并发 `2`、attempts `3`、指数退避初始 `1000ms`、完成/失败各保留 `100` 条；可由 `.env` 的 `FINANCEHOT_*` 覆盖。每个 source 使用确定性 job ID 和 Redis 分布式锁，数据库唯一约束是最终防线。

### 6.2 Article Pipeline 状态机（粗粒度，`articles.processing_status`）

```
RAW
 │  ── 原始快照落 raw_articles
NORMALIZED
 │  ── 标准化为 articles：字段对齐、来源规范化、语言识别
FINANCIAL_FILTERED
 │  ├──► FILTERED_OUT      （非财经/噪声，终态；记录 rejected_reason）
 │  ── 财经相关性过滤，必须在翻译之前，避免对噪声浪费 LLM 成本
DEDUPLICATED
 │  ├──► DUPLICATE         （重复，终态；记录 duplicate_of）
 │  ── URL + 标题层去重（第一、二层），在翻译之前，避免对重复内容重复调用 LLM
TRANSLATED
 │  ── 生成中文标题/摘要，原文保留
SUMMARIZED / CLASSIFIED
 │  ── 中文摘要 + 一级分类 + 标签（实现上可与翻译合并为一次 LLM 调用，逻辑状态分开记录）
ENTITY_EXTRACTED
 │  ── 国家/公司/ticker 候选抽取
EMBEDDED
 │  ── 生成并持久化 Embedding（article_embeddings）
 │  ── 语义层去重（第三层）依赖 Embedding，在此之后与聚类合并执行
CLUSTERED
 │  ── 归属/创建 Event（event_articles）
SCORED
 │  ── 计算 Article Finance Score + 聚合 Event Finance/Heat Score
PUBLISHED
 └──► 前台可见
```

**异常路径**：任一步失败 → `RETRY`（指数退避）→ `FAILED`（终态，可后台重跑）。

**顺序理由（成本与依赖驱动）**：

1. FINANCIAL_FILTERED 在 TRANSLATED 之前——先滤噪声，省 LLM 成本。
2. DEDUPLICATED（URL+标题）在 TRANSLATED 之前——先去重，省 LLM 成本。
3. 语义层去重在 EMBEDDED 之后——因为它依赖 Embedding 向量，与 CLUSTERED 共用一套向量相似度基础设施。

**职责分层**：

- `articles.processing_status`：**粗粒度** Pipeline 状态（上表）。
- `ai_tasks.status` / `crawl_tasks.status`：**细粒度**任务状态（pending/running/success/failed/retrying + retry_count + error）。
- 阶段 08 的 `ai_process` 只执行过滤、翻译、摘要、分类、实体抽取；非财经 Article 设为 `filtered_out` 并 `is_hidden=true`，原始字段不覆盖；阶段 09 才处理 Embedding/聚类。
- **不**让单个 processing_status 承载所有重试与错误信息。

### 6.3 失败与重试语义（BullMQ）

- MVP **不实现独立 Dead Letter Queue（DLQ）**；不把 BullMQ 描述为自动提供独立 DLQ。
- 失败处理 = **BullMQ failed set** + **当前已实现 handler 的 `crawl_tasks` 持久化失败状态**；Admin 后台重跑留后续阶段。
- Worker 关闭时停止接收新任务，等待在途任务并关闭 Worker/Queue/Redis/DB；未完成的 waiting/stalled job 由 BullMQ 保留并在新 Worker 启动后继续。
- 未来确有需要时，再增加专门 DLQ（独立队列 + 死信消费）；阶段 07 不实现独立 DLQ。

## 7. 搜索架构（中文优先）

MVP 不引入搜索集群，全部基于 PostgreSQL 扩展：

| 内容              | 方案                                              |
| ----------------- | ------------------------------------------------- |
| 中文标题/中文摘要 | **pg_trgm** substring / similarity 搜索           |
| 英文标题/英文摘要 | PostgreSQL **Full Text Search**（tsvector + GIN） |
| 股票 Ticker       | **exact / prefix** 搜索（btree/text_pattern_ops） |
| 公司别名          | **alias 匹配 + trigram**                          |

- 数据库初始化预留：`CREATE EXTENSION IF NOT EXISTS pg_trgm;`
- 未来数据量/复杂度显著增加后，升级 OpenSearch / Elasticsearch；**MVP 不提前引入**。
- **P0 只实现基础新闻/事件搜索**（标题/摘要/来源/国家/分类/标签）。
- **证券 Ticker / A股 / 港股 / 美股 / 公司证券关联搜索属 P1 阶段 17**，P0 预建 `securities` 表但**不承诺** Ticker→Article 关联搜索能力。

## 8. 评分权威层级

| 分数                        | 权威对象 | 含义                            | 来源                              |
| --------------------------- | -------- | ------------------------------- | --------------------------------- |
| Finance Score（Article 级） | articles | 单篇新闻本身重要性（0–100）     | AI 分项加权，文章级               |
| Finance Score（Event 级）   | events   | 事件整体重要性（0–100）         | 成员 Article 聚合 + 事件级修正    |
| Heat Score                  | events   | 事件升温速度（0–100，时间衰减） | 报道数量/增速/高质量源/国家多样性 |

- **Heat Score 以 Event 为唯一权威对象**。
- **取消 article 级 heat_score**（原文档 articles 核心字段中的 heat_score 移除）：Heat 的全部计算维度（报道媒体数、增速、高质量源数、国家数、重复报道增速）均为事件聚合维度，单篇文章无独立"热"语义，保留只会制造与 Event Heat 不一致的第二事实源。

## 9. 采集 SourceAdapter 接口

```ts
// packages/crawler —— 输入/输出 DTO（DTO 定义在 packages/shared）
export type SourceType = 'rss' | 'api' | 'web';

export interface SourceAdapter {
  type: SourceType;
  fetch(source: Source): Promise<RawItem[]>; // 抓取（超时/退避/SSRF防护）
  parse(raw: RawItem[]): Promise<ParsedItem[]>; // 解析为结构化条目
  normalize(parsed: ParsedItem[], source: Source): Promise<NormalizedArticleDTO[]>; // 标准化 DTO
}
```

- 优先级 API > RSS > 公开网页；尊重 robots.txt、控制频率、指数退避、最大重试。
- 不绕过登录/付费墙/验证码/访问控制。
- SSRF 防护统一在 fetcher 层：阻止 loopback/private/link-local/metadata 地址并校验重定向后地址。
- **crawler 不写库、不调用 ai**，只产出 `NormalizedArticleDTO`；持久化由 worker 完成。
- 首批 5–10 个稳定且允许使用的公开来源。

## 10. P0/P1/P2 范围与顺序

- **P0（阶段 00–16）**：首页/全部动态/详情/事件详情/热点榜/日报/搜索/筛选；RSS+网页基础采集；AI 中文摘要/分类/过滤/实体/评分；Finance/Heat 双评分；去重+基础事件聚类+多信源；后台来源/新闻/事件管理；PostgreSQL/Redis/Worker/Docker/Dark Mode。
  - P0 搜索 = 基础新闻/事件搜索（标题/摘要/来源/国家/分类/标签）。
- **P1（阶段 17–18）**：证券/公司/行业关联 + A 股影响；**证券 Ticker/公司证券关联搜索**；用户/收藏/自选/个性化排序。依赖 MVP 稳定。
- **P2（阶段 19）**：行情联动/事件反应/盘前盘后简报/通知。依赖 P1。

**边界一致性约束**：验收标准不得提前要求尚未开发的数据能力（如 P0 不得要求 Ticker→Article 搜索）。

## 11. 架构风险清单

| 风险             | 说明                             | 缓解                                                          |
| ---------------- | -------------------------------- | ------------------------------------------------------------- |
| 去重误判         | 同公司不同事件被误杀             | 阈值配置化；重复 ≠ 同事件；人工解除误判接口                   |
| 聚类误判         | 不同事件被错误合并               | 宁可少合并；时间窗+实体+Embedding+LLM 边界二次判断            |
| LLM 成本         | 链路长，逐环节调用成本失控       | 先过滤再翻译、先去重再翻译、合并调用、结果缓存、ai_usage 记录 |
| 版权             | 未经授权全文转载                 | 只展示标题/摘要/链接；不抄参考站源码与品牌                    |
| 爬虫合规         | 付费墙/验证码/robots             | 不绕过访问控制；API>RSS>网页；换源优先于硬抓                  |
| SSRF             | 恶意 URL 打内网                  | fetcher 统一校验私网/loopback/link-local/metadata + 重定向    |
| Prompt Injection | 网页正文含"忽略指令"             | 正文仅作数据；系统 Prompt 与正文严格分隔                      |
| pgvector×ORM     | 向量存储与 ORM 兼容              | Drizzle 原生 pgvector；见 ADR-001                             |
| Windows 开发     | pnpm/Node/Docker 在 win32 的兼容 | 阶段 01 实测；以 docker compose 为主                          |

## 12. ADR 索引

- [ADR-001](./ADR-001.md) —— 总体技术选型（保持不变）
- [ADR-002](./ADR-002.md) —— Article/Event 关系、Embedding 持久化与评分/搜索/队列语义
