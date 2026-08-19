# 阶段 10 验收记录：可解释、可纠错、可展示的多信源 Event

日期：2026-08-19  
分支：`codex/stage-10-event-cluster`  
约束：仅本地提交；未 push、未 deploy、未使用真实 Key；未改 Seed、系统时间和旧 migration。

## 验收结论

Worker、Web 和阶段10新增真实 PostgreSQL/Redis 集成测试已通过。聚类使用时间窗口、当前向量元数据/相似度、分类、国家实体、标题特征和动作冲突保护；高置信候选直接合并，边界候选才调用结构化 LLM；未配置或调用失败保守新建。Event 事实由 `event_articles` 唯一关系源重算，merge/split 在服务层事务化并幂等。

页面代码和 API 闭环已完成，但 1440×900 与 390×844 截图、横向溢出和控制台 error/warning 实测未完成：`control-in-app-browser` 运行时导入被拒、Playwright CLI 不可用、Computer Use 启动审批超时。原始输出在 `BLOCKED.md`，没有伪造截图；因此本阶段的页面视觉验收仍为阻塞项。

## 真实测试输出

### 阶段10新增测试

命令：

```text
$env:CI='true'; pnpm --filter @financehot/worker exec tsx --test --test-concurrency=1 src/event-stage10.integration.test.ts
```

实际摘要：

```text
✔ 阶段10多信源候选保护、事实更新与安全重放
✔ 阶段10边界只调用一次结构化 LLM，未配置时保守新建并可缓存重放
✔ 阶段10 merge/split 服务事务化、幂等、回滚并保持唯一主报道
ℹ tests 3
ℹ pass 3
ℹ fail 0
ℹ skipped 0
ℹ todo 0
```

### Worker 与 Web

```text
Worker: ℹ tests 45 / ℹ pass 45 / ℹ fail 0 / ℹ skipped 0 / ℹ todo 0 / exit 0
Web:    ℹ tests 24 / ℹ pass 24 / ℹ fail 0 / ℹ cancelled 0 / ℹ skipped 0 / ℹ todo 0 / exit 0
```

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

## 根级门禁

第1轮按 `lint → build → typecheck → test` 顺序执行，四项均实际输出：

```text
lint:      Tasks: 7 successful, 7 total; exit 0
build:     Tasks: 7 successful, 7 total; exit 0
typecheck: Tasks: 7 successful, 7 total; exit 0
test:      Tasks: 7 successful, 7 total; exit 0
```

root test 关键包统计：AI `17/17`、Web `24/24`、crawler `35/35`、DB `4/4`、Worker `45/45`；skip/todo 均为 `0`。本阶段按规定最多执行 3 轮，但第1轮已通过，不再重复消耗完整门禁轮次。

收口命令实际输出：

```text
git diff --check
diff_check_exit=0
changed=22
whitelist_outside=0
branch=codex/stage-10-event-cluster
head=f5e9d33（门禁执行时的阶段10基线）
post_commit=7fedbf0
```

## 未完成/阻塞

- 页面截图与浏览器视觉验收：阻塞，详见 `BLOCKED.md` 顶部的阶段10原始输出。
- 真实供应商模型质量、成本和线上效果：按项目边界留到供应商选定后的上线前验收。
- 阶段11评分/日报/后台/用户系统/部署：未开始。
