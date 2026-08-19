# 阶段 10 验收记录：可解释、可纠错、可展示的多信源 Event（交叉竞态返工）

日期：2026-08-19
分支：`codex/stage-10-event-cluster`
约束：仅本地提交；未 push、未 deploy、未使用真实 Key；未改 Seed、系统时间和旧 migration。

## 验收结论

Worker、Web 和阶段10新增真实 PostgreSQL/Redis 集成测试已通过。聚类使用时间窗口、当前向量元数据/相似度、分类、国家实体、标题特征和动作冲突保护；高置信候选直接合并，边界候选才调用结构化 LLM；未配置或调用失败保守新建。Event 事实由 `event_articles` 唯一关系源重算，merge/split 在服务层事务化并幂等。本轮返工进一步统一 cluster 与 merge/split 的 `EVENT_MUTATION_LOCK_KEY`，并在边界 LLM 返回后的同一共享锁事务内重新解析原候选成员归属；无法唯一确认时保守新建。

页面和 API 闭环已完成。通过工作区自带 Playwright 与本机已安装 Edge，对首页和 Event 详情执行了 `1440×900`、`390×844` 四视口真实验收；四页 HTTP 均为 200，横向溢出均为 0，console error/warning/pageerror 与 request failure 均为 0。截图已保存，历史工具阻塞原始输出仍保留在 `BLOCKED.md`。

### 页面视觉与浏览器验收

首次桌面首页的唯一 console 404 定位为 `/favicon.ico`。在白名单允许的首页和 Event 详情页元数据中加入内联图标后复跑，Web `lint`、`typecheck`、`test` 均退出 0，Web 测试为 `24/24`。

四视口实际输出：

```text
homepage-1440x900: status=200, innerWidth=1440, scrollWidth=1440, bodyScrollWidth=1440, overflow=false, messages=[], failed=[]
homepage-390x844:  status=200, innerWidth=390,  scrollWidth=390,  bodyScrollWidth=390,  overflow=false, messages=[], failed=[]
event-1440x900:    status=200, innerWidth=1440, scrollWidth=1440, bodyScrollWidth=1440, overflow=false, messages=[], failed=[]
event-390x844:     status=200, innerWidth=390,  scrollWidth=390,  bodyScrollWidth=390,  overflow=false, messages=[], failed=[]
```

截图：

- `docs/acceptance/phase-10/homepage-1440x900.png`
- `docs/acceptance/phase-10/homepage-390x844.png`
- `docs/acceptance/phase-10/event-1440x900.png`
- `docs/acceptance/phase-10/event-390x844.png`

## 真实测试输出

### 阶段10新增测试

命令：

```text
$env:CI='true'; & '.\apps\worker\node_modules\.bin\tsx.cmd' --test --test-concurrency=1 '.\apps\worker\src\event-stage10.integration.test.ts'
```

实际摘要：

```text
✔ 阶段10多信源候选保护、事实更新与安全重放
✔ 阶段10边界只调用一次结构化 LLM，未配置时保守新建并可缓存重放
✔ 阶段10边界 LLM 与人工 merge 交叉时按存活 Event 归属并安全重放
✔ 阶段10 merge/split 服务事务化、幂等、回滚并保持唯一主报道
ℹ tests 4
ℹ pass 4
ℹ fail 0
ℹ skipped 0
ℹ todo 0
```

### Worker 与 Web

```text
Worker: ℹ tests 46 / ℹ pass 46 / ℹ fail 0 / ℹ skipped 0 / ℹ todo 0 / exit 0
Web:    ℹ tests 24 / ℹ pass 24 / ℹ fail 0 / ℹ cancelled 0 / ℹ skipped 0 / ℹ todo 0 / exit 0
```

### 交叉竞态返工红绿与反向验证

旧实现先运行新增测试得到真实 PostgreSQL 外键红测：

```text
Worker: ℹ tests 46 / ℹ pass 45 / ℹ fail 1 / ℹ skipped 0 / ℹ todo 0 / exit 1
error: insert or update on table "event_articles" violates foreign key constraint "event_articles_event_id_events_id_fk"
code: 23503
```

