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
│   ├── uploads/          # 愿望配图（运行时生成，已被 .gitignore 忽略）
│   └── src/
│       ├── app.js        # Express 应用工厂
│       ├── index.js      # 后端入口，按 STORAGE 选择存储
│       ├── routes/       # API 路由
│       ├── services/     # 业务逻辑（内存存储、结算、北京日期、配图读写等）
│       └── stores/       # JSON 文件存储
├── frontend/         # 前端应用
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
- **`json`**：数据写入单个 JSON 文件，便于备份和迁移。
- **内存兜底**：只是「Redis 不可用」时的保底行为，适合快速起服务看一眼，**不建议用来跑真实数据**。

## 快速启动

### 前置要求

- **Node.js >= 20**

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

### 方式二：Docker Compose（⚠️ 有已知问题，先看下面）

#### ⚠️ Docker 启动前必读

**这套 Docker 配置目前跑不出完整功能，配图一定会出问题。想用 Docker 跑之前先看这里 —— 下面三条都是已知的、还没修的：**

1. **配图在页面上根本显示不出来。** [frontend/nginx.conf](frontend/nginx.conf) 只把 `/api/` 代理到了后端，
   **没有代理 `/uploads/`**，所以 `/uploads/xxx.jpg` 会被 nginx 当成静态文件去找，找不到就回退成
   `index.html`，浏览器拿到的是一段 HTML 而不是图片 —— 每张配图都会退化成占位图标。
   （本地直跑没这个问题：开发模式靠 [frontend/vite.config.js](frontend/vite.config.js) 的代理，
   生产模式由后端自己托管 `/uploads`。）
2. **配图会在重建容器后丢失。** [docker-compose.yml](docker-compose.yml) 的 backend 服务只挂了
   Redis 的卷，**没有挂载 uploads 目录**，配图只存在容器可写层里。`docker compose down` 之后再
   `up`，容器一重建所有配图就没了（愿望数据在 Redis 里不受影响，所以会看到愿望还在、配图全变空）。
3. **Node 版本对不上。** 两个 Dockerfile 都基于 `node:18-alpine`，而本项目要求 Node >= 20
   （见上方「前置要求」），且 Node 18 早已停止维护。

三条修起来都不难（补一段 nginx `location /uploads/`、给 backend 加一行卷映射、把基础镜像换成
`node:20-alpine`），但在修之前，**建议继续用「方式一：本地直跑」**，那条路是完整可用的。

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

### 愿望数据

- **Redis 模式**：数据存在 Redis，使用 AOF 持久化，Docker 数据卷为 `wishstar_redis-data`。
  键名：`wishstar:wish:<id>`（愿望本体，Hash）、`wishstar:wishes:index:<userId>`（某用户的愿望 id 集合）、
  `wishstar:logs:<userId>`（流水，ZSet）。
- **JSON 模式**：数据写在 `JSON_STORE_PATH` 指向的单个文件里，该文件本身即完整数据快照，可直接拷贝备份。
  写入采用「临时文件 + rename」的原子写；每次覆盖前保留一份 `.bak`；主文件解析失败时启动会自动尝试从
  `.bak` 恢复；进程收到 `SIGINT` / `SIGTERM` 时立即落盘。
- **内存兜底**：进程退出即全部丢失，无任何持久化。

### 愿望配图（`backend/uploads/`）

从「愿望支持上传配图」这个功能起，配图**不是**存在数据文件里的，而是以独立文件存在磁盘上：

| 项 | 说明 |
|---|---|
| 存放目录 | `UPLOADS_DIR`，默认 `backend/uploads/` |
| 对外地址 | `/uploads/<文件名>`，由后端静态托管（带 `immutable` 长缓存） |
| 文件名 | `sha256(图片内容)` 前 16 位 + 后缀，后缀按文件魔数判定。内容相同 → 文件名相同，天然去重 |
| 单张上限 | 3 MB（`WISH_IMAGE_MAX_BYTES`）。前端上传前会先用 canvas 缩到最大边 800px，正常远小于此 |
| 数据库里存什么 | 愿望 Hash 的 `image` 字段只存相对路径，如 `/uploads/9f2c1ab34de5f607.jpg` |
| 与图标的关系 | 二选一。设置了配图则 `icon` 为空，反之为默认图标 |

### ⚠️ 备份要点

**配图和愿望数据是两个地方，备份必须一起拷，只拷数据文件会导致所有配图变成空链接。**

| 场景 | 要备份的东西 |
|---|---|
| 本地直跑（JSON 模式） | `backend/wishstar-data.json` **+** `backend/uploads/` |
| 本地直跑（Redis 模式） | Redis 数据 **+** `backend/uploads/` |
| Docker | `wishstar_redis-data` 卷 **+** 容器内的 `uploads/` —— ⚠️ 见下方「Docker 启动前必读」 |

### 跨设备搬家：用快照，不要只拷文件

设置页的「导出快照」会把**被引用到的配图一并内嵌成 base64** 打包进 JSON（快照格式 `version: 2` 的 `blobs` 字段），
所以换台机器只要导入这一个快照文件，配图会一起还原，不用手动搬 `uploads/` 目录。导入时会先写配图文件、
再写数据，并且只写入快照里确实被引用到的文件。

代价是快照文件会明显变大（一张压缩后的配图约几十到一百多 KB，base64 后还要再涨约 1/3），
配图很多时导出的大小上限是 40 MB。
