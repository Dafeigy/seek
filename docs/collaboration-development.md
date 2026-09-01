# Seek 实时协作开发与联调约定

> 文档状态：Phase 1 开发基线  
> 适用范围：BlockNote、Yjs、Hocuspocus、PostgreSQL，以及开发环境多人联调  
> 暂不包含：RBAC/ACL、生产 HTTPS 和生产反向代理的具体配置

## 1. 目标与已确认决策

Seek 使用 BlockNote + Yjs + Hocuspocus 实现实时协作。开发阶段必须支持同一局域网内的多台设备访问同一台开发机，验证实时编辑、断线重连和服务重启恢复。

已确认的网络方案：

- 开发环境直接暴露两个端口：Next.js 使用 `3000`，Hocuspocus 使用 `1234`；
- 浏览器通过开发机 IP 访问，例如 `http://192.168.1.20:3000`；
- WebSocket 地址必须在浏览器运行时使用当前页面的 hostname 生成，例如 `ws://192.168.1.20:1234`；
- 不把 `localhost`、固定 IP 或某台开发机的地址写入前端构建产物；
- 生产部署再使用 Nginx/Caddy 将 `/collaboration` 反向代理到 Hocuspocus；
- 当前没有 HTTPS，开发环境使用 `http://` + `ws://`。

局域网 HTTP 和 WebSocket 都是明文传输，只适用于受信、隔离的开发网络。不得把开发端口直接暴露到公网。

浏览器只把 localhost 视为 HTTP 下的特殊可信环境，普通局域网 IP 不属于 secure context。客户端功能不得依赖仅在 secure context 可用的 API；普通业务 ID 使用不依赖 Web Crypto 的生成器，真正的 token、密钥和安全随机数必须在服务端生成。

## 2. 开发环境拓扑

```text
开发机 192.168.1.20
├── Next.js Web/API      0.0.0.0:3000
├── Hocuspocus WebSocket 0.0.0.0:1234
├── PostgreSQL           127.0.0.1:5432
└── Redis                127.0.0.1:6379

设备 A ── http://192.168.1.20:3000 ─┐
设备 B ── http://192.168.1.20:3000 ─┼─ 同一文档 ID / 同一 Yjs 房间
设备 C ── http://192.168.1.20:3000 ─┘

所有设备 ── ws://192.168.1.20:1234 ── Hocuspocus
```

多人协作成立的必要条件：

- 所有客户端访问同一个开发机 IP；
- 所有客户端打开完全相同的文档 ID；
- Web 和 collaboration 进程都监听 `0.0.0.0`；
- 开发机防火墙允许受信局域网访问 TCP `3000` 和 `1234`；
- 无线路由器没有启用 AP/client isolation；
- collaboration 和 Web API 使用同一个 PostgreSQL 数据库。

## 3. 开发环境配置

目标环境变量为：

```env
COLLABORATION_PORT=1234
NEXT_PUBLIC_COLLABORATION_PORT=1234
NEXT_PUBLIC_SEEK_DEV_HOST=192.168.1.20
```

前端不应在开发环境依赖如下固定地址：

```env
# 不推荐：其他设备会连接它们自己的 localhost
NEXT_PUBLIC_COLLABORATION_URL=ws://localhost:1234
```

建议在浏览器运行时构造地址：

```typescript
export function getDevelopmentCollaborationUrl(): string {
  const url = new URL(window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.port = process.env.NEXT_PUBLIC_COLLABORATION_PORT ?? "1234";
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}
```

示例结果：

| 页面地址 | WebSocket 地址 |
|---|---|
| `http://localhost:3000` | `ws://localhost:1234/` |
| `http://127.0.0.1:3000` | `ws://127.0.0.1:1234/` |
| `http://192.168.1.20:3000` | `ws://192.168.1.20:1234/` |

当前代码优先支持上述端口配置和运行时解析，同时保留 `NEXT_PUBLIC_COLLABORATION_URL` 显式覆盖能力。为了兼容旧的 loopback 配置，仅当页面通过局域网 IP 打开时，前端才把显式 URL 中的 `localhost`、`127.0.0.1`、`::1` 或 `0.0.0.0` 替换为当前页面主机。页面从 localhost 或 `127.0.0.1` 打开时保留各自的 loopback 地址，避免依赖可能已经变化的局域网 IP。显式配置的非 loopback 协作主机保持不变。

