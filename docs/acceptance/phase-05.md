# 阶段 05 验收记录

日期：2026-08-17
分支：`codex/stage-05-news-api`
状态：阶段 05 收尾实测通过；PostgreSQL、Redis、迁移/Seed、9 类 API、前台双视口、EXPLAIN 与工程门禁均有真实证据。

## 已实现

- `shared` 定义 Zod 查询参数、DTO 和统一成功/错误响应类型；参数错误 400、资源缺失 404、意外错误 500，500 响应不返回 SQL 或栈。
- 新增 `/api/news`、`/api/news/[id]`、`/api/events`、`/api/events/[id]`、`/api/hot`、`/api/daily`、`/api/topics`、`/api/topics/[id]`、`/api/search`。
- 列表使用 `{items,nextCursor,hasMore}`；news/search 的排序为 `published_at DESC NULLS LAST, id DESC`；cursor 为带 HMAC 校验的复合 payload，不透明且篡改会返回 400。
- 搜索范围覆盖 Article/Event 标题、摘要、来源、国家、分类、标签、主题；查询同时保留 PostgreSQL FTS、`pg_trgm` `similarity` 和中文 `ILIKE` 兜底。
- Article/Event 关系只通过 `event_articles` 查询；Article DTO 没有 `event_id`，Heat 只从 Event 读取。
- 详情查询固定批量：Event 详情为事件、文章批量、时间线 3 条 SQL；Topic 详情为主题、事件批量、文章批量 3 条 SQL；没有按 Article 逐条查询。
- 阶段 04 前台路由全部改为同一 DB 查询服务；news 筛选、搜索、URL 条件、debounce 和 cursor 加载更多由 API 驱动；保留 Seed 数据版本提示。
- Web 集成测试为 20 项真实 Node test + tsx，不 mock 数据库或被测对象，覆盖 9 类 API、cursor、组合筛选、中文搜索、非法参数、篡改 cursor、404、错误体和固定查询次数。

## 新增迁移与索引

`packages/db/drizzle/0001_lucky_spacker_dave.sql` 只新增：

- 可见 Article 的 `published_at DESC, id DESC` partial index；
- `event_articles(article_id,event_id)`；
- `article_categories(category_id,article_id)`；
- `article_countries(country_id,article_id)`；
- `article_tags(tag_id,article_id)`。

迁移文件已由 `drizzle-kit generate` 生成，旧 migration `0000_*` 未修改。2026-08-16 的首次收尾因 PostgreSQL 未启动而没有执行 `EXPLAIN (ANALYZE, BUFFERS)`；该历史阻塞已在 2026-08-17 恢复服务后补跑，详见下方最终实测记录。

## 实际命令证据

### 基线

```text
git status --porcelain
(空)
pnpm --version
11.21.0
node --version
v26.3.1
```

### 静态工程门禁

```text
pnpm lint
Tasks: 7 successful, 7 total
exit 0

pnpm typecheck
Tasks: 7 successful, 7 total
exit 0

pnpm build
@financehot/web:build: ✓ Compiled successfully
@financehot/web:build: ✓ Generating static pages (9/9)
Tasks: 7 successful, 7 total
exit 0

git diff --check
exit 0

rg -n "@/lib/demo-data|@financehot/db/seed-data" apps/web
0 matches（rg 无匹配时进程退出 1）
```

### 2026-08-16 历史数据库与真实测试阻塞

```text
pnpm --filter @financehot/db db:migrate
AggregateError [ECONNREFUSED]
connect ECONNREFUSED ::1:5433
connect ECONNREFUSED 127.0.0.1:5433
exit 1

docker compose up -d postgres redis
unable to get image 'redis:7-alpine': failed to connect to the docker API
Docker Desktop Linux engine named pipe 不存在
exit 1

pnpm --filter @financehot/web test
ℹ tests 20
ℹ pass 2
ℹ fail 18
ℹ skipped 0
ℹ todo 0
主要失败原因：PostgreSQL 5433 ECONNREFUSED；参数错误测试仍实际通过。
exit 1

pnpm test
@financehot/db:test: tests 4, pass 0, fail 4（同一 PostgreSQL 5433 连接阻塞）
@financehot/web:test: tests 20，受同一数据库阻塞
exit 1
```

2026-08-16 未执行数据库 migration、Seed、`EXPLAIN`、真实 API 全绿验收，也未完成红→绿的全套反向验证；原因均为外部本地 PostgreSQL/Docker 状态，不是通过 skip、mock、弱化断言或吞错规避。2026-08-17 已按下方顺序补齐。

## 2026-08-17 收尾最终实测

### 依赖服务、迁移与 Seed

```text
docker version --format '{{.Server.Version}}'
29.7.2
docker compose ps --format '{{.Service}} {{.State}} {{.Health}}'
postgres running healthy
redis running healthy
docker exec financehot-postgres pg_isready -U financehot -d financehot
/var/run/postgresql:5432 - accepting connections
docker exec financehot-redis redis-cli ping
PONG
```

