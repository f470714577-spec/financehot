# PROGRESS

## 阶段09测试稳定性返工回执（2026-08-19）
- 目标：只修集成测试关闭竞态与 Redis 测试键泄漏，不改阶段09业务实现。
- 顺序：记录基线 → 定位每个测试实例 prefix/关闭依赖 → 精确清理反向红绿 → 历史键一次性清理 → 连续稳定门禁。
- 最大风险：暂停 Worker、waiting Job、Queue 与 Redis connection 的关闭顺序产生 `Connection is closed`，以及共享 `stage09-it-*` 键污染后续测试。
- 工作树干净，Worker 基线 `42/42`、0 skip/todo；原始输出已记入 `BLOCKED.md` 顶部。
- Redis 扫描为 `stage09_keys=1198`，高于历史 `1156`；该命令在本轮 Worker 运行后执行，差额 42 暂按本轮新增键待定位，不直接清理。
- 已定位并修复：主/replay/current 各自生成并保存独立 prefix；replay 先移除 waiting cluster Job，再按 `drain: true` 正常关闭 runtime；关闭后 SCAN 精确删除 `${prefix}:*` 并断言残留为 0。
- 反向验证：临时移除主测试 Redis 清理后 Worker 为 `42/41/1`，且残留断言准确报出 `39` 个 prefix 键；恢复清理后为 `42/42`，临时改动未保留。
- 按任务书完成一次性历史键清理：确认无相关 Worker/测试进程后，`stage09_keys_before=1232`、`stage09_keys_after=0`；未使用 FLUSH/清库。当前 PostgreSQL 六类测试残留均为 `0`。
- 修复后最终版本连续 5 次 Worker 均为 `tests 42 / pass 42 / fail 0 / skipped 0 / todo 0`、`Connection is closed=0`、退出码 0；期间一次早期第 5 次尝试为 `42/41/1`，立即重跑为绿，随后重启连续计数并完成 5 次全绿。
- 按顺序执行根级 `lint`、`build`、`typecheck`、`test`，每项 Turbo 均为 `7 successful / 7 total`、0 cached，`git diff --check` 退出 0。
- 当前未改任何阶段09业务实现文件，阻塞：无。

## 阶段09返工回执（2026-08-19）
- 已核对分支 `codex/stage-09-embedding-cluster`、HEAD `d47edc3`，工作树干净，符合任务书。
- 默认沙箱 Docker/Node 分别报 named-pipe `permission denied`、`spawn EPERM`；原始输出已置于 `BLOCKED.md` 顶部。
- 获批外部路径复核：PostgreSQL/Redis healthy；同一 Worker 命令 `tests 40 / pass 40 / fail 0 / skipped 0 / todo 0`，退出码 0。
- 任务1仅新增两项真实 PostgreSQL/Redis 回归后，Worker `42` 项为 `40 pass / 2 fail / 0 skip / 0 todo`；两项失败分别明确暴露重放不补 cluster task、旧向量误合并，原始摘要已置于 `BLOCKED.md` 顶部。
- 任务2修复：成功状态加载精确向量后复用幂等 cluster 创建/入队，缺向量明确失败；候选成员按同一规范化输入 SHA-256 过滤当前 hash，历史向量不删除。
- 修复后 Worker 首次、重复运行均为 `tests 42 / pass 42 / fail 0 / skipped 0 / todo 0`，退出码 0；当前阻塞：无。
- 反向 A 临时恢复 success 直接返回、反向 B 临时取消 current `input_hash` 筛选，均为 `42/41/1` 且失败点准确；立即还原后均恢复 `42/42`，临时改动未保留。
- 最终工作树串行总门禁已通过：lint、build、typecheck、root test 均 Turbo `7 successful / 7 total`、0 cached；`git diff --check` 退出 0。
- 只读 PostgreSQL 残留核对：stage09 唯一前缀的 sources/articles/events/ai_tasks/article_embeddings/event_articles 均为 `0`；白名单外改动为 `0`，当前阻塞：无。
- 证据已收口，下一步创建基于 `d47edc3` 的新本地修复提交；不 push、不 deploy。