Next.js 始终将 `127.0.0.1`、`::1` 加入开发源白名单，并将 `NEXT_PUBLIC_SEEK_DEV_HOST` 精确加入 `allowedDevOrigins`。如果开发服务器仍提示跨源开发资源被阻止，先确认浏览器地址与该变量一致，然后重启 Next.js。只允许明确的开发地址，不配置无约束通配符。

## 4. 文档打开的目标链路

### 4.1 Bootstrap

打开文档时只发起一次文档 bootstrap 请求，返回：

- 文档 ID、标题、项目等元数据；
- PostgreSQL 中的内容快照和内容版本；
- collaboration 是否启用及其运行时配置；
- 后续接入权限后再附加短期协作 token 和 capabilities。

页面头部和编辑器不得分别请求同一个完整文档接口。

### 4.2 本地恢复与 Y.Doc

目标实现中，BlockNote 从创建到销毁始终绑定同一个 `Y.Doc`：

1. 创建 `Y.Doc`；
2. 从 Yjs IndexedDB 恢复该用户、工作区、文档对应的本地 updates；
3. 如果文档尚未迁移到 Y.Doc，使用服务器快照执行一次受控初始化；
4. 创建 BlockNote 并展示本地内容；
5. 后台连接 Hocuspocus；
6. Yjs 使用 CRDT updates 与服务器合并；
7. 连接失败时保留本地编辑能力并继续重试。

不要在“本地 BlockNote 编辑器”和“协作 BlockNote 编辑器”之间反复重建实例，也不要通过客户端版本号或浏览器时间判断哪一份完整快照覆盖另一份。

现有 `block_json` 到 Y.Doc 的首次迁移必须是单写者操作。不能让两个同时打开空 Y.Doc 的客户端各自插入同一份 Block JSON，否则 CRDT 合并后可能产生重复内容。迁移过程需要数据库标记、事务锁或服务端初始化来保证幂等。

### 4.3 连接和同步

Provider 必须在事件监听器注册完成后再开始连接，或者在注册后检查当前同步状态，避免丢失快速完成的事件。

Provider 的销毁还必须兼容 React 开发模式的 effect setup/cleanup 重放。不能在第一次开发检查的 cleanup 中同步永久销毁一个随后会被复用的 Provider；当前实现延迟到下一个 macrotask 销毁，并在同一 Provider 立即重新 setup 时取消销毁。真正离开文档或切换 Provider 时仍会完成清理。

建议的状态机：

```text
idle
  ↓
connecting ── WebSocket TCP/HTTP Upgrade
  ↓
authenticating
  ↓
loading ───── Hocuspocus onLoadDocument / PostgreSQL
  ↓
syncing ───── Yjs sync step 1/2
  ↓
connected
  │
  ├─ 短暂断线 → retrying → connected
  └─ 浏览器离线 → offline → retrying → connected

不可恢复错误 → failed
```

首次连接超过 5 秒可以改变提示，但不能永久销毁 Provider。网络恢复后必须自动重连。只有明确关闭文档、切换文档或不可恢复错误时才销毁 Provider。

UI 至少区分：

- `协作连接中`；
- `正在同步文档`；
- `协作已连接`；
- `离线编辑，等待重连`；
- `协作连接失败，正在重试`；
- `协作不可用，本地更改尚未上传`。

不要把所有非 connected 状态统一显示为“协作连接中”，也不要把连接失败静默描述成正常的“本地编辑模式”。

## 5. 服务端房间生命周期

每个文档 ID 对应一个 Hocuspocus/Yjs 房间。服务端生命周期为：

```text
WebSocket Upgrade
  → authenticate
  → 校验文档存在
  → onLoadDocument
  → 从 documents.ydoc_state 恢复 Y.Doc
  → 与客户端同步
  → 接收 Yjs updates
  → debounce 后 onStoreDocument
  → 写入 documents.ydoc_state
```

实现注意事项：

