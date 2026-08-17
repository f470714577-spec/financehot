# 阶段 06 验收：安全采集 Adapter 与同步 crawl-once

核验日期：2026-08-17（Asia/Shanghai）

## 1. 验收范围

本阶段只交付受控的同步 `crawl-once` 输入链路：

```text
enabled + due source
  -> crawler SafeFetcher
  -> RSS/API/Web Adapter
  -> RawArticle DTO / raw_articles
  -> normalized Article DTO / articles
```

`packages/crawler` 只产出 shared DTO，不依赖 DB、AI 或 Worker；`apps/worker` 负责表驱动选择来源、创建 `crawl_task`、事务落库和幂等。BullMQ、常驻调度、LLM、Embedding、事件聚类和后台 UI 留到阶段 07 及以后。

## 2. 已冻结的契约与实现

- `@financehot/shared`：Source、Raw、Parsed、Normalized DTO，以及带 Zod 校验的 `adapter_config`。
- RSS/Atom：解析标题、链接、摘要、日期、语言，生成 canonical URL、content hash、title hash。
- JSON API：按 `itemsPath` 与字段映射读取数组；认证只保存环境变量名，不保存密钥。
- HTML Web：按 selector 配置读取列表项；先 robots，再读取页面；移除 script/style/noscript/template/svg，只保留摘要级文本。
- SafeFetcher：仅无凭据 `http/https`；DNS 解析得到的全部 A/AAAA 必须安全；实际请求绑定解析地址并复核；每次重定向重新校验；限制跳数、超时、响应字节和 Content-Type；仅 408/429/5xx/网络瞬断重试并尊重 Retry-After。
- 内容合规：RSS/API/HTML 原始项与标准化内容均限制为摘录级文本，单字段最多 20,000 字符；无效 `adapter_config` 不得回退到旧 RSS URL。
- robots：Web 源先读取 robots；404/410 允许继续，403/401 或 robots 请求失败拒绝；source 级最小间隔控频。
- 落库：先 `raw_articles`，再 `articles`；canonical URL、content hash、title hash 任一重复都不新增 Article，重复 Raw 保留状态与关联。

## 3. 来源合规清单

`adapter_config.compliance` 保存 robots URL、条款 URL、核验日期、频率和 `storeExcerptOnly=true`。所有启用源均为官方公开 RSS；Web 只保留低频候选，默认 disabled。

| 来源 | 方式 | Feed/页面 | robots | 使用条款/版权 | 频率 | 状态 |
|---|---|---|---|---|---|---|
| Federal Reserve Press Releases | RSS | `https://www.federalreserve.gov/feeds/press_all.xml` | `https://www.federalreserve.gov/robots.txt` | `https://www.federalreserve.gov/website-policies.htm` | 每小时最多一次 | enabled |
| Federal Reserve Monetary Policy | RSS | `https://www.federalreserve.gov/feeds/press_monetary.xml` | 同上 | 同上 | 每小时最多一次 | enabled |
| Federal Reserve Policy Rates | RSS | `https://www.federalreserve.gov/feeds/prates.xml` | 同上 | 同上 | 每小时最多一次 | enabled；本轮成功但当前无有效 item |
| European Central Bank Press Releases | RSS | `https://www.ecb.europa.eu/rss/press.html` | `https://www.ecb.europa.eu/robots.txt` | `https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html` | 遵守 Crawl-delay 5 秒，每小时最多一次 | enabled |
| European Central Bank Statistical Press Releases | RSS | `https://www.ecb.europa.eu/rss/statpress.html` | 同上 | 同上 | 遵守 Crawl-delay 5 秒，每小时最多一次 | enabled |
| European Central Bank Blog Posts | RSS | `https://www.ecb.europa.eu/rss/blog.html` | 同上 | 同上 | 遵守 Crawl-delay 5 秒，每小时最多一次 | enabled |
| US Bureau of Labor Statistics Economic Releases Web | Web | `https://www.bls.gov/news.release/` | `https://www.bls.gov/robots.txt` | `https://www.bls.gov/bls/blsterms.htm` | 每日一次，RSS 优先 | disabled |
| Federal Reserve Press Releases Web | Web | `https://www.federalreserve.gov/newsevents/pressreleases.htm` | `https://www.federalreserve.gov/robots.txt` | `https://www.federalreserve.gov/website-policies.htm` | 每日一次，RSS 优先 | disabled |

官方 RSS 清单明确列出 Fed feed、ECB press/statistical/blog feed；BLS 条款要求避免过度机器人访问。BIS 候选曾被核验，但 `https://www.bis.org/robots.txt` 禁止 `/doclist/`，而其候选 RSS 位于该路径，因此没有降低门槛启用；旧 BIS 行只保留 disabled，安装脚本不会向其发请求。

## 4. 真实采集证据

当前清单安装输出：

```text
{
  "installed": 8,
  "sourceCount": 8
}
```

