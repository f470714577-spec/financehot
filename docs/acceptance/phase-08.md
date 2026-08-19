# 阶段 08 验收记录

> 状态：工程验收完成（本地稳定基线）。本文只记录实际执行过的命令和输出；真实模型质量验收已由领导移至供应商选定后的上线前验收。

## 范围与边界

- 允许的 AI 步骤：`financial-filter`、`translate`、`summarize`、`classify`、`entity-extraction`。
- 只启用 `crawl`、`normalize`、`ai_process`；不实现 Embedding、聚类、Finance Score、市场多空判断、后台或前端重构。
- Provider 是由 `LLM_PROVIDER`、`LLM_BASE_URL`、`LLM_MODEL`、`LLM_API_KEY` 配置的 OpenAI-compatible HTTP 适配器。
- 当前没有真实模型密钥；本地受控 HTTP Provider 不能证明真实模型质量，最终结论必须保留“真实模型质量未验收”。

## 2026-08-19 当前收口结论

- Web 测试专属当前时间 Event 已插入并在 after 中按确定 ID 清理；Web `24/24`，清理后测试 Event 与关联关系均为 0。临时禁用 fixture 时同一热点断言红（`23 pass / 1 fail`），还原后绿（`24/24`）。
- Provider 每次实际 HTTP attempt 均携带不含密钥、Authorization、Prompt 或响应正文的审计记录；`ai_usage` 增加 `provider_attempt`、`outcome`、`http_status`、`usage_reported`，新增向前 migration `0006`，唯一约束为 `(ai_task_id, attempt, provider_attempt)`。
- AI `10/10`、Worker `39/39`，覆盖重试成功、非法 JSON、Schema 失败、timeout/500 耗尽、重复处理和双 Worker 竞争；失败或无 usage 时标记供应商未报告，成本保持 NULL。
- 失败路径红→绿：临时跳过 Worker 的失败审计写入时 AI pipeline 集成测试为 `3 pass / 3 fail`，失败包含 `37 !== 39`、非法 JSON/Schema `0 !== 1` 和耗尽请求 `0 !== 3`；还原后同一入口 `6 pass / 0 fail / 0 skip / 0 todo`。
- 根级 `$env:CI='true'; pnpm lint -- --force`、`typecheck`、`test`、`build` 均退出 0，Turbo 均 `7/7 successful`；全仓测试数量为 Web `24`、AI `10`、Worker `39`、crawler `35`、DB `4`，均 0 fail/skip/todo。
- `apps/worker/package.json` 相对 `4d146a8` 仅有获批的 `@financehot/ai` 与 `zod` 必要声明；本阶段当前阻塞为“无”。未调用真实 Key，未宣称真实模型质量或成本。

## 历史静态与 Provider 证据（2026-08-18）

```text
node packages/ai/src/provider.test.ts
✔ OpenAI-compatible Provider 成功解析纯 JSON、usage 和请求配置
✔ 未配置 Provider 明确报告 unconfigured 且不发请求
✔ 401 不重试并分类为 authentication
✔ 429/5xx 只做有限重试，恢复后返回成功
✔ 重试耗尽与超时都分类且不会无限请求
✔ 非法 JSON 和 Schema 不符均拒绝，不从 Markdown 猜结果
✔ usage 成本在价格未知时留空，配置替换只改变 Provider 目标
ℹ tests 7
ℹ pass 7
ℹ fail 0
ℹ skip 0
ℹ todo 0
```

AI、Worker、DB 直接 TypeScript 检查已退出 0；真实服务恢复后的包级测试见下文。

## 历史真实 PostgreSQL/Redis 与 migration（2026-08-18）

```text
docker compose up -d postgres redis
postgres  Running (healthy), 5433->5432
redis     Running (healthy), 6379->6379

pnpm --filter @financehot/db db:migrate
Using 'pg' driver for database querying
[✓] migrations applied successfully!

本轮完成审计新增 `0005_ai_usage_article_cascade.sql`；只读核对已应用外键：
ai_tasks.article_id  REFERENCES articles(id) ON DELETE CASCADE
ai_usage.article_id  REFERENCES articles(id) ON DELETE CASCADE

$env:CI=true; pnpm --filter @financehot/worker test -- --force
```

## 历史真实队列与数据库端到端证据（2026-08-18）

