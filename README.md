# 许愿星计划 (Wishstar)

> 一个帮助用户管理愿望、实现目标的任务管理系统

## 项目简介

许愿星计划是一个基于 Vue + Express + Redis 的全栈应用，帮助用户通过掷骰子、完成任务来实现愿望。

## 技术栈

- **前端**: Vue 3 + Vite + Axios
- **后端**: Node.js + Express
- **数据库**: Redis (AOF 持久化)
- **部署**: Docker Compose

## 项目结构

```
wishstart/
├── backend/          # 后端服务
├── frontend/         # 前端应用
├── redis/            # Redis 配置
├── docs/             # 项目文档
├── docker-compose.yml
└── README.md
```

## 快速启动

### 前置要求

- Docker
- Docker Compose

### 启动服务

```bash
# 启动所有服务
docker compose up -d

# 查看服务状态
docker compose ps
```

### 访问地址

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:80 |
| 后端 API | http://localhost:3005 |

### 停止服务

```bash
docker compose down
```

## 常用命令

```bash
# 查看日志
docker compose logs -f

# 重启单个服务
docker compose restart backend

# 重新构建镜像
docker compose build --no-cache
```

## 数据持久化

所有数据存储在 Redis 中，使用 AOF 持久化。数据卷：`wishstart_redis-data`

## 开发说明

### 本地开发（不通过 Docker）

**后端：**
```bash
cd backend
npm install
npm run dev
```

**前端：**
```bash
cd frontend
npm install
npm run dev
```

前端开发时需要配置代理连接到后端，参考 [frontend/vite.config.js](frontend/vite.config.js)

## 端口说明

| 服务 | 宿主机端口 | 容器内部端口 |
|------|-----------|-------------|
| 前端 | 80 | 80 |
| 后端 | 3005 | 3000 |
| Redis | 6379 | 6379 |
