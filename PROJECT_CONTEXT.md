# PROJECT_CONTEXT.md

> FinanceHot 项目当前状态的短期事实源。每次阶段完成后更新，防止长对话或新会话产生架构漂移。
> 权威基线仍是《FinanceHot DeepSeek 开发总控包 V1》+ `docs/architecture.md` + ADR。
> 最近复验：2026-08-19；阶段 05、阶段 06、阶段 07 和阶段 08 已完成本地工程验收；未推送、未部署、未上线。真实模型质量验收已移至供应商选定后的上线前验收。

## 当前阶段

阶段 08 —— Article AI 过滤、翻译、摘要、分类与实体抽取流水线（工程验收完成，本地稳定基线）

## 项目目标

FinanceHot 是面向中文用户的"全球财经新闻实时聚合、过滤、事件化与 AI 分析平台"。链路：采集 → 解析 → 中文化 → 财经过滤 → 去重 → 同事件聚类 → 多信源交叉验证 → AI 摘要/"为什么重要" → Finance/Heat 双评分 → 精选/热点榜/日报/搜索/主题。

## 当前冻结架构（阶段 00.1 通过）

- **技术栈**：Next.js(App Router) + TypeScript(strict) + Tailwind + shadcn/ui / PostgreSQL 16 + pgvector / Drizzle / Redis + BullMQ / Node.js Worker / pnpm workspace + Turborepo / LLMProvider 抽象 + zod / Docker。
- **核心拓扑**：`Web/API → Redis Queue(BullMQ) → Worker`，耗时任务全异步。

## Package 职责与依赖

- `shared`：唯一基础层（类型/常量/工具/zod DTO/错误）。
- `db`：Drizzle schema、client、migration（仅依赖 shared）。
- `ai`：可替换 OpenAI-compatible LLMProvider、错误分类、有限重试、usage 与独立 Zod Structured Output（仅依赖 shared）。
- `crawler`：SourceAdapter 接口 + RSS/API/Web 实现（仅依赖 shared）。
- `ui`：Design Token + 基础组件（依赖 shared）。
- `apps/web`：前台 + 后台 + API，可短事务 CRUD 与入队（组合 ui+db+shared）。
- `apps/worker`：流程编排（组合 db+ai+crawler+shared）。
- 规则：crawler 不依赖 ai/db；ai 不依赖 crawler/db；持久化与编排归 Worker。

## Web/Worker 边界

- `apps/web` 可执行短事务 CRUD 与任务入队，**禁止在 HTTP 请求内执行 Crawler、LLM、Embedding、Event Cluster 等耗时流水线**。
- `apps/worker` 负责持久化与工作流编排，crawler/ai 只产出 DTO，不写库。
- 阶段 08 仅启用 `crawl`、`normalize`、`ai_process`；Embedding、聚类、Finance Score、市场判断、后台和前端重构均未实现。
- LLM 配置由 `LLM_PROVIDER`、`LLM_BASE_URL`、`LLM_MODEL`、`LLM_API_KEY` 控制；四项缺失时 Worker 仍启动并明确输出 `status=unconfigured`，不发模型请求。

## Article/Event 核心原则

- `Article`（单信源单篇）≠ `Event`（多篇报道的同一财经事实）。
- 关系唯一权威 = `event_articles`（多对多，含 `is_primary`）；`articles` **无 event_id**。
- `articles` **无 heat_score**；Heat Score 以 Event 为唯一权威对象。
- `raw_articles` 0..1 → `articles`（可 FILTERED_OUT / DUPLICATE / FAILED）。

## 数据库 Extension（阶段 01 已准备）