- `onLoadDocument` 只加载已有文档，不得因为任意房间连接而创建业务文档；
- 不存在的文档应拒绝连接或返回明确错误；
- PostgreSQL 查询只选择协作所需字段；
- `ydoc_state` 为空时返回新的空 `Y.Doc`，但内容初始化必须遵守单写者迁移规则；
- `onStoreDocument` 写入完整 `Y.encodeStateAsUpdate(document)`；
- Hocuspocus 的 debounce 是持久化延迟，不是实时协作延迟；客户端之间的 update 不应等待 PostgreSQL；
- 服务关闭前应有优雅退出策略，尽可能完成待持久化房间的写入；
- 房间空闲后应释放内存；
- Phase 1 接入权限后，认证和只读写入限制必须发生在 collaboration 服务端。

当前实现的 debounce 为 5 秒、max debounce 为 120 秒。因此持久化测试必须在最后一次编辑后等待至少 5 秒，持续输入测试还要验证最长 120 秒强制写入。

## 6. 内容真源与持久化

各种内容表达的职责：

| 表达 | 职责 |
|---|---|
| Y.Doc / `ydoc_state` | 实时协作、CRDT 合并和协作恢复的权威状态 |
| Block JSON | API、静态渲染和版本快照使用的结构化投影 |
| Markdown | 导入导出、AI、MCP 和 Git 互操作投影 |
| Plain Text | 搜索、摘要和文本处理投影 |
| IndexedDB Yjs updates | 当前设备离线编辑与快速恢复副本 |

Block JSON、Markdown 和 Plain Text 可以有独立版本，但不能反向覆盖一个已经包含远端更新的 Y.Doc。投影失败应重试或重建，不应回滚协作状态。

本地缓存必须至少按用户、工作区和文档隔离。不得继续只使用文档 ID 作为共享浏览器缓存 key。退出登录、失去访问权限或删除工作区时应清理对应缓存；完整安全规则在接入 RBAC/ACL 时补充。

## 7. 可观测性

没有分段耗时就无法区分“协作慢”和“连接失败”。前端至少记录以下时间点：

```text
document_bootstrap_started
document_bootstrap_finished
local_ydoc_hydrated
editor_created
ws_connecting
ws_open
collaboration_authenticated
remote_document_loaded
yjs_synced
editor_editable
ws_closed / ws_error / authentication_failed
```

collaboration 服务记录：

```text
connection_id
document_id
remote_address
origin
authenticate_duration_ms
load_document_duration_ms
ydoc_bytes
first_sync_ready_ms
store_document_duration_ms
close_code
```

日志不得包含协作 token、完整 Y.Doc、文档正文或其他凭证。

开发环境参考目标：

- 局域网 WebSocket open P95 小于 500ms；
- 已存在房间首次 Yjs sync P95 小于 1s，超大文档另设基线；
- 正常连接失败应在 UI 中明确显示原因，不能只等待固定超时；
- 客户端间编辑传播不依赖 5 秒持久化 debounce。

## 8. 多人协作验收

### 8.1 启动与可达性

在开发机启动基础设施、迁移和应用：

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate
pnpm dev
```

确认端口监听：

```bash
ss -ltnp | rg ':(3000|1234)\b'
```

在第二台设备上访问：

```text
http://<开发机-IP>:3000
```

浏览器 Network 面板中必须看到连接到：

```text
ws://<开发机-IP>:1234
```

不能出现 `ws://localhost:1234`。

### 8.2 实时编辑

1. 两台设备打开完全相同的文档 URL；
2. 两边均显示“协作已连接”；
3. A 连续输入，B 应实时看到相同内容；
4. B 在同一段落编辑，A 应收到更新且内容不重复；
5. 同时创建、删除和移动 Block，确认最终结构一致；
6. 验证 Awareness 中的用户名、颜色和光标不会互相覆盖。

### 8.3 断线与重连

1. 断开 A 的网络；
2. A 继续编辑，状态显示离线但内容保留；
3. B 在线继续编辑；
4. 恢复 A 网络；
5. A 自动重连，不刷新页面；
6. 两边最终内容一致，且没有整篇覆盖、内容重复或丢失。

### 8.4 持久化与重启

