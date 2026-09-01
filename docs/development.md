# Seek 开发环境

本文档描述 Seek 在 Arch Linux 上的本地开发环境。方案与技术设计文档保持一致，Node.js 24 和 26 均可使用。

## 1. 开发模式

开发阶段采用“宿主机运行 TypeScript 应用，Docker 运行基础设施”的方式：

```text
Arch Linux
├── Node.js 26 + pnpm + Turborepo
├── apps/web
├── apps/collaboration
├── apps/worker
└── Docker Compose
    ├── PostgreSQL 17 + PGroonga + pgvector + pg_trgm
    └── Redis 7.4
```

宿主机运行 Node 服务可以保留 Next.js 热更新、断点调试和快速重启。生产环境再把 `web`、`collaboration`、`worker` 和反向代理打包成容器。

开发 Compose 只启动 PostgreSQL 和 Redis。附件使用仓库中的 `.data/attachments`，不额外启动对象存储；AI 和 MCP 未配置时关闭。

## 2. Arch Linux 主机依赖

需要安装：

- Node.js 24 或 26；
- npm（用于启用 pnpm）；
- Docker Engine 与 Docker Compose plugin；
- Git。

Node.js 推荐使用 `mise`、`fnm` 或其他版本管理器，避免直接依赖 Arch rolling release 的系统 Node。项目不硬性限制 Node.js 主版本，开发和 CI 应至少覆盖 Node 24 与 Node 26。

启用 pnpm：

```bash
corepack enable
corepack prepare pnpm@latest --activate
node --version
pnpm --version
```

如果发行版没有提供 `corepack`，可以使用 npm 安装 pnpm，但应在团队约定中固定 pnpm 主版本。

## 3. Docker 权限

将当前用户加入 Docker 组：

```bash
sudo usermod -aG docker "$USER"
```

注销并重新登录桌面会话后检查：

```bash
id
docker info
docker compose version
```

`id` 的 groups 中应出现 `docker`。如果只在当前终端临时执行 `newgrp docker`，桌面应用或后续终端不一定继承新组权限，因此重新登录更可靠。

## 4. 启动基础设施

仓库根目录执行：

```bash
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml ps
```

首次启动会构建一个本地 PostgreSQL 镜像。该镜像基于 PGroonga PostgreSQL 17 镜像，并在同一个镜像内编译 pgvector；这样不会同时运行或下载两套 PostgreSQL。

检查扩展：

```bash
docker compose -f docker-compose.dev.yml exec postgres \
  psql -U seek -d seek -c '\\dx'
```

应能看到 `pg_trgm`、`vector` 和 `pgroonga`。初始化脚本只会在 PostgreSQL 数据目录首次创建时执行。

常用操作：

```bash
# 查看日志
docker compose -f docker-compose.dev.yml logs -f postgres redis

# 停止服务但保留数据
docker compose -f docker-compose.dev.yml stop

# 启动已创建的服务
docker compose -f docker-compose.dev.yml start

# 重建 PostgreSQL 镜像
docker compose -f docker-compose.dev.yml build postgres
```

不要在日常停止时使用 `down -v`，因为它会删除 PostgreSQL 和 Redis 的开发数据卷。只有明确需要重置本地数据时才执行：

```bash
docker compose -f docker-compose.dev.yml down -v
```

## 5. 应用环境变量

建议从 `.env.example` 创建本地环境文件：

```bash
cp .env.example .env.local
cp .env.example apps/web/.env.local
```

collaboration、数据库脚本和其他宿主机进程读取仓库根目录的 `.env.local`；Next.js 以 `apps/web` 为工作目录，因此读取 `apps/web/.env.local`。两份文件中的数据库地址和 `NEXT_PUBLIC_*` 开发配置必须保持一致。修改后需要重启 `pnpm dev`。

最小配置如下：

```env
DATABASE_URL=postgresql://seek:seek_dev_password@127.0.0.1:5432/seek
REDIS_URL=redis://127.0.0.1:6379

COLLABORATION_PORT=1234
NEXT_PUBLIC_COLLABORATION_PORT=1234
NEXT_PUBLIC_SEEK_DEV_HOST=192.168.1.20

STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=./.data/attachments

AI_ENABLED=false
MCP_ENABLED=false
```

