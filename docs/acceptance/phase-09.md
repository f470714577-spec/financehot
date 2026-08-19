# 阶段 09 验收：Embedding 与保守事件聚类

日期：2026-08-19
分支：`codex/stage-09-embedding-cluster`
范围：Article Embedding、`embedding → cluster` 队列、Article↔Event 关系和幂等；不包含评分、日报、后台、前端或真实供应商质量验收。

## 1. 边界与实现

- `EmbeddingProvider` 独立于 LLMProvider，使用 OpenAI-compatible `/embeddings`。
- 配置缺失返回 `unconfigured`，Worker 可启动且不发请求；本阶段未接真实供应商、未写入真实密钥。
- 输入固定为规范化 `title_zh + "\\n" + summary_zh`，任务记录 input hash、Provider、Model、dimensions 和 embedding version。
- 仅处理非隐藏且阶段 08 `entity_extracted` Article；`ai_process` 成功后投递 `embedding`，成功后投递 `cluster`。
- 聚类条件：同 Provider/Model/Version/dimensions、72 小时内、分类兼容、cosine similarity ≥ 0.86；不满足即创建 Event。
- 使用 pgvector 精确 cosine 查询。现表允许混合维度，本阶段不创建 HNSW/IVFFlat 索引。
- `event_articles` 是唯一关系事实源；关系、唯一主报道、Event 计数和首末时间在同一事务内维护。事务级 advisory lock 防止双 Worker 竞争拆分 Event。
- 只启用 `embedding`、`cluster`；`score`、`daily_report` 明确拒绝。

## 2. Provider 红→绿

命令：

```text
$env:CI='true'; pnpm --filter @financehot/ai test
```

先补测试后运行，旧实现因缺少 `EmbeddingProviderError` 导出退出 1；最小实现完成后：

```text
ℹ tests 17
ℹ pass 17
ℹ fail 0
ℹ skipped 0
ℹ todo 0
```

覆盖成功响应、有限数向量、dimensions、空/非法向量、缺失配置零请求、401 不重试、429/5xx 有限重试、timeout/network 和非法响应分类。

## 3. 真实服务受控验收

命令：

```text
$env:CI='true'; pnpm --dir apps/worker exec tsx --test src/embedding-cluster.integration.test.ts
```

使用真实 PostgreSQL/Redis 和本地受控 HTTP Provider，不代表真实模型质量。9 篇样本覆盖：

- 两组同事实双信源各归入一个 Event；
- 同公司但分类冲突的不同事实不合并；同分类低相似文章不合并；
- 72 小时时窗、Provider/Model/Version/dimensions 元数据、唯一主报道、article/source 计数及首末时间；
- 503 失败进入 retrying，耗尽后 failed，Provider 请求 2 次；
- 两个 Worker 竞争同一 Article 只产生 1 次 Provider 新调用；
- `ai_process → embedding → cluster` 成功链路；
- 重复成功任务新增 Provider 调用、向量、关系均为 0。

实际结果：

```text
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ skipped 0
ℹ todo 0
```

Worker 全量回归：

```text
$env:CI='true'; pnpm --filter @financehot/worker test
ℹ tests 40
ℹ pass 40
ℹ fail 0
ℹ skipped 0
ℹ todo 0
```

反向红→绿：临时把 Worker 默认相似度阈值改为 `0.0` 后，同一全量命令实际为 `tests 40 / pass 39 / fail 1`，失败断言为“低相似不得合并”，实际与 A Event 相同；阈值已立即恢复为 `0.86`，恢复后为 `40/40`。测试夹具改为同分类，确保红测确实验证阈值而不是被分类冲突保护。

## 4. Migration 与数据约束

新增且仅向前 migration：`packages/db/drizzle/0007_daily_deathbird.sql`，内容为将 `article_embeddings.dimensions` 设为 `NOT NULL`；同步新增 `0007_snapshot.json` 和 journal 条目，未修改旧 migration/meta snapshot。

已在真实 PostgreSQL 执行：

```text
$env:CI='true'; pnpm --filter @financehot/db db:migrate
[✓] migrations applied successfully!
```

已有 DB `4/4` 测试覆盖 pgvector 往返；阶段09真实集成进一步验证向量 dimensions、五字段唯一边界、`event_articles` 唯一关系和双 Worker 并发幂等。未执行清库、Seed 修改或系统时间修改。