## 阶段09开工回执（2026-08-19）
- 目标：把阶段08合格财经 Article 生成可追溯 Embedding，并保守、幂等归入或创建 Event。
- 分支：`codex/stage-09-embedding-cluster`；基线 `codex/stage-08-ai-pipeline`，外部复核根 test `7/7 successful`。
- 顺序：EmbeddingProvider 红→绿 → 真实 `embedding→cluster` 队列/事务/并发幂等 → migration/文档 → 串行总门禁/本地提交。
- 硬约束：只处理非隐藏且阶段08完成 Article；只启用 `embedding`、`cluster`，拒绝 `score`、`daily_report`；不接真实供应商、不改 Seed/旧 migration/Web。
- 最大风险：混合维度向量下的保守事件关系与双 Worker 竞争必须同时保持可追溯、无孤儿、无重复调用。
- 环境：默认沙箱曾报 Docker named pipe/`spawn EPERM`，外部路径已验证 PostgreSQL/Redis healthy；未改产品代码。

## 阶段09任务1完成：EmbeddingProvider（2026-08-19）
- 独立实现 OpenAI-compatible `/embeddings` Provider；配置不全返回 `unconfigured` 且零请求，未接真实供应商/真实 Key。
- 固定校验：非空有限数向量、dimensions 一致；空数组、NaN、Infinity、非法响应不得入库。
- 错误分类：401/403 不重试；429/5xx、timeout/network 仅有限重试；非法响应不重试。
- 红→绿：先补测试运行 `CI=true pnpm --filter @financehot/ai test`，旧实现因缺少 `EmbeddingProviderError` 导出退出 1；实现后同命令 `tests 17 / pass 17 / fail 0 / skip 0 / todo 0`。
- 任务1完成；AI 包 typecheck 已通过，测试数由基线 10 增至 17。

## 阶段09任务2完成：真实队列、持久化与事件关联（2026-08-19）
- 已接通 `ai_process 成功 → embedding → cluster`；仅消费 `embedding`、`cluster` 两类新增队列，`score`、`daily_report` 明确拒绝。
- 仅处理非隐藏且 `entity_extracted` Article；输入固定为规范化 `title_zh + "\\n" + summary_zh`，记录 input_hash/provider/model/dimensions/embedding_version。
- 真实 PostgreSQL/Redis 受控 HTTP 验收：9 篇样本、两个同事实双信源 Event、同公司不同事实分类冲突不合并、同分类低相似不合并、72 小时窗/向量元数据/唯一主报道/Event 计数与时间、失败两次后 failed、双 Worker 竞争 Provider 新调用 1 次、重复成功新增调用/向量/关系均为 0；集成 `tests 1 / pass 1 / fail 0 / skip 0 / todo 0`。
- 真实 Worker 全量恢复绿测：`CI=true pnpm --filter @financehot/worker test` 为 `tests 40 / pass 40 / fail 0 / skipped 0 / todo 0`，高于基线 39。
- 反向红→绿：临时默认阈值 `0.0` 后同命令 `tests 40 / pass 39 / fail 1`，失败明确为 LOW_SIM 与 A Event 误合并；已立即恢复 `0.86`，复跑为 `40/40`。
- 任务2完成；双 Worker 聚类事务使用事务级 advisory lock，关系、主报道与 Event 派生计数同事务维护，无孤儿 Event。

## 阶段09任务3完成：migration、文档与总门禁（2026-08-19）
- 新增唯一向前 migration `packages/db/drizzle/0007_daily_deathbird.sql`，仅将 `article_embeddings.dimensions` 设为 `NOT NULL`；旧 migration/meta snapshot 未改，journal 已追加 idx7。
- 真实迁移命令 `$env:CI='true'; pnpm --filter @financehot/db db:migrate` 输出 `[✓] migrations applied successfully!`。
- 只读数据库核对：pgvector 扩展为 `vector`；`article_embeddings.dimensions` 为 `is_nullable=NO`；索引含 `article_embeddings_unique`；唯一约束含 `article_embeddings_unique`。
- 已更新 `PROJECT_CONTEXT.md`、`docs/architecture.md`、`docs/ADR-002.md`、`docs/acceptance/phase-09.md`、`BLOCKED.md`；真实模型质量仍明确未验收。
- 新增代码范围的 Worker/AI/DB lint 与 typecheck 已通过。
- 总门禁第1轮按顺序在 root test 失败：DB `4` 项为 `3 pass / 1 fail`，Seed Event 观察到 `45` 而期望 `12`；根因是此前中断的阶段09受控夹具残留，不是业务断言回归。已只读定位并精确清理 10 个 stage09 source、45 个 Article、33 个孤儿 Event、90 个 AI task，未清库/改 Seed；复核 Seed Event 恢复为 `12`。按规则第1轮终止，待重新执行。
- 总门禁第2轮严格按顺序执行：`lint`、`build`、`typecheck`、`test` 均 Turbo `7 successful / 7 total`、0 cached、退出 0；最后 `git diff --check` 退出 0。根 test 使用 `--concurrency=1`，未改 Seed、旧 migration、Web 或系统时间。
- 阶段09本地提交已创建，当前分支工作树干净；不 push、不 deploy，提交哈希以 `git log -1` 为准。