- PostgreSQL 用 `pgvector/pgvector:pg16` 镜像。
- 初始化脚本 `docker/init/000-extensions.sql`：`CREATE EXTENSION IF NOT EXISTS vector;` + `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
- 阶段 02 首个 Drizzle migration 同样执行上述两个扩展。

## 表结构状态

- 阶段 02 已建 **P0 20 张表**（Drizzle schema + migration + seed）；P1 8 张表未落库（阶段 17/18 再建）。
- `articles` 无 `heat_score`、无 `event_id`；Article↔Event 唯一权威 = `event_articles`。
- 完整表清单见 `docs/architecture.md` §4。

## 已完成阶段

- 阶段 00：架构冻结（PASS）
- 阶段 00.1：架构修订（PASS）
- 阶段 01：项目基础工程与开发环境（已完成，历史基线）
- 阶段 02：数据库 Schema、Migration 与 Seed（PASS）
- 阶段 03：UI 设计系统与整体框架（已完成，待审核）
- 阶段 04：核心前台页面（已完成，本地验收通过）

## 阶段 01 验证结果

- `pnpm install` ✓（pnpm 11.21.0，workspace 依赖解析成功）
- `typecheck` 9/9 ✓ / `lint` 7/7 ✓ / `test` 7/7 ✓ / `build` 7/7 ✓（Next 15.5.23 编译成功，产物路由 `/` + `/_not-found`）
- Web 启动：`next start` → http://localhost:3000，HTTP 200，页面含 "FinanceHot"
- Worker 启动：输出 `FinanceHot Worker started` + env 读取日志，进程保持存活
- **Docker 已安装并打通**：Docker Desktop 4.86.0 + WSL2 后端；`postgres`（pgvector:pg16）与 `redis`（7-alpine）容器 healthy，扩展 `vector`/`pg_trgm`/`plpgsql` 就绪，Redis `PONG`。因本机无法直连 Docker Hub，已配置镜像加速（`~/.docker/daemon.json` 的 `registry-mirrors`），见 `docs/本地环境-Docker安装.md`。

## 阶段 02 验证结果

- Drizzle 定义 20 张 P0 表（`src/schema/` 按域拆分），migration `drizzle/0000_*.sql` 顶部含 `vector`/`pg_trgm` 扩展。
- migrate ✓（20 表）/ seed ✓（sources 15、articles 82、events 12、topics 8、daily_reports 1）/ test 4/4 ✓ / typecheck ✓ / lint ✓。
- 测试含 vector 列往返验证（customType 写入/读取正确）。
- **宿主机端口 5433**：本机 PostgreSQL 14 占用 5432，`docker-compose.yml` 与 `.env.example` 统一用 `5433:5432` 映射；容器内部仍走 `postgres:5432`。

## 阶段 03 验证结果

> 以下为阶段完成时的历史验证记录；本次知识收尾未重复执行浏览器视觉验收。

- 完成 Light/Dark 双主题与完整 Design Tokens：颜色、字体、字号、间距、圆角、阴影、状态色；遵循中国市场涨红跌绿，并通过图标/文字补充语义。
- 完成 Desktop Sidebar + Header + Main Content App Shell；移动端使用抽屉侧栏与底部导航，390px 实测无横向溢出。
- 完成 13 个组件骨架：NewsCard、EventCard、FinanceScoreBadge、HeatScoreBadge、MarketImpact、SourceBadge、Tag、DateGroup、FilterBar、SearchBar、EmptyState、ErrorState、Skeleton。
- 根页面作为阶段 03 组件示例页，使用明确标识的演示财经内容；未接入 Crawler/AI。
- 浏览器实测：桌面端与移动端渲染正常，Light/Dark 切换、移动导航开合正常，控制台无错误或警告。
- `/health` 实测 HTTP 200，database/redis 均为 `up`。
- build 7/7 ✓ / lint 7/7 ✓ / typecheck 7/7 ✓ / test 7/7 ✓；数据库 4 项真实访问测试全部通过。

## 阶段 04 验证结果

- 基于 `@financehot/db/seed-data` 建立前台视图模型适配层，事件、文章、主题、日报均复用同一套 Seed 数据；未提前实现阶段 05 查询 API。
- 完成核心前台路由：`/`、`/news`、`/hot`、`/news/[id]`、`/event/[id]`、`/daily`、`/topics`、`/topics/[id]`。
- 首页包含统计、Top 5 热点、分类切换、按日期分组时间流和“发现 N 条新动态”交互骨架。
- 全部动态包含搜索、时间、市场、分类、评分筛选 UI；热点榜支持 1h / 3h / 6h / 12h / 24h / 7d 窗口切换骨架。
- 新闻详情保留 Article 语义；事件详情展示多信源列表、事实状态、Finance/Heat Score 和事件时间线；日报与主题页可从 Seed 浏览。
- 所有核心页面具备路由级 loading、全局 error、not-found，以及可通过 `?state=empty` / `?state=error` 预览的空数据/错误状态。
- 2026-08-16 正式验收：1440×900 与 390×844 双视口逐页复核；11 个页面/状态入口页面级横向溢出为 0，浏览器页面控制台 error/warning 均为 0；首页、全部动态、热点榜、事件详情各保存桌面/移动截图。
- 交互验收：移动导航抽屉、Light/Dark 切换、首页新动态提示、新闻搜索/分类筛选、热点时间窗口均通过；Article 详情与 Event 详情语义互斥且事件信源/时间线可见。
- 服务验收：`/`、`/news`、`/hot`、新闻详情、事件详情、`/daily`、`/topics`、主题详情、`/health` HTTP 200；未知路由 HTTP 404；`/health` 返回 database/redis 均为 `up`。
- 工程门禁：使用 pnpm 11.21.0 完成 `lint` 7/7、`typecheck` 7/7、`test` 7/7、`build` 7/7；数据库测试 4 pass、0 fail、0 skipped、0 todo；Next.js ESLint 插件警告已清零。
- 反向验证：临时加入明确的内部 `<a href="/">` 后 Web lint 退出 1；立即还原后同命令退出 0，证据见 `docs/acceptance/eslint-negative.txt` 与 `eslint-green.txt`。

## 阶段 05 当前结果

- 已实现 shared Zod DTO、统一 API 错误体、9 类 Route Handler、PostgreSQL 查询层、HMAC 复合 cursor、组合筛选、中文搜索、批量详情和新增索引迁移。
- 阶段 04 全部前台路由已移除演示数据直连，首页、新闻、热点、详情、日报、主题均通过同一 DB 查询服务；浏览器筛选/搜索/加载更多通过 API。
- Web 测试共 24 项：原有 PostgreSQL Route Handler 20 项加本次时间锚点纯函数回归 4 项，24 pass、0 fail/skip/todo；DB 测试 4 pass、0 fail/skip/todo，原 20 项测试文件相对修复前 diff 为 0。
- 时间筛选已由单一状态锚点驱动：URL 初始化逐字复用 `from`，筛选/搜索/刷新/cursor 请求复用同一值，主动切换时间范围才生成一次新值，all 清除 `from`。
- 静态门禁：lint 7/7（0 warning）、typecheck 7/7、build 7/7、git diff --check 通过；演示数据引用检查 0 命中。
- 浏览器 A/A/A→B/B 实测通过：7d A 为 `2026-08-10T12:32:48.743Z`，加载更多 20→40 且 40 个唯一；24h B 为 `2026-08-16T12:34:06.266Z`，后续 cursor 继续复用 B；控制台 error/warn 为 0。
- 阶段 05 已完成；阶段 06 当前结果见下节，当前无未解决的外部阻塞。

## 阶段 06 当前结果

- shared 已冻结 Source/Raw/Parsed/Normalized DTO 与 Zod `adapter_config`；crawler 提供 RSS/Atom、可配置 JSON API、可配置 HTML Web Adapter，统一返回 DTO，不写 DB、不调用 AI。
- SafeFetcher 只允许无凭据 `http/https`，对全部 A/AAAA、IPv4-mapped IPv6、每次重定向、响应大小、Content-Type、Retry-After、robots 与 source 控频执行安全边界；错误按 security/dns/robots/http/parse/network 等分类。
- `sources.adapter_config` 由 `0002_fast_mattie_franklin.sql` 单向 migration 增加；15 个 Demo `.example` 源被禁用。`apps/worker` 的同步 `crawl-once` 先写 `raw_articles` 再写 `articles`，按 canonical URL/content_hash/title_hash 幂等，并记录 crawl task 成败/重试。
- 当前来源清单 8 行：6 个启用官方 RSS、2 个低频 Web 候选 disabled；BIS `/doclist/` 因 robots 禁止而淘汰，当前不再请求，早期探测结果不纳入合规验收。真实 run-once 已有 success task 与 Raw/Article 输入；详细数字、来源条款和测试命令见 `docs/acceptance/phase-06.md`。

## 阶段 08 当前结果

- 2026-08-19 工程验收完成：Web `24/24`、AI `10/10`、Worker `39/39`、crawler `35/35`、DB `4/4`，根级 lint/typecheck/test/build 均 `7/7` 成功，0 fail/skip/todo；Web 热点测试使用测试专属当前时间 Event，测试后精确清理为 0。
- Provider 每次实际 HTTP attempt 均可写入 `ai_usage`，包含 `provider_attempt`、`outcome`、`http_status`、`usage_reported`；失败、重试、非法 JSON、Schema 失败和 timeout 均有覆盖，重复任务与双 Worker 竞争保持幂等。
- `apps/worker/package.json` 相对 `4d146a8` 仅保留获批的 `@financehot/ai` 与 `zod` 必要依赖；新增向前 migration 为 `0006`，未改旧 migration、Seed、生产 Hot 查询或系统时钟。
- 当前无工程阻塞；没有真实模型密钥，本地受控 Provider 只证明协议、审计、队列、数据库和缓存行为，不代表真实模型质量或成本。
- OpenAI-compatible HTTP Provider 已实现：环境配置、unconfigured、401/429/5xx/超时/网络错误分类，有限重试，纯 JSON `JSON.parse` + Zod 校验，usage 与可选成本估算。
- 五步 Prompt 已在 `prompts/index.ts` 版本化；正文使用数据边界，Prompt Injection 只作为文章内容处理。
- Worker 已在现有 `crawl → normalize` 后为新 Article 创建确定性 `financial-filter` 任务，并按过滤→翻译→摘要→分类→实体抽取顺序执行；非财经 Article 保留、隐藏、设为 `filtered_out`。
- 真实 Redis/PostgreSQL 十条样本、失败 retry/failed、重复入队缓存命中、migration 与全量门禁均已完成；历史红叉和原始证据见 `BLOCKED.md`。
- 当前没有真实模型密钥；即使本地受控 HTTP Provider 验收通过，也必须明确记录“真实模型质量未验收”。

## 架构待办

- 阶段 05：新闻查询 API、筛选、搜索与分页；已完成本地正式验收。
- 阶段 06：crawler 安全 Adapter、来源表驱动同步 crawl-once、Raw/Article 幂等（已完成本地验收）。
- 阶段 07：BullMQ `crawl`/`normalize` Queue + Worker 状态机（已完成本地验收；详见 `docs/acceptance/phase-07.md`）。
- 阶段 08：LLM Provider 实现 + Structured Output + 翻译/摘要/分类/过滤（工程验收完成；真实模型质量在上线前验收，详见 `docs/acceptance/phase-08.md`）。
- 阶段 09：Embedding、事件聚类与关联（未开始）。
- 阶段 16：多阶段生产 Dockerfile + 部署。

## 禁止事项

- 不写死数据、不伪造测试成功、不复制参考站源码/品牌资产。
- 不绕过付费墙/验证码/访问控制；不全文转载版权新闻。
- 不让 LLM 编造财经事实；不为丰富内容强行关联股票。
- 不在 HTTP 请求内执行耗时流水线。
- 一次只做一个阶段，未经允许不提前开发下一阶段。