## 5. 质量边界

本阶段证明的是协议校验、持久化追踪、真实队列/数据库事务、保守聚类规则和幂等行为。没有真实供应商、真实模型密钥或生产语料，因此真实模型的语义质量、成本和阈值适配仍未验收，必须留到供应商选定后的上线前验收。

## 6. 本轮可靠性修复红→绿

阶段09验收补出的两个可靠性缺口已用真实 PostgreSQL/Redis 增加永久回归测试，Worker 测试由 40 项增至 42 项：

- 成功 Embedding 任务重放：加载该任务精确对应的向量，复用现有幂等 cluster task 创建/入队；Provider 新调用为 0，首次入队 1 次，再次重放不新增 task 或队列 job。精确向量缺失时抛出明确数据一致性错误。
- 当前向量候选：复用 Embedding 生成路径的规范化 `title_zh + "\\n" + summary_zh` 与 SHA-256，只有 `provider/model/embedding_version/dimensions` 一致且 `input_hash` 等于 Article 当前内容 hash 的成员向量参与匹配；历史向量继续保留。

任务1先加测试的原始红叉：`tests 42 / pass 40 / fail 2 / skipped 0 / todo 0`，分别失败于重放未创建 cluster task、旧向量误并旧 Event。修复后首次及重复运行均为：

```text
$env:CI='true'; pnpm --filter @financehot/worker test
ℹ tests 42
ℹ pass 42
ℹ fail 0
ℹ skipped 0
ℹ todo 0
```

反向验证也已完成：临时恢复 success 直接返回时 `42/41/1`，重放回归失败；临时取消 current `input_hash` 限制时 `42/41/1`，旧向量回归失败。两项均立即还原并复跑为 `42/42`。未改变阈值、72 小时时窗或分类规则。

### 6.1 测试关闭与隔离稳定性

- 三项集成测试各使用独立的 Redis prefix；等待中的 replay cluster job 在 runtime 关闭前精确移除，随后按 `drain: true` 关闭 Worker/Queue，并只扫描删除自身 `${prefix}:*` 键。
- 主测试临时移除 Redis 清理调用时，反向结果为 `42/41/1`，残留断言准确发现 39 个键；恢复后为 `42/42`。历史 `stage09-it-*` 键在确认无相关进程后一次性精确清理，数量由 `1232` 降至 `0`。
- 当前版本连续 5 次 Worker 均为 `42/42`、0 skip/todo、`Connection is closed=0`；早期一次失败尝试已记录在 `BLOCKED.md`，未计入最终稳定序列。
- 测试失败时仍按自身 prefix 和 Article/Event 夹具清理；最终 Redis `stage09_keys=0`，PostgreSQL `sources/articles/events/ai_tasks/article_embeddings/event_articles` 均为 `0`。

## 7. 根级最终门禁

第 1 轮因此前中断的受控夹具残留使 DB 观察到 `events=45` 而非 Seed 的 12，已记录原始输出并精确清理本轮测试残留；没有清库或修改 Seed。清理后 DB 独立测试 `4/4`。

第 2 轮按以下顺序串行执行并全部退出 0：

```text
$env:CI='true'; pnpm lint -- --force --output-logs=errors-only
Tasks: 7 successful, 7 total

$env:CI='true'; pnpm build -- --force --output-logs=errors-only
Tasks: 7 successful, 7 total

$env:CI='true'; pnpm typecheck -- --force --output-logs=errors-only
Tasks: 7 successful, 7 total

$env:CI='true'; pnpm test -- --force --output-logs=errors-only
Tasks: 7 successful, 7 total

git diff --check
exit 0
```

本地提交在最终白名单复核后创建；未 push、未 deploy。

本轮可靠性修复后的最终工作树再次按同一顺序执行上述四项门禁，均为 Turbo `7 successful / 7 total`、0 cached，`git diff --check` 退出 0。只读 PostgreSQL 残留核对为 `sources=0`、`articles=0`、`events=0`、`ai_tasks=0`、`article_embeddings=0`、`event_articles=0`；白名单外改动为 0。

本轮仅针对测试可靠性缺口修改 `embedding-cluster.integration.test.ts`、`PROGRESS.md`、`BLOCKED.md` 和本验收文档；`embedding-pipeline.ts`、`cluster-pipeline.ts` 及其他白名单外文件未改。当前阻塞：无；未 push、未 deploy。
