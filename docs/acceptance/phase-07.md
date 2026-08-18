# 阶段 07 验收：BullMQ crawl→normalize 可靠后台流水线

日期：2026-08-17；验收修复复验：2026-08-18
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

阶段 07 Worker 集成测试共 24 项，加上阶段 06 Worker 测试 9 项，共 33 项，0 skip/todo，覆盖：

- contract version、关联 ID、未知 job 和未实现 job 拒绝；
- source 入队、Raw→normalize、Article 落库；
- 确定性 job ID、重复投递、同源并发、两个 Worker 共用 source lock；
- canonical/content/title 三键去重、三轮重复输入；
- retrying 可观察、短暂 network 失败后成功、耗尽后 failed set+DB failed；
- 启动调度、crawl interval、completed 保留；
- waiting job 的 Worker 重启接手、active job 在 Worker 异常中断并超过 lock 后转为 stalled、由新 Worker 接管、graceful shutdown、停止接收新任务、关联日志。

最终 Worker 测试命令及实际输出摘要：

```text
$env:CI='true'; pnpm --filter @financehot/worker test
$ tsx --test --test-concurrency=1 "src/**/*.test.ts"
✔ worker crawl-once PostgreSQL 集成 (9 tests)
✔ 阶段07真实 Redis + PostgreSQL BullMQ 集成
ℹ tests 33
ℹ suites 2
ℹ pass 33
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
✔ active job 所在 Worker 异常中断后由新 Worker 识别 stalled 并接管
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

立即还原该临时改动后，当时的完整 Worker 测试恢复 `32 pass / 0 fail / 0 skipped / 0 todo`，证明目标断言确实能捕获失败落库回归。

2026-08-18 复验发现并修正两处验收缺口：删除 `crawl-once` 将已耗尽任务从 `failed` 回写为 `retrying` 的兼容分支，并把对应旧断言改为 BullMQ 与数据库均为 `failed`；新增真实 active job 异常中断、锁过期、stalled 检测与新 Worker 接管测试。随后为阶段 06 `crawl-once` 测试设置每轮唯一 queue prefix 并在正常退出时精确清理，避免中断测试污染默认 Stage 07 队列。修复后的完整 Worker 测试为 `33 pass / 0 fail / 0 skipped / 0 todo`。

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
Worker: 33 pass / 0 fail / 0 skipped / 0 todo
Tasks: 7 successful, 7 total

pnpm build -- --force
Tasks: 7 successful, 7 total

git diff --check
exit code: 0
```

## 6. 其余边界

- 阶段 07 不改 DB schema/migration、Web/Crawler/AI/UI；2026-08-18 仅修正 1 项阶段 06 Worker 旧断言，使其与耗尽任务必须落为 `failed` 的状态契约一致。
- 不实现 AI 业务、Embedding、事件聚类、评分、日报或后台手动重跑。
- 没有独立 DLQ；failed set 与 `crawl_tasks` 是当前失败查询面。
- `crawl-once` 与常驻 Worker 现在遵循同一耗尽语义：BullMQ failed set 与 `crawl_tasks.status=failed` 一致，不再为旧诊断统计改写状态。
- 生产多进程部署、监控告警、Admin 重跑入口和更复杂的调度 leader 机制留后续阶段；本阶段已验证同 prefix 多 Worker 的 source lock、waiting 接手、active→stalled 接管和优雅关闭。