测试入口为 `apps/worker/src/ai-pipeline.integration.test.ts`，使用真实 PostgreSQL/Redis、真实 Worker/BullMQ、真实数据库 Schema 和本地受控 OpenAI-compatible HTTP Provider；受控服务只模拟外部协议，不替换流水线核心。

```text
pnpm --filter @financehot/worker exec tsx --test --test-concurrency=1 src/ai-pipeline.integration.test.ts
✔ 真实 Redis/PostgreSQL + 受控 OpenAI-compatible HTTP 完成十条 Article 的 AI 流水线与缓存验收
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

该测试实际断言：10 条英文 Article 中 2 条非财经进入 `filtered_out` 且隐藏，7 条财经 Article 完成中文标题、80–180 字摘要、reason、分类和国家关系；1 条受控失败在 `retry_count=2` 后为 `failed`；Prompt Injection 仅作为正文内容；原始标题/摘要保持不变；过滤 Article 不出现在 `listNews`；重复成功任务不增加 `ai_usage`，也不增加受控 HTTP 请求。

恢复后的包级回归：

```text
$env:CI='true'; pnpm --filter @financehot/worker test -- --force
ℹ tests 34
ℹ pass 34
ℹ fail 0
ℹ skipped 0
ℹ todo 0

pnpm --filter @financehot/db test -- --force
ℹ tests 4
ℹ pass 4
ℹ fail 0
ℹ skipped 0
ℹ todo 0

pnpm --filter @financehot/crawler test -- --force
ℹ tests 35
ℹ pass 35
ℹ fail 0
ℹ skipped 0
ℹ todo 0
```

首次回归发现的是上一次异常中断留下的唯一 `stage08-it-* / controlled.example/article/*` 测试残留；只读核对后按精确 source 名清理，结果 `remaining_articles=0`、`remaining_sources=0`，随后 Worker 全量重跑为 `34 pass / 0 fail / 0 skip / 0 todo`。未清理 Seed 或其他 Article。

## 缓存保护反向验证：红 → 绿

临时把成功任务的短路保护改为允许再次执行，未改测试、未改数据库数据；目标测试实际以 usage 增长退出 1：

```text
pnpm --filter @financehot/worker exec tsx --test --test-concurrency=1 src/ai-pipeline.integration.test.ts
✖ 真实 Redis/PostgreSQL + 受控 OpenAI-compatible HTTP 完成十条 Article 的 AI 流水线与缓存验收
AssertionError [ERR_ASSERTION]
51 !== 37
command failed exit code 1
```

立即还原保护后，重跑同一命令全绿：

```text
✔ 真实 Redis/PostgreSQL + 受控 OpenAI-compatible HTTP 完成十条 Article 的 AI 流水线与缓存验收
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

## 历史根级工程门禁（2026-08-18）

```text
$env:CI='true'; pnpm lint -- --force
Tasks: 7 successful, 7 total
exit code 0

$env:CI='true'; pnpm typecheck -- --force
Tasks: 7 successful, 7 total
exit code 0

$env:CI='true'; pnpm build -- --force  # 获批沙箱外复跑
Tasks: 7 successful, 7 total
exit code 0
```

根级测试实际结果如下；除 Web 外的包均通过，Web 的既有时间窗口失败使根级 test 退出 1：

```text
$env:CI='true'; pnpm test -- --force
Tasks: 5 successful, 7 total
Failed: @financehot/web#test
@financehot/web:test: ℹ tests 24
@financehot/web:test: ℹ pass 23
@financehot/web:test: ℹ fail 1
@financehot/web:test: ℹ skipped 0
@financehot/web:test: ℹ todo 0
ERROR: run failed
exit code 1
```

## 历史阻塞（已解除）

2026-08-18 Docker Desktop 已从 `F:\DOCKER\DockerDesktop\Docker Desktop.exe` 启动，PostgreSQL/Redis 均 healthy，0003/0004/0005 migration 已成功。Worker `34/34`、DB `4/4`、crawler `35/35` 全绿；Web 历史基线为 `23 pass / 1 fail`，失败是热点时间窗口 Seed 为空，原始输出已置于 `BLOCKED.md` 顶部。Web/全量门禁受该既有数据问题影响，未修改 Web、Seed 或旧测试。该阻塞已由本轮测试专属当前时间 Event 解除；没有真实模型密钥，因此真实模型质量仍未验收。