## 阶段08根级测试隔离收口（2026-08-19）
- 根因确认：workspace 测试默认由 Turbo 并行执行，`apps/web` 的当前时间 Event fixture 与 `packages/db` 的 Seed 精确计数共享同一 PostgreSQL 实例，产生 `events=13` 竞争失败。
- 最小修复：根 `package.json` 的 `test` 脚本固定为 `turbo run test --concurrency=1`，以 workspace 包串行化隔离共享数据库测试；未改 Seed、生产查询、数据库时钟或 migration。
- 红→绿证据：未改脚本的串行等价入口先消除 `events=13`，仅因此前中断遗留的 1 个 `stage08-it-*` source/10 条 `controlled.example` 文章在 Worker 唯一约束处失败；只读核对后按精确前缀事务清理，残留均为 0。
- 正式 `$env:CI='true'; pnpm test -- --force --output-logs=errors-only` 连续 3 次均退出 0，每次 Turbo `7/7 successful`、0 cached。
- 同轮静态门禁：`lint`、`typecheck`、`build` 均 `7/7 successful`、退出 0；当前根级稳定全绿门禁已恢复，阶段09仍未开始。

## 阶段08知识收尾复核（修复前，2026-08-19）
- `neat-freak` 修复前复核发现根级 `pnpm test -- --force` 并非稳定全绿：Turbo 并行执行时，Web `before` 插入测试专属当前时间 Event，DB 包同时断言 Seed Event 必须恰好为 12，实际观察到 13，根 test 退出 1。
- 隔离复跑 DB 为 `4/4`，Web 在失败的同一根级运行中为 `24/24`；证据表明这是跨包共享数据库的 fixture 竞争，不是 Seed 永久残留，也不是本轮文档改动造成的业务失败。
- 该待办已由根测试入口串行化修复并取得连续 3 次全绿；阶段09仍未开始。

## 阶段08剩余红叉收口（2026-08-19）
- 基线：`codex/stage-08-ai-pipeline`；外部路径启动 PostgreSQL/Redis 后，根 test 为 Web `23 pass / 1 fail`，失败仍是 24h 热点 `items.length > 0`；crawler `35/35`、DB `4/4`、AI `7/7`。
- 目标：按已授权边界补测试专属当前时间热点、完成 Provider 每次 HTTP attempt 的 `ai_usage` 审计、解除 worker 依赖边界记录并收口全仓门禁。
- 顺序：Web fixture 红→绿与反向验证 → Provider/schema/migration/Worker 审计红→绿与反向验证 → 依赖与文档 → 全仓门禁和本地提交。
- 最大风险：Provider 失败/重试路径的 usage 载荷在不泄露密钥和正文的前提下跨 Provider、Worker、DB 保持完整且幂等；另需避免并行集成测试互相污染。
- 环境说明：默认沙箱出现 `spawn EPERM`/Docker named pipe 权限错误，真实门禁统一使用 `CI=true` 的获批外部路径，不将环境错误伪装为业务结果。
- 任务1已完成：测试插入当前时间唯一 Event，并关联 4 条既有可见 Article 以保持既有事件详情断言；Web `24/24`，测试 Event/关系清理后均为 0。
- 任务1反向已完成：临时禁用 fixture 得到 Web `23 pass / 1 fail` 且失败为热点 `items.length > 0`；立即还原后 `24/24`。
- 任务2已完成：Provider attempt 记录、`ai_usage` 向前 migration `0006`、Worker 成功/失败幂等写入和 5 项真实审计场景完成；AI `10/10`，Worker `39/39`。
- 任务2红→绿证据：旧 Worker usage 期望 `37` 在失败 Provider 两次请求纳入审计后实际为成功 `37` + 总 `39`；失败路径临时禁用审计时目标集成测试 `3 pass / 3 fail`，还原后 `6/6`，全绿。
- 任务3已完成：根级 lint/typecheck/test/build 均 `7/7` 成功，测试为 Web `24`、AI `10`、Worker `39`、crawler `35`、DB `4`；`git diff --check`、允许路径和迁移约束复核通过，依赖/文档已收口，阶段08工程验收已提交至本地 `cdcf6ac`。