共享锁与归属重解析修复后，阶段10测试文件为 `4/4`；临时恢复直接使用旧 `candidate.eventId` 后再次为 `3 pass / 1 fail`、同一 `23503` 外键错误，立即还原后恢复 `4 pass / 0 fail / 0 skipped / 0 todo`。新增测试同时证明 source Event 删除后只剩唯一存活 target、三篇 Article 仅有 target 关系、计数为 3、唯一 primary 正确、任务成功且重放无新增 LLM/任务/关系。

### 反向验证 A：候选保护

临时移除动作冲突保护后，测试真实变红：

```text
✖ 阶段10多信源候选保护、事实更新与安全重放
ℹ tests 1
ℹ pass 0
ℹ fail 1
AssertionError ... 不同事实、低相似、分类冲突均不得误合并 ... false !== true
exit 1
```

立即还原后复跑：

```text
✔ 阶段10多信源候选保护、事实更新与安全重放
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ skipped 0
ℹ todo 0
exit 0
```

### 反向验证 B：信源质量排序

临时反转 Event 详情的信源等级排序后，API 测试真实变红：

```text
✖ 事件详情批量返回多信源...
ℹ tests 1
ℹ pass 0
ℹ fail 1
AssertionError ... rank(previous)<rank(current) ... actual false
```

立即还原后复跑：

```text
✔ 事件详情批量返回多信源...
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ skipped 0
ℹ todo 0
exit 0
```

## 覆盖范围

- 5 个不同 source 的同一事实只形成一个 Event；同日同公司不同动作、低相似和分类冲突保持分离。
- 增量成员更新标题/摘要、首末时间、文章数、信源数和唯一 primary；状态保持 `developing`/`uncertain` 语义。
- 无 LLM 配置为零请求；只有边界候选调用一次结构化 LLM；缓存重放不增加调用、任务、向量或关系。
- merge 重复执行无新增；split 明确成员集合，非法输入事务回滚，并发 merge 保持一致性、无孤儿关系。
- Event API 固定状态、计数、来源质量排序和查询次数；首页 Event 优先，详情页保留 Article 入口。

## 前一轮阶段10根级门禁（返工前历史证据）

第1轮按 `lint → build → typecheck → test` 顺序执行，四项均实际输出：

```text
lint:      Tasks: 7 successful, 7 total; exit 0
build:     Tasks: 7 successful, 7 total; exit 0
typecheck: Tasks: 7 successful, 7 total; exit 0
test:      Tasks: 7 successful, 7 total; exit 0
```

root test 关键包统计：AI `17/17`、Web `24/24`、crawler `35/35`、DB `4/4`、Worker `45/45`；skip/todo 均为 `0`。以下为返工前阶段10提交的历史证据，不替代本轮根级门禁。

收口命令实际输出：

```text
git diff --check（返工前历史提交）
diff_check_exit=0
changed=22
whitelist_outside=0
branch=codex/stage-10-event-cluster
head=f5e9d33（门禁执行时的阶段10基线）
post_commit=7fedbf0（返工前历史提交）
```

## 本轮返工根级门禁（第1轮）

按 `lint → build → typecheck → test` 顺序执行。首次 `build` 因 `readonly string[]` 传入 Drizzle `inArray` 的类型错误退出 `2`；将查询参数复制为普通数组后立即重跑，四项最终均通过：

```text
lint:      Tasks: 7 successful, 7 total; exit 0
build:     Tasks: 7 successful, 7 total; exit 0
typecheck: Tasks: 7 successful, 7 total; exit 0
test:      Tasks: 7 successful, 7 total; exit 0
```

根级测试关键包统计：AI `17/17`、Web `24/24`、crawler `35/35`、DB `4/4`、Worker `46/46`；fail/skip/todo 均为 `0`。本轮不再重复第2/3轮根级门禁。

## 未完成/边界

- 当前返工状态：代码、确定性竞态红绿、Worker `46/46`、Web `24/24`、四视口页面验收、第1轮根级门禁、最终 diff/白名单核对和唯一的本地 fix 提交均已完成。浏览器技能初始化和默认沙箱的原始环境输出见 `BLOCKED.md`。
- 真实供应商模型质量、成本和线上效果：按项目边界留到供应商选定后的上线前验收。
- 阶段11评分/日报/后台/用户系统/部署：未开始。
