# Seek Phase 1 开发基线

> 文档状态：Approved baseline
> 更新日期：2026-09-01
> 适用范围：Phase 1 业务 MVP 与 Phase 1.0 协作底座收敛

## 1. Phase 1 边界

Phase 1 提供一个可在私有部署中使用的协作知识库：

- 邮箱密码登录、首位 Owner 初始化和邀请制成员加入；
- 单 Workspace 产品界面，数据模型保留多 Workspace 隔离能力；
- `Workspace → Project → Document Tree` 三层内容结构，不引入 Space 或 Folder；
- Project 角色、父文档继承和成员级 Document ACL；
- BlockNote + Yjs + Hocuspocus 实时协作和 Block 编辑租约；
- 实时草稿自动保存、手动发布版本和版本恢复；
- 评论、附件、Markdown 导入导出和生产 Docker Compose。

Phase 1 不实现标题搜索、全文搜索、语义搜索、AI 或 MCP；搜索整体移到 Phase 2。

## 2. 开发顺序

### Phase 1.0：协作底座收敛

- 只允许已存在且有权访问的文档创建协作房间；
- 合并文档 bootstrap 请求；
- 每次打开文档只创建一个 Y.Doc，引入 Yjs IndexedDB 本地 updates；
- 完成旧 Block JSON 到 Y.Doc 的幂等、单写者迁移；
- 由协作状态统一驱动 Block JSON、Markdown 和 Plain Text 投影；
- 增加协作分段日志、健康状态和自动化验收。

### Phase 1.1：身份与 Workspace

- Better Auth 邮箱密码登录；
- 首次启动创建 Workspace Owner；
- 关闭公开注册，后续用户通过邀请加入；
- 未配置邮件服务时，管理员可复制邀请链接；
- Session、退出登录和本地协作缓存隔离。

### Phase 1.2：Project 与 Document Tree

- Project 和 Project Member 管理；
- 根文档、子文档、同级排序和拖拽；
- 同 Project 移动与跨 Project 复制；
- Workspace、Project 和 Document 软删除及 30 天恢复期。

### Phase 1.3：权限与 Block 租约

- 统一 PermissionService 和权限矩阵测试；
- REST、页面、附件、评论、版本和 WebSocket 共用授权结果；
- 短期 WebSocket Token，Viewer 服务端只读；
- Document/Block 级服务端租约，60 秒无编辑活动自动释放；
- 失焦、离开文档和断开连接时提前释放租约。

### Phase 1.4：发布、评论与附件

- 自动保存只更新实时草稿；
- 用户点击“发布”时生成不可变版本；
- 恢复版本只更新草稿，不自动发布；
- Block/选区评论线程、解决和重新打开；
- 本地持久卷附件、图片粘贴上传和权限下载。

### Phase 1.5：互操作与部署

- Markdown 单文档导入导出；
- 附件 ZIP 导出和不可表达 Block 的可恢复降级；
- 生产 Docker Compose、反向代理、健康检查、迁移和备份恢复；
- Phase 1 安全、权限、多人和恢复验收。

## 3. 发布与实时草稿

- `documents` 的当前 Y.Doc 是实时草稿真源；
- 5 秒空闲保存和 120 秒最长保存只持久化草稿；
- 草稿保存不增加发布版本号；
- 发布在事务中对当前 Y.Doc、Block JSON、Markdown 和 Plain Text 生成不可变快照；
- 发布前必须等待对应内容投影完成，或在发布事务中同步生成投影；
- 所有有 `document:read` 权限的用户读取当前草稿；发布仅表示版本检查点；
- 恢复历史版本后，该内容成为新的当前草稿，需再次发布才会得到新版本号。

## 4. Block 编辑租约

租约由服务端决定唯一持有者，Awareness 只用于向各客户端广播持有者和活动状态。

```text
key          document_id + block_id
holder       user_id + connection_id
acquired_at  首次获取时间
active_at    最后一次有效编辑或续租时间
expires_at   active_at + 60s
```

规则：

1. 光标进入 Block 时申请租约；未获得租约前不提交该 Block 的本地编辑事务。
2. 只有内容变更或有效的显式续租才更新 `active_at`；单纯保持光标不得无限续租。
3. 连续 60 秒没有活动时，服务端删除租约并广播释放；原持有者客户端收到事件后退出该 Block 的编辑状态。
4. 失焦、切换 Block、离开页面和 WebSocket 断开会尝试立即释放；服务端超时不依赖客户端正常关闭。
5. 断线编辑时不能获得新的服务端租约；已在编辑的本地内容由 Yjs 保留，重连后合并并向用户显示冲突风险。
6. Viewer 和其他没有 `document:update` 权限的用户不得获取租约。

