# 本地环境：Windows 安装 Docker Desktop 指南

> 用途：FinanceHot 阶段 02 起需要 PostgreSQL(pgvector) + Redis，两者都通过 `docker compose` 拉起。
> 适用：Windows 10（2004+）/ Windows 11，开发者本机。

## 为什么不能由 Agent 直接安装

当前 Agent 运行在受限沙箱（`workspace-write`）内，且进程非管理员，无法写 `Program Files`、注册服务、启用 WSL。因此 Docker 需要**你在本机以管理员身份手动执行**一次。本文档把步骤降到最少。

## 方式 A：一键脚本（推荐）

1. 打开「Windows Terminal / PowerShell」并切到项目目录：
   ```powershell
   cd F:\cc-project\Financial News Network
   ```
2. 运行脚本（会自动弹 UAC 提权，点「是」）：
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\install-docker.ps1
   ```
3. 脚本会依次：启用 WSL2 + 虚拟机平台 → 用 winget 安装 Docker Desktop → 更新 WSL 内核。

## 方式 B：手动安装

### 1. 启用 WSL2
以**管理员身份**打开 PowerShell，执行：
```powershell
wsl --install
```
> 若无 `wsl`，先启用两个功能：
> ```powershell
> dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
> dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
> ```

### 2. 安装 Docker Desktop
任选其一：
- **winget**：
  ```powershell
  winget install -e --id Docker.DockerDesktop
  ```
- **官方安装包**：下载 <https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe> 并双击安装。

### 3. 重启并完成首次启动
- **重启电脑**（启用 WSL / 虚拟机平台后必须重启）。
- 启动「Docker Desktop」，按向导完成首次设置（选择 WSL2 后端）。
- 如果提示 WSL kernel 太旧：`wsl --update`。

## 镜像加速配置（必要，否则拉镜像超时）

国内直连 Docker Hub（`registry-1.docker.io`）通常超时，首次 `docker compose up` 会卡在 `Pulling` 阶段并报 `connectex: A connection attempt failed`。需为 Docker Desktop 配置 registry mirror：

1. 彻底退出 Docker Desktop（托盘图标右键 → Quit）。
2. 编辑 `C:\Users\<用户名>\.docker\daemon.json`，加入 `registry-mirrors`：
   ```json
   {
     "registry-mirrors": [
       "https://docker.1panel.live",
       "https://docker.m.daocloud.io",
       "https://dockerproxy.net",
       "https://docker.1ms.run",
       "https://hub.rat.dev"
     ]
   }
   ```
   （若文件已有其他字段，在顶层追加 `registry-mirrors` 即可，注意 JSON 逗号。）
3. 重新启动 Docker Desktop，验证生效：
   ```powershell
   docker info --format '{{json .RegistryConfig.Mirrors}}'
   ```
   输出应包含上面配置的地址（非空 `[]`）。

> 注意：配置位置是 `~/.docker/daemon.json` 的 `registry-mirrors`，**不是** `settings-store.json`（Docker Desktop 4.x 不读取该文件里的镜像字段）。

## 验证

```powershell
docker --version
docker compose version
```

在项目目录拉起数据库与缓存：
```powershell
cd F:\cc-project\Financial News Network
docker compose up -d postgres redis
```

验证容器状态：
```powershell
docker compose ps
```

## 常见问题

| 问题 | 处理 |
|---|---|
| 提示「WSL2 未安装」 | 管理员运行 `wsl --install` 后重启 |
| 提示「需要在 BIOS 开启虚拟化」 | 进 BIOS 开启 Intel VT-x / AMD-V（不同主板名称不同） |
| `docker compose up` 拉镜像慢 | 配置国内镜像加速，或耐心等待 |
| Docker Desktop 启动失败 | 打开「Windows 功能」，确认勾选「适用于 Linux 的 Windows 子系统」与「虚拟机平台」 |

## 装好后

回到 `PROJECT_CONTEXT.md` 的「下一阶段」，即可开始阶段 02（数据库 Schema / Migration / Seed）。装好后告诉我，我继续推进。