## 阶段08开工回执（2026-08-18）
- 目标：把阶段07产出的英文 Article 接入可替换、可追踪、可缓存的 AI 流水线，产出可浏览的中文标题、摘要、分类和为什么重要。
- 顺序：Provider/Schema/Prompt → ai_tasks 与 usage → 仅 ai_process 队列流水线 → 真实 Redis/PostgreSQL 端到端 → 反向验证、全量门禁、文档、本地提交。
- 最大风险：恢复后的既有 Web 时间窗口 Seed 为空，Web/全量 test 门禁不能宣称全绿；原始输出见 BLOCKED.md 顶部。
- 已创建本地分支：`codex/stage-08-ai-pipeline`；未 push、未部署、未清库、未写入真实密钥。
- 已核对 Node `v26.3.1`、pnpm `11.21.0`、Compose 服务 `postgres/redis/web/worker`。
- 开工全量测试曾受沙箱 `spawn EPERM` 与服务不可用阻塞；恢复后已按原入口复跑受影响基线，未将环境失败当作业务绿基线。
- Provider、五步 Prompt、独立 Zod Schema、错误分类/有限重试/usage 测试已完成；AI Provider 测试实测 `7 pass / 0 fail / 0 skip / 0 todo`。
- `ai_tasks` 已增加确定性 `cache_key`、结构化 `result_json` 和唯一约束；`ai_usage` 已增加 `attempt` 唯一约束与未知成本留空。
- Worker 已启用 `ai_process`：新 Article 创建 financial-filter，成功后依次入队 translate、summarize、classify、entity-extraction；非财经保留并隐藏。
- Worker 的 AI 任务抢占已用 `UPDATE ... WHERE status IN (pending,retrying)` 的返回行区分真正获得执行权者，竞争执行者不调用模型；成功结果仍以 cache_key 与 task 状态短路。
- 已新增本地受控 HTTP Provider 的真实 Redis/PostgreSQL 集成测试，覆盖 10 条英文样本、2 条非财经、1 条 Prompt Injection、失败 retry/failed 和重复入队缓存。
- Docker/5433/6379 已恢复，0003/0004/0005 migration 成功；Worker 真实测试 `34 pass / 0 fail / 0 skip / 0 todo`，DB `4/4`、crawler `35/35`。Web 历史基线实测 `23 pass / 1 fail`（热点时间窗口 Seed 为空），原始输出已置于 BLOCKED 顶部，未改 Web/Seed/旧测试。
- 为保持阶段07旧测试可清理 Article，`ai_tasks.article_id` 增加 `ON DELETE CASCADE`，新增并成功应用 `0004_ai_tasks_article_cascade.sql`；未改历史 migration、Web 或旧测试。
- 完成审计发现并修正 schema/migration 漂移：`ai_tasks` 与 `ai_usage` 的 Article 外键均由 schema 声明并由 `0004/0005` migration 应用 `ON DELETE CASCADE`；DB 约束只读复核通过。清理唯一受控测试残留后 Worker 重跑 `34/34`。
- 反向验证已完成：临时放开成功任务保护时目标测试 `actual 51 / expected 37`、退出码 1；立即还原后同命令 `1 pass / 0 fail / 0 skip / 0 todo`、退出码 0。
- 根级 `pnpm lint -- --force`、`pnpm typecheck -- --force` 和获批沙箱外 `pnpm build -- --force` 均 `7/7 successful`、退出码 0；根级 `pnpm test -- --force` 的其他包通过，但 Web 为 `23 pass / 1 fail`，退出码 1，原始失败已记录于 BLOCKED.md。
- 本轮 schema/migration 修正和边界审计已创建本地提交，提交后工作树复核通过；真实模型质量未验收。Web/全量 test 受既有 Seed 时间窗口失败影响，按任务书停止受影响工作。
- 完成审计另发现 `apps/worker/package.json` 的 AI/zod 依赖声明不在字面白名单内；已写入 BLOCKED.md，未通过相对路径或重复代码规避，故不宣称硬白名单条件满足。

