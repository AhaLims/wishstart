# 许愿星计划 (Wishstar)

> 一个帮助用户管理愿望、实现目标的任务管理系统

## 项目简介

许愿星计划是一个基于 Vue + Express 的全栈应用，帮助用户通过掷骰子、完成任务来实现愿望。

## 技术栈

- **前端**: Vue 3 + Vite + Pinia + Axios
- **后端**: Node.js + Express
- **存储**: Redis / 本地 JSON 文件 / 内存，三选一（见「存储模式」）
- **部署**: 本地直跑，或 Docker Compose

## 项目结构

```
wishstart/
├── backend/          # 后端服务
│   └── src/
│       ├── app.js        # Express 应用工厂（网页端 / 桌面端共用）
│       ├── index.js      # 后端入口，按 STORAGE 选择存储
│       ├── routes/       # API 路由
│       ├── services/     # 业务逻辑（内存存储、结算、北京日期等）
│       └── stores/       # JSON 文件存储
├── frontend/         # 前端应用
├── electron/         # 桌面端 Electron 主进程
├── redis/            # Redis 配置（仅 Docker 模式使用）
├── scripts/          # 数据迁移脚本
├── docs/             # 项目文档
├── docker-compose.yml
└── README.md
```

## 存储模式

后端通过 `STORAGE` 环境变量选择存储，三种模式共用同一套路由代码：

| `STORAGE` | 存储位置 | 数据文件 | 重启后数据 |
|-----------|---------|---------|-----------|
| `redis`（默认） | Redis 服务 | — | 保留 |
| `json` | 本地 JSON 文件 | `JSON_STORE_PATH` | 保留 |
| 内存兜底 | 进程内存 | — | **全部丢失** |

- **`redis`**：默认值。连不上 Redis 时不会启动失败，而是自动退回内存存储并打印一条警告。
- **`json`**：桌面端使用的模式，数据写入单个 JSON 文件，便于备份和迁移。
- **内存兜底**：只是「Redis 不可用」时的保底行为，适合快速起服务看一眼，**不建议用来跑真实数据**。

## 快速启动

### 前置要求

- **Node.js >= 20**（桌面端打包同样需要）

仅在 Docker 模式下需要：

- Docker + Docker Compose

### 方式一：本地直跑（无需 Docker）

**后端** —— 默认内存存储，退出即清空：

```bash
cd backend
npm install
node src/index.js        # 监听 http://localhost:3000
```

想保留数据，改用 JSON 文件存储：

```bash
cd backend
STORAGE=json JSON_STORE_PATH=./wishstar-data.json node src/index.js
```

> **Windows 注意**：`STORAGE=json node ...` 这种环境变量前缀写法在 **Git Bash** 里可用。
> 在 **PowerShell** 里要写成：
> ```powershell
> $env:STORAGE="json"; $env:JSON_STORE_PATH="./wishstar-data.json"; node src/index.js
> ```

**前端** —— 另开一个终端：

```bash
cd frontend
npm install
npm run dev              # 监听 http://localhost:5173
```

前端开发服务器会把 `/api` 代理到 `http://localhost:3000`（见 [frontend/vite.config.js](frontend/vite.config.js)）。
**后端必须跑在 3000 端口**，否则页面接口全部 404。

**访问地址：http://localhost:5173**

### 方式二：Docker Compose

```bash
docker compose up -d      # 启动全部服务
docker compose ps         # 查看服务状态
docker compose down       # 停止服务
```

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:80 |
| 后端 API | http://localhost:3005 |

### 常用命令（Docker）

```bash
docker compose logs -f              # 查看日志
docker compose restart backend      # 重启单个服务
docker compose build --no-cache     # 重新构建镜像
```

## 端口说明

| 服务 | 本地直跑 | Docker 宿主机 | 容器内部 |
|------|---------|--------------|---------|
| 前端 | 5173（Vite dev） | 80 | 80 |
| 后端 | 3000 | 3005 | 3000 |
| Redis | 6379（若用本地 Redis） | 6379 | 6379 |

> ⚠️ 这是最容易踩的坑：后端**本地直跑是 3000，Docker 模式才对外暴露成 3005**。
> 把前端代理照 Docker 的端口去改，会导致接口全部失效。

## 数据持久化

- **Redis 模式**：数据存在 Redis，使用 AOF 持久化，Docker 数据卷为 `wishstart_redis-data`。
- **JSON 模式**：数据写在 `JSON_STORE_PATH` 指向的单个文件里，该文件本身即完整数据快照，可直接拷贝备份。
  写入采用「临时文件 + rename」的原子写；每次覆盖前保留一份 `.bak`；主文件解析失败时启动会自动尝试从
  `.bak` 恢复；进程收到 `SIGINT` / `SIGTERM` 时立即落盘。
- **内存兜底**：进程退出即全部丢失，无任何持久化。

---

## 桌面端（Windows .exe）

桌面端复用同一套前后端，通过 Electron 打包为 Windows 应用，数据保存在本地 JSON 文件（单文件、可备份）。

### 架构说明

详见 [docs/桌面端架构设计.md](docs/桌面端架构设计.md)。

- 桌面端 = 同一套 Express 路由 + 本地 JSON 存储（`STORAGE=json`）+ Electron 窗口壳。
- 网页端 = 原 Docker Compose（Redis），功能不变，不提供计时功能。
- 双端通过统一 JSON 快照互导数据（设置页 → 导出/导入快照，覆盖式 + 自动备份）。

### 在 Windows 上打包 .exe

前置：安装 [Node.js LTS](https://nodejs.org/)（>= 20）。

```bash
# 在 wishstart 目录下
npm install                 # 安装 electron / electron-builder
npm run dist:win            # 生成 NSIS 安装版 + portable 绿色版（输出到 dist-desktop/）
npm run dist:win:portable   # 只生成绿色版
```

> 建议直接在 Windows 上构建；在 Linux/WSL 上构建 Windows 包需要 wine，体验较差。

### 本地开发桌面端

```bash
npm run dev:desktop         # 构建前端并用 Electron 打开
```

### 数据迁移（容器 → 桌面端）

在跑容器的机器上（WSL 内，容器启动状态下）：

```bash
node scripts/export-redis.js wishstar-export.json
```

然后把 `wishstar-export.json` 拷到 Windows，打开桌面端 → 设置 → 导入快照。导入为覆盖式，导入前桌面端会自动备份当前数据文件。

- 校验：导入后检查统计页的累计星星、任务数、愿望数是否与导出摘要一致。
- 迁移完成并确认无误前，不要停容器；导出的 JSON 本身就是完整备份。
- 注意：容器里旧的「完成25min」这类手动任务会保持为通用型任务，需要时可在桌面端新建一个时间型任务（如 25 分钟自动完成 1 次）来接替自动结算。
