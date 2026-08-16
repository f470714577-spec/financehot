# 阶段 04 正式验收

## 结论

- 验收日期：2026-08-16。
- 结论：本地已验收，未推送，未部署。
- 验收服务：Next.js 15.5.23 production server，`http://localhost:3000`。
- 视口：桌面端 1440×900；移动端 390×844。
- 页面级横向溢出：两种视口、11 个页面/状态入口均为 0；桌面端内容宽度为 1425px，移动端内容宽度为 375px（空/错/404 页面内容宽度为视口宽度）。
- 浏览器页面控制台：两种视口均为 0 error、0 warning。

## 环境与服务证据

- `node --version`：`v26.3.1`，满足 Node.js 22+。
- 项目锁定 `pnpm@11.21.0`；本机没有 `corepack`，使用 `npm exec --yes --package=pnpm@11.21.0 -- pnpm ...` 完成冻结锁文件安装、构建和门禁，未删除依赖目录。
- 本机没有 Docker CLI，未重装 Docker；现有 PostgreSQL `127.0.0.1:5433` 与 Redis `127.0.0.1:6379` TCP 可用。
- `Invoke-WebRequest http://localhost:3000/health`：HTTP 200，响应为 `status=ok`、`database=up`、`redis=up`。
- `/health` 返回原始 JSON，被本地浏览器表面报 `ERR_BLOCKED_BY_CLIENT`；该入口改用 HTTP 响应和真实服务状态验收，不计为页面错误。

## 路由与状态

| 入口 | HTTP | 1440×900 | 390×844 | 演示/语义证据 |
| --- | ---: | --- | --- | --- |
| `/` | 200 | 通过 | 通过 | 有“演示数据 / Seed UI”标识 |
| `/news` | 200 | 通过 | 通过 | 有 Seed 标识、搜索和筛选 |
| `/hot` | 200 | 通过 | 通过 | Heat Score 与时间窗口可见 |
| `/news/demo-article-standalone-0` | 200 | 通过 | 通过 | `NEWS DETAIL`，未出现 `EVENT DETAIL` |
| `/event/demo-event-0` | 200 | 通过 | 通过 | `EVENT DETAIL`、信源、事件时间线可见 |
| `/daily` | 200 | 通过 | 通过 | 有 Seed 标识 |
| `/topics` | 200 | 通过 | 通过 | 有 Seed 标识 |
| `/topics/fed-policy` | 200 | 通过 | 通过 | 主题详情语义可见 |
| `/health` | 200 | HTTP 验收 | HTTP 服务可用 | database/redis 均为 `up` |
| `/news?state=empty` | 200 | 空状态可见 | 空状态可见 | “当前筛选没有结果” |
| `/news?state=error` | 200 | 错误状态可见 | 错误状态可见 | “演示查询失败” |
| `/not-found-route` | 404 | 404 页面可见 | 404 页面可见 | “没有找到这条演示内容” |

## 代表页面截图

截图均为本轮生产构建后重新加载页面取得，共 4 个代表页面 × 2 个视口：

- [首页·桌面](screenshots/home-desktop.jpg) / [首页·移动](screenshots/home-mobile.jpg)
- [全部动态·桌面](screenshots/news-desktop.jpg) / [全部动态·移动](screenshots/news-mobile.jpg)
- [热点榜·桌面](screenshots/hot-desktop.jpg) / [热点榜·移动](screenshots/hot-mobile.jpg)
- [事件详情·桌面](screenshots/event-desktop.jpg) / [事件详情·移动](screenshots/event-mobile.jpg)

## 交互验收

- 移动端打开导航抽屉后，主导航可见；点击“全部动态”后进入 `/news`。
- 主题切换实测：初始深色 → 浅色 → 深色，`document.documentElement` 状态按预期切换。
- 首页“查看新动态”后显示“新动态已插入时间流（演示交互）”。
- `/news` 搜索“美联储”得到 12 条结果；重新进入 `/news` 后选择“科技”得到 8 条结果。
- `/hot` 选择“1小时”后 URL 为 `/hot?window=1h`，页面显示 `HEAT RANKING · 1h`。
- Article 与 Event 语义互斥：新闻详情仅显示 `NEWS DETAIL`；事件详情显示 `EVENT DETAIL`、信源和事件时间线。

## 验收边界

- 本轮只验收阶段 04 Seed 前台页面、状态、响应式、可访问交互和工程门禁；未新增阶段 05 API、Crawler、LLM 或 BullMQ 流程。
- 本地浏览器外层曾出现一次 Statsig 遥测请求超时，但页面 `tab.dev.logs` 的 error 数保持为 0；该遥测不属于 FinanceHot 页面运行错误，详见 `BLOCKED.md`。