## 阶段07开工回执
- 目标：把阶段06同步采集改成 BullMQ 驱动的 crawl→normalize 可靠流水线，保证重试、恢复、追踪和幂等。
- 顺序：基线/分支 → shared 契约 → worker 队列链与生命周期 → 真实 Redis+PostgreSQL 测试 → 文档、反向验证、全量门禁、提交。
- 最大风险：在不改 schema/阶段06旧测试的白名单内正确同步 crawl_tasks 状态，并取得真实重启恢复证据。
- 基线：HEAD `a78bdbb`；Node `v26.3.1`；pnpm `11.21.0`；四包获批沙箱外测试全绿，默认 Docker 访问被权限阻断，已记入 BLOCKED。
- 已创建本地分支：`codex/stage-07-queue-worker`；未 push、未部署、未清库。
- 已安装唯一新增运行依赖 `bullmq@5.81.3`；pnpm 使用 `--ignore-scripts` 完成锁定安装，未新增 workspace 配置。

## 阶段07当前进度
- shared 已冻结版本化 job 名称、载荷、关联 ID 与未实现 job 拒绝契约；Worker 配置集中管理队列前缀、并发、重试、退避和保留策略。
- Worker 已接入真实 Redis/BullMQ：启动调度到期 source，执行 `crawl → normalize`，同步 `crawl_tasks`，支持失败集、恢复、优雅关闭和重启续跑。
- 同源锁、确定性 job ID、Raw `(source_id, content_hash)` 与 Article 三键查询/数据库唯一冲突兜底已完成；未生成独立 DLQ。
- 新增真实 Redis+PostgreSQL Worker 测试后为 `33/33`，0 fail/skip/todo；其中阶段06 Worker 测试仍为 `9/9`。
- 现役文档与 `docs/acceptance/phase-07.md` 已更新，记录拓扑、状态职责、参数、红→绿、失败集、重试、重启和边界。
- 修复后真实回归：Worker `33/33`，0 fail/skip/todo；日志已见首次 network 失败、attempt=2 成功、耗尽 attempt=2 进入 failed，以及 active job 异常中断后由新 Worker 识别 stalled 并接管。
- 反向验证已完成：临时跳过耗尽后的 DB failed 写入，目标测试以退出码 `1` 失败（实际值 `running`、期望 `failed`）；代码已立即还原。
- 2026-08-18 验收修复：删除 `crawl-once` 将耗尽失败回写为 `retrying` 的兼容逻辑，统一 BullMQ failed set 与数据库 `failed`；补充真实 active→stalled→新 Worker 接管测试；阶段06测试改用每轮唯一 queue prefix，避免中断测试污染默认队列。
- 全量强制门禁已绿：lint/typecheck/build 各 `7/7`，test crawler `35`、Worker `33`、DB `4`、Web `24` 全部通过且 0 skip/todo，`git diff --check` 退出 0。
- 阶段07当前阻塞：无；白名单/敏感文件复核通过，本地提交已创建；不 push、不部署、不清库，提交哈希以 `git log -1` 为准。

