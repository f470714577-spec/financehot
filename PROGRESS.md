# PROGRESS

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
