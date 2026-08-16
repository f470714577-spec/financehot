# 阶段 05 验收记录

日期：2026-08-16
分支：`codex/stage-05-news-api`
状态：代码与静态门禁完成；真实 PostgreSQL 验收被本机数据库未启动阻塞，未宣称阶段完成。

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

迁移文件已由 `drizzle-kit generate` 生成，旧 migration `0000_*` 未修改。由于 PostgreSQL 未启动，本轮没有执行 `EXPLAIN (ANALYZE, BUFFERS)`；不能伪造查询计划结论，恢复数据库后必须补跑并按实际计划调整。

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

### 数据库与真实测试阻塞

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

本轮未执行数据库 migration、Seed、`EXPLAIN`、真实 API 全绿验收，也未完成红→绿的全套反向验证；原因均为外部本地 PostgreSQL/Docker 状态，不是通过 skip、mock、弱化断言或吞错规避。恢复数据库后执行顺序：`pnpm --filter @financehot/db db:migrate` → `pnpm --filter @financehot/db db:seed` → `pnpm --filter @financehot/web test` → 反向 cursor 断言红→还原绿 → `pnpm test` → `EXPLAIN (ANALYZE, BUFFERS)` 证据补录。