- 2026-08-16 开工回执：把阶段 04 验收为可复核的本地稳定基线。
- 顺序：基线核对与分支 → 双视口页面/状态验收 → 工程门禁 → 证据审查与提交。
- 最大风险：本机 pnpm 版本漂移、视觉验收发现的响应式或交互缺陷。
- 已核对：origin/master=90036fc，20 个 pgTable，现有变更均在白名单内。
- 已创建本地分支：codex/stage-04-baseline；不推送远端。
- pnpm 环境已对齐：用户级命令固定为 11.21.0，并优先于 Codex 兜底版本 11.19.0。
- 视觉验收：4 个代表页面 × 2 视口截图已保存，11 个页面/状态入口双视口复核通过。
- 视觉修复：隐藏移动端全球市场脉冲内部滚动条，生产构建后已复拍并复核。
- 工程门禁：pnpm 11.21.0 下 lint/typecheck/test/build 均 7/7；DB 4/4，0 skipped，Next ESLint 警告清零。
- 反向验证：临时 ESLint 错误退出 1，还原后同命令退出 0，证据已保存到 docs/acceptance/。
- 本地基线提交已创建，提交信息为 `feat: 完成阶段 04 验收并形成稳定基线`；未推送、未部署。提交哈希以 `git log -1` 为准，避免在提交内记录无法自洽的自身哈希。
- 最终复核：`git status --porcelain` 为空，目标分支无 upstream，`git diff HEAD^ --stat` 已留出 70 个白名单内文件统计；验收服务器已关闭。
- 当前状态：阶段 04 稳定本地基线已交付，阶段 05 尚未开发。
- 验收凭证修正：删除 8 个与 JPG 内容完全相同、文件头实际为 JPEG 的错误 `.png` 副本；保留 8 张有效 JPG。

## 阶段 05 开工
- 目标：让 9 类 API、筛选/搜索/分页、详情和阶段 04 全部前台路由稳定读取已 migrate+seed 的 PostgreSQL。
- 顺序：基线与现状 → shared DTO/DB 查询/API → 前台接入 → 真实集成测试 → 门禁/性能/白名单/本地提交。
- 最大风险：现有 Seed 关系为多表事实源，必须避免 Article 伪造 `event_id`、Event/Heat 语义漂移和 API 查询 N+1。
- 基线复跑：工作树干净；pnpm 11.21.0；Node v26.3.1；根测试 7/7；DB 4 pass、0 fail/skip/todo。
- 已创建本地分支：codex/stage-05-news-api；不 push、不部署。

## 阶段 05 状态
- 本轮收尾目标：把 `555d8ec` 验证为 PostgreSQL、API、前台、性能与工程门禁均真实通过的稳定基线。
- 本轮顺序：Docker/依赖服务 → migrate+seed/真实测试 → API与EXPLAIN → 双视口前台 → 全部门禁与收尾提交。
- 本轮最大风险：Docker Desktop/5433 恢复失败，以及固定 Seed 时间语义导致真实集成测试失效。
- 本轮基线实测：HEAD `555d8ec`，工作树干净，pnpm `11.21.0`，context `desktop-linux`，Docker engine 不可用，5433 无监听。
- 依赖服务已恢复：Docker engine `29.7.2`；postgres/redis 均 `running healthy`；`pg_isready` accepting connections；Redis `PONG`。
- `.env` 已从 `.env.example` 复制，未入库；未删除 volume、未修改 Docker 全局设置。
- 真实 migrate+seed 与表/扩展/Seed 数量核对已完成。
- 迁移/Seed 验收完成：20 表、`pg_trgm`/`vector`、Seed 目标计数均实测符合。
- DB 测试：4 pass、0 fail/skip/todo；Web 真实集成：20 pass、0 fail/skip/todo。
- 反向验证：篡改 cursor 期望得到 19 pass/1 fail、退出码 1；恢复后 20 pass，原测试文件 diff=0。
- 5 类 EXPLAIN、9 类 API 与前台双视口验收已完成。
- DTO/错误体、查询层、HMAC cursor、5 项索引迁移和 9 类 API 已完成；前台 8 路由已切 PostgreSQL/API，演示直连 0 命中。
- Web 已写 20 项真实集成测试；静态 lint/typecheck/build 均 7/7，diff check 通过。
- 2026-08-16 历史阻塞：5433 PostgreSQL 未运行，Docker engine 缺失；真实测试 2 pass/18 fail，原 DB 4 项 0 pass/4 fail；详见 `BLOCKED.md`。
- 2026-08-16 历史待办：数据库恢复后补做 migrate+seed、EXPLAIN、API 全绿与红→绿反向验证；已于本轮完成。
- 无数据库审查修正：补齐 `heat_score IS NULL` 的热点 cursor 分支；移除不发 API 请求的阶段 04 假“刷新动态”交互。数据库相关证据仍未宣称完成。
- 无数据库审查修正：从带 `from` 的新闻 URL 恢复时间范围，避免刷新后 cursor 加载更多丢失时间筛选。
- 2026-08-16 历史记录：代码修正曾并入本地提交，工作树干净，未 push、未部署；当时 5433 无监听，真实 DB 验收保持未完成。
- 搜索计划修复已完成：直接字段搜索 + 关联表 `EXISTS`，最终 `event_articles` 计划 `loops=1`；未新增索引。
- HTTP API 实测完成：9 类成功体/分页体，400/404 错误体与 SQL 泄露检查均符合契约；24h+macro+minScore=80 实际返回 1 条。
- 500 故障契约补充实测完成：临时坏数据库实例返回 `500/INTERNAL_ERROR`，SQL/栈泄露检查 `False`；正常 PostgreSQL 未停止。
- 前台实测完成：8 核心路由 × 1440×900/390×844，标题/Seed提示/无横向溢出/控制台 error-warning=0；搜索、筛选、刷新、加载更多均通过。
- 工程门禁完成：lint/typecheck/test/build/diff check 全绿；Seed 直连 0、阶段06代码 0、白名单检查 PASS；当前未解决阻塞：无。
- 本地验收 Web 会话已停止，3000 无监听；`.env` 仍为 ignored 未入库。
- 本地阶段05收尾提交已创建，待最终复核工作树干净；未 push、未部署。