真实 run-once（当前清单的 2 个新到期 RSS）：

```text
sourcesDue=2, tasksCreated=2, tasksSuccess=2, tasksFailed=0,
tasksRetrying=0, requests=2, rawSeen=15, rawInserted=15,
rawExisting=0, articlesInserted=15, articlesDuplicate=0
```

真实 run-once（再覆盖 3 个已到期官方 RSS）：

```text
sourcesDue=3, tasksCreated=3, tasksSuccess=3, tasksFailed=0,
tasksRetrying=0, requests=3, rawSeen=50, rawInserted=0,
rawExisting=50, articlesInserted=28, articlesDuplicate=22
```

新增 ECB Blog RSS 后的真实 run-once：

```text
sourcesDue=1, tasksCreated=1, tasksSuccess=1, tasksFailed=0,
tasksRetrying=0, requests=1, rawSeen=15, rawInserted=15,
rawExisting=0, articlesInserted=15, articlesDuplicate=0
```

摘录逻辑补强后的当前代码真实复验（Fed Press Releases，遵守低频到期条件）：

```text
sourcesDue=1, tasksCreated=1, tasksSuccess=1, tasksFailed=0,
tasksRetrying=0, requests=1, rawSeen=20, rawInserted=1,
rawExisting=19, articlesInserted=0, articlesDuplicate=20
```

该轮最新 Raw 摘录长度为 484 字节，状态为 `duplicate`，已关联既有 Article；未读取或展示新闻全文。

PostgreSQL 只读核对显示：5 个已覆盖的启用源均有 success task、retry_count=0；Web 候选 enabled=false，未产生请求。Fed Policy Rates 本轮响应成功但没有有效 item，因此 Raw/Article 为 0；这不影响其他官方 RSS 的真实输入链路，后续若持续为空应替换而不是放宽解析条件。

## 5. 幂等、状态与失败恢复

worker PostgreSQL 测试中的同一 fixture 连跑三轮输出：

```text
round 1: rawInserted=1, rawExisting=0, articlesInserted=1, articlesDuplicate=0
round 2: rawInserted=0, rawExisting=1, articlesInserted=0, articlesDuplicate=1
round 3: rawInserted=0, rawExisting=1, articlesInserted=0, articlesDuplicate=1
finalRawCount=1, finalArticleCount=1, taskStatuses=[success, success, success]
```

另有测试覆盖：禁用源 0 请求、缺少配置 failed、网络瞬断耗尽后的 retrying/retry_count、解析错误不重试、到期判断、失败不更新 `last_crawled_at`、跨 source 三键去重和事务先 Raw 后 Article。

## 6. 测试与反向验证

阶段06新增测试：crawler 34 项 + worker PostgreSQL 9 项 = 43 项；均为真实 Adapter/持久化逻辑，只有外部 HTTP、DNS、时钟作为注入边界，没有 mock 被测核心逻辑；0 fail、0 skip、0 todo。

反向 SSRF 验证：最终版本临时把 `addresses.some((record) => isForbiddenAddress(record.address))` 改为恒假，运行同一 crawler 测试实际得到 `32 pass / 2 fail`、退出码 1，失败覆盖混合 DNS 危险地址和重定向到私网；还原后得到 `34 pass / 0 fail`、退出码 0。临时改动已还原，未请求任何真实内网地址。

## 7. 运行命令

```powershell
pnpm --filter @financehot/crawler test
pnpm --filter @financehot/worker test
pnpm --filter @financehot/db test
pnpm --filter @financehot/web test
pnpm lint -- --force
pnpm typecheck -- --force
pnpm test -- --force
pnpm build -- --force
git diff --check
```

最终门禁结果以本文件提交前最后一次实际命令输出为准；若任一命令失败，不得宣称阶段06完成，并须把原因写入 `BLOCKED.md`。

## 8. 最终门禁快照

2026-08-17 最后一次实际运行结果：

- `pnpm --filter @financehot/crawler test`：34 pass、0 fail、0 skipped、0 todo。
- `pnpm --filter @financehot/worker test`：9 pass、0 fail、0 skipped、0 todo。
- `pnpm --filter @financehot/db test`：4 pass、0 fail、0 skipped、0 todo。
- `pnpm --filter @financehot/web test`：24 pass、0 fail、0 skipped、0 todo。
- `pnpm lint -- --force`：7/7 successful，0 error、0 warning。
- `pnpm typecheck -- --force`：7/7 successful。
- `pnpm test -- --force`：7/7 successful。
- `pnpm build -- --force`：7/7 successful，Next.js production build 完成。
- `git diff --check`：exit 0。

白名单检查曾发现一个不属于本任务、未被暂存的外部 Word 临时锁文件 `~$nanceHot_DeepSeek_开发总控包_V1.docx`；未执行删除，后续复核时该文件已由 Word 自行释放。最终 `git status --porcelain` 为空、暂存区为空，白名单外 diff=0。