Phase 1 保证官方客户端中的正常用户不会同时编辑同一 Block。对篡改客户端所发 Yjs 二进制更新的 Block 级内容审计不属于 Phase 1；文档级写权限仍必须由 Hocuspocus 服务端强制。

## 5. 开发测试账号

以下账号仅由显式的开发 seed 命令创建。生产迁移和生产启动流程不得创建这些账号。

| 显示名 | 登录邮箱 | 开发密码 | Workspace 角色 | 用途 |
|---|---|---|---|---|
| 测试 Owner | `owner@seek.local` | `SeekDev-Owner-2026!` | Owner | 全局管理和恢复 |
| 测试 Admin | `admin@seek.local` | `SeekDev-Admin-2026!` | Admin | Admin 读取豁免和成员管理 |
| 平台编辑 | `platform.editor@seek.local` | `SeekDev-Platform-2026!` | Member | 平台项目编辑与发布 |
| 算法编辑 | `algorithm.editor@seek.local` | `SeekDev-Algorithm-2026!` | Member | 算法项目编辑与跨项目隔离 |
| 评论者 | `commenter@seek.local` | `SeekDev-Comment-2026!` | Member | 评论权限与 Block 租约拒绝 |
| 查看者 | `viewer@seek.local` | `SeekDev-Viewer-2026!` | Member | 页面、API 和 WebSocket 只读 |
| 访客 | `guest@seek.local` | `SeekDev-Guest-2026!` | Guest | 最小可见范围与 ACL 扩大 |

开发 UI 和日志不得显示密码。密码只保留在本文档和开发 seed 输入中，数据库仅保存 Better Auth 产生的密码哈希。

## 6. 测试项目权限

Seed 创建三个 Project：`平台基础设施`、`算法研究`和 `客户端`。

| 账号 | 平台基础设施 | 算法研究 | 客户端 |
|---|---|---|---|
| Owner | Project Admin | Project Admin | Project Admin |
| Admin | Project Admin | Project Admin | Viewer（Admin 仍可全局读） |
| 平台编辑 | Editor | Viewer | 无成员资格 |
| 算法编辑 | Viewer | Editor | 无成员资格 |
| 评论者 | Commenter | 无成员资格 | 无成员资格 |
| 查看者 | Viewer | 无成员资格 | 无成员资格 |
| 访客 | 无成员资格 | Viewer | 无成员资格 |

项目角色基础权限：

| 操作 | Project Admin | Editor | Commenter | Viewer |
|---|:---:|:---:|:---:|:---:|
| `document:read` | ✓ | ✓ | ✓ | ✓ |
| `document:comment` | ✓ | ✓ | ✓ | — |
| `document:update` | ✓ | ✓ | — | — |
| `document:publish` | ✓ | ✓ | — | — |
| `document:share` | ✓ | — | — | — |
| `document:move` | ✓ | ✓ | — | — |
| `document:delete` | ✓ | — | — | — |
| `document:restore` | ✓ | — | — | — |
| `document:history` | ✓ | ✓ | ✓ | ✓ |

Seed 另创建用于 ACL 测试的文档：

- `平台基础设施 / 生产密钥轮换`：对“查看者”显式 deny `document:read`，验证父级 Viewer 权限被收紧；
- `算法研究 / 外部评审草案`：对“访客”显式 allow `document:comment`，验证页面 ACL 在 Workspace 成员和 Project Viewer 边界内扩大权限；
- `平台基础设施 / 协作锁测试`：平台编辑和 Owner 用于同 Block 租约、60 秒超时和不同 Block 并行编辑测试。

## 7. Phase 1 最低验收条件

- 未登录用户不能从页面、API、WebSocket 或附件地址获取文档信息；
- 测试账号的 Project 角色和 Document ACL 与本文档矩阵一致；
- Viewer 即使直接构造 Yjs 写更新也不能修改文档；
- 两名 Editor 可在不同 Block 并行编辑并实时看到对方变更；
- 同一 Block 只授予一名持有者，60 秒无活动后另一名 Editor 可接管；
- 断线编辑和重连后不丢失、不重复整篇文档；
- 自动保存不产生版本，只有发布会增加版本号；
- 恢复一个版本会更新当前草稿，不删除原有版本，也不自动发布；
- 文档树拖拽不产生环、不丢节点，移动后按新父级重新计算权限；
- 评论、附件、Markdown 导入导出和版本历史不泄漏无权限内容；
- 不连接外部网络且不配置 AI 时，生产 Docker Compose 可启动并通过健康检查。