## 阶段05时间锚点修复
- 目标：让 URL 初始化、筛选变化、刷新和 cursor 加载始终逐字复用同一 `from`，主动切换时间范围才生成一次新锚点。
- 顺序：旧实现必红回归门禁 → 最小纯函数/状态修复 → 浏览器与反向验证 → 全门禁、证据、提交。
- 最大风险：测试入口的 pnpm 无 TTY modules 清理失败，以及刷新/筛选/loadMore 之间仍存在时间锚点漂移。
- 回归红证据：旧语义 Web `23 pass / 1 fail`，失败为时间前进后 `2026-08-10T12:00:00.000Z` 漂移为 `2026-08-10T12:00:17.321Z`。
- 最小修复：新增 `news-query.ts` 状态/参数纯函数；初始化优先冻结 URL `from`，主动切换才生成或清除锚点；首次请求与 loadMore 共用构造入口。
- 浏览器证据：7d 的 A 在筛选、搜索、刷新、cursor 请求均复用；A 加载后 20→40 且 40 个卡片唯一；切到 24h 生成 B，后续 cursor 继续复用 B。
- 反向红→绿：临时让 cursor 忽略冻结锚点为 `23 pass / 1 fail`，失败同上；已还原。
- 最终门禁：lint/typecheck/test/build/diff check 全绿，DB `4/4`、Web `24/24`、原 20 项测试 diff=0、白名单检查 PASS；待创建本地修复提交。

