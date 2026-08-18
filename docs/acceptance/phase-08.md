# 阶段 08 验收记录

> 状态：进行中。本文只记录实际执行过的命令和输出；没有真实模型密钥时不伪造模型质量结论。

## 范围与边界

- 允许的 AI 步骤：`financial-filter`、`translate`、`summarize`、`classify`、`entity-extraction`。
- 只启用 `crawl`、`normalize`、`ai_process`；不实现 Embedding、聚类、Finance Score、市场多空判断、后台或前端重构。
- Provider 是由 `LLM_PROVIDER`、`LLM_BASE_URL`、`LLM_MODEL`、`LLM_API_KEY` 配置的 OpenAI-compatible HTTP 适配器。
- 当前没有真实模型密钥；本地受控 HTTP Provider 不能证明真实模型质量，最终结论必须保留“真实模型质量未验收”。

## 已完成的静态与 Provider 证据

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

Worker、DB、AI 直接 TypeScript 检查已退出 0；完整 `pnpm` 门禁仍待依赖服务恢复后按任务书复跑。

## 真实服务验收命令与待填输出

```text
docker compose up -d postgres redis
pnpm --filter @financehot/db db:migrate
$env:CI=true; pnpm --filter @financehot/worker test -- --force
```

目标：至少 10 条英文 Article，其中 2 条非财经、1 条 Prompt Injection；真实 Redis/PostgreSQL 队列完成，中文标题/摘要/分类/reason 落库，原文字段零覆盖，过滤内容不出现在 `listNews`，失败进入 retry/failed，重复入队 usage 与 HTTP 调用数都不增加。

## 当前实际阻塞

2026-08-18 继续复核时，`docker compose ps` 仍返回 Docker Desktop Linux engine named pipe 不存在；`com.docker.service` 为 `Stopped` 且无法启动，Docker Desktop 可执行文件路径不存在，5433/6379 均未监听。`CI=true pnpm --filter @financehot/db db:migrate` 只进入 `Recreating ...\node_modules`，未到数据库连接阶段；`corepack enable` 也因命令不存在退出 1。全量基线首轮还出现 Node `spawn EPERM`。原始输出已置于 `BLOCKED.md` 顶部，恢复后必须补写红→绿和全量门禁原始输出。
