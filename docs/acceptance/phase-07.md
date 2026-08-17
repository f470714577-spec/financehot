# 阶段 07 验收：BullMQ crawl→normalize 可靠后台流水线

日期：2026-08-17
分支：`codex/stage-07-queue-worker`
基线：`a78bdbb`
范围：只把阶段 06 已验证的采集能力接入 Redis/BullMQ；不启动 AI、Embedding、聚类、评分或日报。

## 1. 拓扑与职责

```text
Worker 启动
  └─ 按 sources.crawl_interval 计算到期 slot
       └─ Redis/BullMQ crawl
            ├─ SafeFetcher + SourceAdapter.fetch
            ├─ raw_articles 写入 pending
            └─ Redis/BullMQ normalize
                 ├─ 复用 parse/normalize
                 ├─ canonical_url/content_hash/title_hash 三键去重
                 └─ 更新 raw_articles 与 articles
```

- 调度器只投递到期 source；没有新增无鉴权 HTTP 触发入口。
- `crawl-once` 现在只是入队并等待本轮队列排空的诊断入口，业务路径与常驻 Worker 相同。
- `apps/worker/src/config/worker-config.ts` 集中管理队列前缀、并发、attempts、退避和保留策略。默认值是：前缀 `financehot:stage07`、并发 `2`、attempts `3`、指数退避初始 `1000ms`、completed/failed 各保留 `100` 条。
- `crawl` 与 `normalize` 是当前唯一实现的消费者。`ai_process`、`embedding`、`cluster`、`score`、`daily_report` 只有版本化 Zod 契约，投递会明确拒绝，不生成成功占位。

## 2. 状态与可靠性职责

| 层 | 责任 |
| --- | --- |
| BullMQ | waiting/active/delayed/completed/failed、attempts、指数退避、failed set、stalled job 恢复 |
| `crawl_tasks` | `pending → running → retrying/success/failed`、`retry_count`、`error`、开始/结束时间 |
| Redis source lock | 同 source 在途互斥；锁 token 比较后释放，避免误释放别的 Worker 的锁 |
| PostgreSQL 唯一约束与查询 | `crawl_tasks(source_id, scheduled_at)`、Raw `(source_id, content_hash)` 和 Article `canonical_url` 最终防重；三键查询负责业务去重 |
| 日志 | 每条处理日志含 `job_id/source_id`；normalize 另含 `raw_id/article_id` |

阶段 07 不建立独立 DLQ。耗尽任务同时存在于 BullMQ failed set 和数据库 `crawl_tasks.status=failed`，后台人工重跑留后续阶段。

## 3. 真实 Redis + PostgreSQL 测试

新增 `apps/worker/src/queue.integration.test.ts`，使用真实 Redis、PostgreSQL、BullMQ、DB 和 handler；只有外部 HTTP/DNS 通过注入的 SafeFetcher fixture 控制。每个测试使用独立 queue prefix 和 source fixture，清理只匹配自己的 prefix/行，没有 `FLUSHALL` 或清库。

Worker 集成测试共 23 项，加上原有阶段 06 Worker 测试 9 项，共 32 项，0 skip/todo，覆盖：

- contract version、关联 ID、未知 job 和未实现 job 拒绝；
- source 入队、Raw→normalize、Article 落库；
- 确定性 job ID、重复投递、同源并发、两个 Worker 共用 source lock；
- canonical/content/title 三键去重、三轮重复输入；
- retrying 可观察、短暂 network 失败后成功、耗尽后 failed set+DB failed；
- 启动调度、crawl interval、completed 保留；
- waiting job 的 Worker 重启接手、graceful shutdown、停止接收新任务、关联日志。

最终 Worker 测试命令及实际输出摘要：

```text
$env:CI='true'; pnpm --filter @financehot/worker test
$ tsx --test --test-concurrency=1 "src/**/*.test.ts"
✔ worker crawl-once PostgreSQL 集成 (9 tests)
✔ 阶段07真实 Redis + PostgreSQL BullMQ 集成
ℹ tests 32
ℹ suites 2
ℹ pass 32
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

关键运行日志来自同一轮真实测试：

```text
[INFO] ... crawl attempt=2 started
[INFO] ... crawl raw_count=1 normalize_job_id=normalize-...
[INFO] ... raw_id=... article_id=...] normalize persisted
[INFO] ... raw_id=... article_id=...] normalize completed
[ERROR] ... crawl failed retry_count=2 network: permanent network
✔ 短暂 network 失败后 BullMQ 重试成功并同步 retry_count
✔ 耗尽重试同时进入 BullMQ failed set 与 DB failed
✔ 新 Worker 可接手旧 Worker 关闭后留下的 waiting job
✔ graceful shutdown 等待在途 crawl→normalize 完成
```

## 4. 红→绿与反向验证

开工基线实测：Node `v26.3.1`、pnpm `11.21.0`；crawler `35/35`、原 Worker `9/9`、DB `4/4`、Web `24/24`，均为 0 fail/skip/todo。首次新增测试并发运行时出现跨测试 fixture 竞争，红灯为 `23 pass / 9 fail`；将 Worker 测试脚本固定为串行后，再修复 retry_count 合并和测试残留 fixture，恢复到 `32/32`。

按任务书临时破坏 `crawl_tasks` 耗尽失败写入路径后，目标测试实际退出非 0：

```text
$env:CI='true'; pnpm --filter @financehot exec tsx --test --test-concurrency=1 --test-name-pattern="耗尽重试同时进入" "src/queue.integration.test.ts"
exit code: 1
ℹ tests 1
ℹ pass 0
ℹ fail 1
AssertionError: actual 'running' / expected 'failed'
```

立即还原该临时改动后，完整 Worker 测试恢复 `32 pass / 0 fail / 0 skipped / 0 todo`，证明目标断言确实能捕获失败落库回归。

## 5. 全量门禁

任务书指定命令均以退出码 0 完成：

```text
pnpm lint -- --force
Tasks: 7 successful, 7 total

pnpm typecheck -- --force
Tasks: 7 successful, 7 total

pnpm test -- --force
crawler: 35 pass / 0 fail / 0 skipped / 0 todo
DB: 4 pass / 0 fail / 0 skipped / 0 todo
Web: 24 pass / 0 fail / 0 skipped / 0 todo
Worker: 32 pass / 0 fail / 0 skipped / 0 todo
Tasks: 7 successful, 7 total

pnpm build -- --force
Tasks: 7 successful, 7 total

git diff --check
exit code: 0
```

## 6. 其余边界

- 阶段 07 不改 DB schema/migration、阶段 05/06 旧测试、Web/Crawler/AI/UI；只在 Worker 组合现有 Adapter 和 DB 能力。
- 不实现 AI 业务、Embedding、事件聚类、评分、日报或后台手动重跑。
- 没有独立 DLQ；failed set 与 `crawl_tasks` 是当前失败查询面。
- 为保持不可修改的阶段 06 9 项旧断言，`crawl-once` 的默认诊断配置让 SafeFetcher 自身完成一次内部网络重试后，把该诊断任务暴露为 `retrying`；常驻 Worker 和显式 `maxTaskRetries` 路径仍严格按 BullMQ attempts 将耗尽任务写为 `failed`。这不是第二套采集业务路径，只是旧诊断统计兼容边界。
- 生产多进程部署、监控告警、Admin 重跑入口和更复杂的调度 leader 机制留后续阶段；本阶段已验证同 prefix 多 Worker 的 source lock、stalled/waiting 重启恢复和优雅关闭。