## 阶段 06 开工
- 目标：让 5–10 个合规公开财经源经安全 Adapter 稳定进入 RawArticle/Article，为阶段07提供可验证输入。
- 顺序：基线与契约 → 三类 Adapter/安全 fetcher → worker 同步 crawl-once/落库幂等 → 来源/测试/反向验证 → 全量验收与本地提交。
- 最大风险：SSRF/重定向/DNS 安全边界、真实公开源合规证据、跨表事务与三轮幂等。
- 基线实测：工作树在阶段06记录前干净，HEAD `db19a5c`，Node `v26.3.1`，pnpm `11.21.0`，Docker postgres/redis healthy；Web `24/24`、DB `4/4`，0 fail/skip/todo（获批沙箱外重跑）。
- 已创建本地分支：`codex/stage-06-crawler`；不 push、不部署、不清库。
- 阶段06任务1完成：shared Source/Raw/Parsed/Normalized DTO 与 Zod 配置契约已冻结；RSS/Atom、JSON API、HTML Web Adapter、canonical/hash/language/date 标准化已实现。
- 阶段06任务2核心完成：统一 SafeFetcher 已实现协议/凭据/DNS/IPv4/IPv6/映射地址/重定向/字节/Content-Type/重试/Retry-After/robots/控频边界；crawler 测试 `31/31` 全绿。
- 当前最大风险转为：adapter_config migration 与 worker 真实 PostgreSQL 事务/三轮幂等验收。
- 阶段06任务3完成：`adapter_config` 唯一向前 migration `0002_fast_mattie_franklin.sql` 已应用；Demo `.example` 源已禁用；worker `crawl-once` 与来源安装脚本已接入真实 Drizzle/PostgreSQL。
- 阶段06任务3验证：worker 集成测试 `9/9` 全绿，覆盖禁用 0 请求、running→success/failed/retrying、Raw 先行、跨 source 三键去重、事务错误边界和三轮幂等。
- 真实 RSS 首轮：5 个启用官方 RSS、5 个 task success、80 Raw 输入/新增、15 Article 新增、0 failed/retrying；Web 候选 2 个均 disabled，未发生外部请求。
- 合规复核修正：BIS `robots.txt` 明确禁止 `/doclist/`，因此不启用 BIS 两个候选；改为 Fed Policy Rates 与 ECB Statistical Press 两个官方 RSS，ECB 条款链接改为现行免责声明页；旧 BIS 行仅保留为 disabled，不请求。
- 当前清单真实采集：先实测 2 个新到期官方 RSS（`tasksCreated=2`、`tasksSuccess=2`、`requests=2`、`rawInserted=15`、`articlesInserted=15`），再覆盖 3 个已到期官方 RSS（`tasksCreated=3`、`tasksSuccess=3`、`requests=3`、`rawSeen=50`、`rawExisting=50`、`articlesInserted=28`、`articlesDuplicate=22`）；新增 ECB Blog RSS 后再实测 1 个 task success、15 Raw、15 Article。当前 stage06 清单共 8 行，6 个启用 RSS、2 个 disabled Web。
- 反向 SSRF：临时将 `addresses.some(isForbiddenAddress)` 改为恒假，测试实际 `29 pass / 2 fail`、退出码 1（DNS 混合地址与重定向私网两项）；还原后同命令 `31 pass / 0 fail`、退出码 0。
- 三轮幂等证据：`[1,0,0]` Article 新增，后两轮各 `rawExisting=1`，最终 `Raw=1`、`Article=1`、task 状态为 `success/success/success`。
- 最终 lint 首轮发现 SafeFetcher `while(true)` 与两个未使用变量；已做最小修正，`pnpm lint -- --force` 复跑 7/7 successful、0 error/0 warning。
- 最终门禁：crawler `31/31`、worker `9/9`、DB `4/4`、Web `24/24`；lint/typecheck/test/build 分别 `7/7` successful，`git diff --check` exit 0。
- 白名单复核唯一例外是阶段06初始 clean 核对后出现的外部 Word 临时锁文件 `~$nanceHot_DeepSeek_开发总控包_V1.docx`；未删除、未暂存，已在验收文档和 BLOCKED.md 记录，业务改动白名单外为 0。
- 完成审计补强：无效 `adapter_config` 不再回退旧 RSS URL；5xx 在 Content-Type 不匹配时仍按 HTTP 可重试；RSS/API/Normalized 内容强制 20,000 字符摘录上限。crawler 测试增至 `34/34`，新增测试总数增至 `43`。
- 当前最终代码真实 RSS 复验：Fed Press Releases 到期后 `sourcesDue=1`、`tasksSuccess=1`、`requests=1`、`rawSeen=20`、`rawInserted=1`、`rawExisting=19`、`articlesInserted=0`、`articlesDuplicate=20`；最新 Raw 摘录长度 484 字节、状态 `duplicate`、已关联 Article。
- 当前最终代码 SSRF 反向复验：临时破坏私网拦截后 `32 pass / 2 fail`、退出码 1；还原后同命令 `34 pass / 0 fail`、退出码 0。
- 当前最终代码 worker 三轮证据已重跑：三轮 Article 新增 `[1,0,0]`，后两轮 `rawExisting=1`、`articlesDuplicate=1`，最终 Raw/Article 各 1、task 状态全为 `success`，worker `9/9`。
- 最终工作树复核：Word 临时锁文件已自行释放；`git status --porcelain` 为空、`git diff --check` exit 0、暂存区为空，白名单外 diff=0。
- 阶段06验收后修复：SafeFetcher 默认 Node 请求成功后会清除总超时计时器，并新增回归测试；crawler 测试更新为 `35/35`。
- 同一 Fed RSS、`timeoutMs=10000` 实抓退出耗时由约 `11.09s` 降至 `2.00s`，Raw/Parsed/Normalized 仍各 3 条。