1. 完成编辑后等待至少 5 秒；
2. 检查 `documents.ydoc_state` 不为 `NULL`；
3. 关闭两个客户端；
4. 重启 collaboration 服务；
5. 清除某个测试客户端的本地协作缓存，或使用新的浏览器环境；
6. 重新打开文档，确认内容从 PostgreSQL 恢复；
7. 验证 Block JSON、Markdown、Plain Text 投影与当前文档一致。

### 8.5 最低验收矩阵

| 场景 | 预期结果 |
|---|---|
| 两个浏览器窗口 | 实时同步 |
| 两台局域网设备 | 通过开发机 IP 实时同步 |
| 首次打开无 `ydoc_state` 文档 | 只初始化一次，无重复 Block |
| collaboration 尚未启动 | 可识别的错误与自动重试，不永久降级 |
| collaboration 重启 | 页面无需刷新即可重连 |
| 客户端短暂离线 | 本地更改在恢复后合并 |
| PostgreSQL 暂时不可用 | 房间加载/持久化错误可观察，不伪装成连接中 |
| 最后一个客户端退出后重开 | 从 PG 恢复完整内容 |

## 9. 故障排查

| 现象 | 优先检查 |
|---|---|
| 约 5 秒后显示“协作连接失败，正在重试” | 检查实际 WebSocket URL、1234 可达性和 collaboration 日志；Provider 会继续重试 |
| 开发机自己正常，其他设备失败 | 前端是否仍使用 localhost；防火墙；服务是否监听 0.0.0.0；路由器客户端隔离 |
| WebSocket 一直 pending | Hocuspocus 未启动、端口错误、Upgrade 被代理拦截或网络不可达 |
| WebSocket open 但不 synced | authenticate、onLoadDocument、PG 查询错误；检查分段日志 |
| 刷新后内容丢失 | `ydoc_state` 未写入、未等待 debounce、服务退出前未持久化 |
| 内容实时同步但 `ydoc_state` 为 NULL | `onStoreDocument` 未触发或写入失败 |
| 首次协作出现重复内容 | 多个客户端同时把 Block JSON 初始化到空 Y.Doc |
| 页面标题存在但协作内容为空 | metadata/Block JSON 与 Y.Doc 尚未迁移或不同步 |
| 使用 IP 时 Next.js chunk/HMR 被阻止 | 将该 IP 写入 `NEXT_PUBLIC_SEEK_DEV_HOST` 并重启 Next.js |
| 服务端显示已连接/已认证，开发页面仍持续重试 | 检查 Provider 是否被 React 开发模式的 effect cleanup 提前销毁 |
| IP 下新建文档报 Web Crypto API 不可用 | 检查客户端是否使用 `crypto.randomUUID`/`crypto.subtle`；普通 ID 使用兼容 HTTP IP 的生成器 |
| 页面是 HTTPS、协作使用 ws:// | 浏览器 mixed-content 拒绝；生产必须改用 wss:// |

## 10. 当前实现差距与实施顺序

当前实现已具备 BlockNote、Hocuspocus Provider、Y.Doc、PostgreSQL `ydoc_state` 加载和 debounce 持久化，但仍有以下差距：

1. 页面头部和编辑器重复加载文档；
2. 本地缓存使用 localStorage 快照，而不是 Yjs IndexedDB updates；
3. 首次 `synced` 前编辑器被锁定；
4. `onLoadDocument` 会为任意房间名创建业务文档；
5. `block_json` 和 `ydoc_state` 是两条独立写入链路，缺少统一迁移和版本语义；
6. 缺少连接、认证、加载、同步和存储的分段日志；
7. 缺少局域网双设备、断线重连和服务重启的自动化验收。

推荐实施顺序：

1. 补齐连接分段耗时和服务端结构化日志；
2. 移除 `onLoadDocument` 的隐式文档创建；
3. 合并文档 bootstrap 请求；
4. 引入单一 Y.Doc 生命周期和 IndexedDB 本地持久化；
5. 设计并执行已有 Block JSON 到 Y.Doc 的幂等迁移；
6. 收敛投影、版本和持久化语义；
7. 补齐验收矩阵和自动化测试；
8. 接入 RBAC/ACL 后替换 demo token，并验证 Viewer 无法提交更新。