端口被本机其他服务占用时，可通过环境变量修改 Compose 端口：

```bash
POSTGRES_PORT=55432 REDIS_PORT=56379 \
  docker compose -f docker-compose.dev.yml up -d
```

此时应用连接字符串也要改为对应端口。

## 6. Monorepo 开发命令

安装依赖：

```bash
pnpm install
```

数据库迁移和启动应用：

```bash
pnpm db:migrate
pnpm dev
```

建议根目录统一提供以下脚本：

```text
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm db:migrate
pnpm db:seed
```

三个应用进程的职责保持独立：

| 进程 | 本地启动职责 |
|---|---|
| `web` | Next.js 页面、REST API、认证、普通业务逻辑 |
| `collaboration` | Hocuspocus WebSocket、Yjs 房间和协作状态持久化 |
| `worker` | BullMQ 投影、快照、搜索索引、Embedding、导入导出 |

`NEXT_PUBLIC_SEEK_DEV_HOST` 必须填写开发机当前的局域网 IPv4 地址，Next.js 使用它精确放行该地址下的开发 chunk/HMR；`127.0.0.1` 和 `::1` 会独立放行。协作客户端默认使用页面当前 hostname 加 `NEXT_PUBLIC_COLLABORATION_PORT`，所以 localhost、`127.0.0.1` 和局域网 IP 三种入口各自连接同名主机的 1234 端口。网络变化导致开发机 IP 改变时，需要更新 `NEXT_PUBLIC_SEEK_DEV_HOST` 并重启 `pnpm dev`。仍可使用 `NEXT_PUBLIC_COLLABORATION_URL` 显式覆盖协作地址。完整的网络约定、加载链路、状态机、持久化规则和多人验收步骤见 [实时协作开发与联调约定](./collaboration-development.md)。

## 7. 推荐开发顺序

先完成 Phase 0 垂直切片，再扩展业务模块：

1. Drizzle schema、迁移和数据库连接；
2. BlockNote client-only 编辑器；
3. Hocuspocus + Yjs 两人协作；
4. PostgreSQL 保存 Y.Doc；
5. Block JSON、Markdown、Plain Text 幂等投影；
6. 断网重连、服务重启恢复和版本恢复；
7. Viewer 权限和 WebSocket 写入拦截；
8. Markdown 往返测试语料库。

业务 MVP 再加入认证、工作区、项目、Space、ACL、评论、附件和全文搜索。AI、pgvector 语义搜索、MCP 和 Excalidraw 按后续阶段加入。

## 8. 本地数据与安全边界

- Redis 不是业务真源，所有不可重建数据必须写入 PostgreSQL；
- `.data/attachments` 只用于本地开发，不提交 Git；
- `.env.local` 不提交 Git；
- 开发密码只用于本机，生产环境必须替换；
- Markdown、HTML、Mermaid 和附件仍按不可信输入处理；
- 所有页面、搜索、AI、MCP、附件和协作入口都必须复用 `PermissionService`；
- 生产镜像不要使用 `latest`，应固定 PostgreSQL、PGroonga、pgvector 和 Redis 版本或 digest。

## 9. 故障排查

### Docker permission denied

确认 `id` 输出包含 `docker`。如果没有，重新登录；不要通过给 Docker socket 开放全局写权限来规避问题。

### 扩展不存在

确认使用了 `up -d --build`，并检查：

```bash
docker compose -f docker-compose.dev.yml logs postgres
docker compose -f docker-compose.dev.yml exec postgres \
  psql -U seek -d seek -c "SELECT name, default_version FROM pg_available_extensions WHERE name IN ('pg_trgm', 'vector', 'pgroonga');"
```

如果数据卷已经存在，新增的初始化 SQL 不会再次执行。扩展应通过迁移显式声明，或在确认无数据后重建开发卷。

### 端口冲突

使用 `POSTGRES_PORT` 或 `REDIS_PORT` 修改宿主机端口；容器内部端口仍保持 5432 和 6379。

### Redis 数据需要重置

停止 Compose 后删除 Redis 数据卷；不要误删 PostgreSQL 卷：

```bash
docker volume ls --filter name=seek-dev
docker volume rm seek-dev_seek_redisdata
```
