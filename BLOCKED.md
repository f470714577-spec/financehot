# BLOCKED

- 2026-08-16 续作替代路径核验：Docker 仅有失效的 `desktop-linux` named pipe；无可用 Podman/nerdctl/WSL；本机 PostgreSQL 14 缺少 `vector.control`，不能替代项目 pgvector 容器。未创建临时集群、未启动/修改系统服务。
- 2026-08-16 续作只读核验：本机 PostgreSQL 14 服务监听 `5432`，项目要求的 `5433` 仍无监听；以项目凭据连接 `5432/financehot` 返回 `28P01`，确认不是可替代的项目数据库。未对该服务执行迁移、Seed 或写入。
- 2026-08-16 阶段 05 开工：应用新增 migration `0001_lucky_spacker_dave.sql` 时，`pnpm --filter @financehot/db db:migrate` 实际失败 `ECONNREFUSED ::1:5433 / 127.0.0.1:5433`；本轮 PostgreSQL 未运行，根基线测试此前为 Turbo cache hit，不能据此声称真实 DB 已验证。已继续完成不依赖 DB 的代码、契约和测试准备；待本地数据库恢复后复验。
- 2026-08-16 继续核验：`docker --version` 和 Compose CLI 存在，但 `docker compose up -d postgres redis` 实际失败，Docker Desktop Linux engine named pipe 不存在；未进行任何数据删除或重置。

- 2026-08-16 开工核对：`pnpm --version` 为 11.19.0，根 `package.json` 锁定 `pnpm@11.21.0`；仅影响标准 pnpm 门禁，已记录并继续不受影响的验收准备。
- `node --version` 为 v26.3.1，满足 Node.js 22+；`origin/master` 与任务书均为 `90036fc`，20 个 `pgTable` 与基线一致。
- 本机无 `docker`/`corepack` 命令；未重装 Docker，PostgreSQL `5433`、Redis `6379` 已通过端口和 `/health` 实际状态核验。用户级 `pnpm@11.21.0` 已安装并优先于 Codex 兜底版本，版本漂移已解决。
- 浏览器对原始 JSON `/health` 报 `ERR_BLOCKED_BY_CLIENT`，已改用 HTTP 200 响应与 `database=up`、`redis=up` 验证；不影响页面验收。
- 浏览器外层 Statsig 遥测曾超时，FinanceHot 页面 `tab.dev.logs` error 始终为 0；不属于项目阻塞。
- 首次 `git commit` 因仓库未配置 author identity 退出 1；已从现有 HEAD 读取身份并写入 local Git config，阻塞已解决。

2026-08-16 当时记录：该轮暂无新的未解决阻塞；随后阶段05真实数据库验收仍因 Docker engine 未启动而阻塞，详见上方带日期的阶段05记录。

2026-08-17 收尾复验：Docker Desktop、PostgreSQL、Redis、migration、Seed、DB/Web真实测试、EXPLAIN、API、双视口前台与工程门禁均已完成；当前未解决阻塞：无。