`pnpm --filter @financehot/db db:migrate` 输出 `[✓] migrations applied successfully!`；Seed 输出 `sources=15, articles=82, events=12, topics=8, daily_reports=1`。只读 SQL 核对：公共表 `20` 张，扩展 `pg_trgm 1.6`、`vector 0.8.6`。

### 真实测试与反向验证

```text
pnpm --filter @financehot/db test
ℹ tests 4 / ℹ pass 4 / ℹ fail 0 / ℹ skipped 0 / ℹ todo 0

pnpm --filter @financehot/web test
ℹ tests 20 / ℹ pass 20 / ℹ fail 0 / ℹ skipped 0 / ℹ todo 0
```

反向验证时仅把篡改 cursor 的期望从 `400` 改为 `401`：`tests 20, pass 19, fail 1, exit 1`，失败原因为实际 `400 !== 401`；立即恢复后再次得到 `tests 20, pass 20, fail 0`，`apps/web/src/api.integration.test.ts` 相对 `555d8ec` diff 为 `0`。

### 五类 EXPLAIN (ANALYZE, BUFFERS)

| 查询目的 | 实际计划、行数与执行时间 | 索引使用与判断 |
| --- | --- | --- |
| 新闻时间流：可见 Article 按 `published_at/id` 倒序 | `Seq Scan articles` 82 行 → top-N Sort，返回 11 行；`Execution Time 0.128 ms`，`shared hit=14` | 未选 partial index；Seed 仅 82 行，计划无界且无逐条放大，接受并记录，不为 Index Scan 反向优化 |
| 24h + 宏观 + `minScore=80` | `Nested Loop`/`HashAggregate`，返回 1 行；`Execution Time 0.177 ms`，`shared hit=23`；实际 API 同条件 `status=200, items=1` | `categories_slug_unique`、`articles_pkey`、`sources_pkey` 命中；关联小表 Seq Scan 是 Seed 规模下合理计划 |
| 中文搜索“美联储” | `Hash Join`，返回 12 行、LIMIT 返回 11 行；`Execution Time 3.120 ms`，`shared hit=124`；关联条件为一次性 `hashed SubPlan 2/4/6/8/10` | 无逐 Article 相关扫描；`event_articles` Seq Scan `loops=1`，不是 N+1。未使用 trigram index，因当前实现是组合字段表达式且 Seed 很小；保留 `pg_trgm`/FTS/ILIKE 语义 |
| 热点 `24h` | `Seq Scan events` 7 行 → Sort，返回 6 行；`Execution Time 0.053 ms`，`shared hit=7` | 未选 `events_heat_score_idx`；时间窗口与热度排序组合在 12 行 Seed 上无错误放大，接受 |
| 多信源事件详情（事件文章批量 + 时间线） | 文章批量 Hash Join 返回 7 行，`Execution Time 0.258 ms`；时间线 `Bitmap Index Scan event_timeline_event_id_idx`，返回 0 行，`Execution Time 0.048 ms` | 详情接口同时最多 3 条 SQL；没有逐 Article 查询，时间线索引实际使用；文章关联表小规模 Seq Scan 可接受 |

中文搜索计划曾发现相关子查询逐 Article 扫描；已在 `packages/db/src/queries/index.ts` 改为直接字段搜索 + 关联表 `EXISTS`/hashed subplan。该最小修复通过 Web 20/20，且最终计划 `event_articles loops=1`。

### 真实 HTTP API 与前台

启动 `pnpm --filter @financehot/web dev` 后，9 类 API 均真实 HTTP 200：`/api/news`、`/api/news/[id]`、`/api/events`、`/api/events/[id]`、`/api/hot`、`/api/daily`、`/api/topics`、`/api/topics/[id]`、`/api/search`；列表均含 `items/nextCursor/hasMore`。错误实测：非法参数 `400/INVALID_PARAMETERS`、篡改 cursor `400/INVALID_CURSOR`、缺失资源 `404/NOT_FOUND`、非法 ID `400/INVALID_ID`，错误消息未泄露 SQL。另以仅监听 3001 的临时进程级坏数据库地址触发 500：`status=500`、`code=INTERNAL_ERROR`、消息为“服务暂时不可用”，SQL/栈泄露检查为 `False`；正常 PostgreSQL 未停止。

浏览器按 1440×900 与 390×844 视口抽查 `/`、`/news`、`/hot`、Article/Event 详情、`/daily`、topics 列表/详情：8 路由 × 2 视口均命中预期标题、保留 Seed 提示、无横向溢出，页面控制台 error/warning `0`。交互实测：搜索写入 `q=%E7%BE%8E%E8%81%94%E5%82%A8`，宏观筛选追加 `category=macro`，刷新后 URL 保持不变；新闻加载更多卡片数 `21 → 41`。
