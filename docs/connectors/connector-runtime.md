---
title: "Connector Runtime 原型"
status: prototype
audience: "连接器、运行时与安全评审者"
owner: UNSPECIFIED
last_reviewed: 2026-08-28
source_of_truth: true
language: zh-CN
---

# Connector Runtime 原型

## 1. 已实现边界

Yance Server Core 现在实现了第一版 MCP → Connector 运行时。核心约束是：**任何注册到 Yance 的 MCP 都必须拥有且只能拥有一个直接关联的 Connector；即使 MCP 本身已经可以直接调用，也不能绕过 Connector 成为大脑接口。**

当前代码位于：

- `src/main/database.ts`：SQLite Schema 与 Database Explorer 基础；
- `src/main/registry.ts`：MCP、Connector、Tool、Capability、Polling Job 与 Event Registry；
- `src/main/mcp-runtime.ts`：真实 MCP Client；
- `src/main/connector-runtime.ts`：passthrough / Node.js Adapter 与 Capability 调用入口；
- `src/main/polling-scheduler.ts`：轮询调度；
- `electron/`：Electron 主进程和 IPC；
- `src/renderer/`：本地管理 UI。

## 2. 当前数据路径

```text
MCP Server
    │
    │ stdio / Streamable HTTP / SSE
    ▼
MCP Runtime
    │
    ▼
Connector Runtime
    ├─ passthrough
    └─ user-defined Node.js Adapter
    │
    ▼
Capability Mapping
    │
    ├─ conversation.read
    ├─ message.search
    └─ future capabilities
    │
    ▼
Yance Brain（后续）
```

MCP Runtime 负责协议连接和原始 tool 调用。Connector Runtime 负责把具体 MCP 变成 Yance 可消费的稳定入口。未来 Brain 不应持有 MCP command、URL 或具体 tool name。

## 3. MCP 注册

当前支持三种 transport：

- `stdio`；
- `streamable-http`；
- `sse`，仅为兼容仍使用旧 transport 的 MCP。

注册 MCP 时，Registry 在同一个数据库事务中同时创建：

1. `mcp_servers` 记录；
2. 唯一关联的 `connectors` 记录。

删除 MCP 时，SQLite foreign key 会级联删除 Connector、Tool、Capability Mapping 与 Polling Job。

## 4. Tool Discovery

Yance 使用官方 MCP SDK 建立真实连接并调用 `tools/list`。发现的 tool 保存到 `mcp_tools`，包括：

- tool name；
- description；
- input schema；
- annotations；
- discovery time。

协议连通和 tool discovery 只证明 MCP 能被调用，不证明该 tool 已经满足某个 Yance Capability 的语义要求。

## 5. Connector Adapter

### 5.1 passthrough

默认 Connector 使用 `passthrough`。Capability Mapping 指定：

```text
Yance Capability → MCP Tool
```

例如：

```text
conversation.read → get_chat_history
```

Connector Runtime 收到 `conversation.read` 后再调用映射的具体 MCP tool。

### 5.2 node-module

需要补齐平台特殊逻辑时，可把 Connector 切换成用户定义的 Node.js module。入口文件默认导出对象，可实现：

```js
export default {
  async invoke(request, context) {},
  async poll({ job }, context) {}
}
```

`context` 当前只主动提供：

- 当前 Connector 元数据；
- `callTool(toolName, args)`：调用该 Connector 自己关联 MCP 的 tool；
- `emit(type, payload)`：写入 Yance Event Stream。

仓库中的最小示例见 `examples/connectors/passthrough-with-hooks.mjs`。

**安全边界：** 当前 prototype 中 Node Adapter 是用户明确配置的本地可信代码，并以 Yance 当前用户权限运行，尚未沙箱化。它不同于未来由 AI 生成的候选脚本。未知来源 Adapter 不应直接启用；正式发行前仍需设计签名、权限、沙箱和供应链策略。

## 6. Polling 作为事件缺失时的兜底

MCP 不需要为了 Yance 强制实现实时推送。如果连接器没有事件订阅，可建立 `tool-poll` Job：

```text
每 N ms
  → Connector Runtime
  → Adapter.poll（若存在）
  → 否则直接调用指定 MCP Tool
  → 结果计算 SHA-256
  → 写入 events
```

UI 默认建议 `5000 ms`，数据库当前最低允许 `1000 ms`。这只是原型调度能力，不代表所有平台都适合 1 秒轮询；真实 Connector 应根据平台成本、账号风险和增量 cursor 决定频率。

如果未来某 Connector 能提供 webhook、数据库 watcher、文件系统 watcher、Accessibility observer 或其他 push/event 机制，可在 Adapter 内替换轮询，而不改变 Brain Capability。

## 7. SQLite Registry

当前普通 SQLite 文件包含：

| Table | 用途 |
| --- | --- |
| `mcp_servers` | MCP transport 和连接配置 |
| `connectors` | MCP 对应的 Connector 与 Adapter 配置 |
| `mcp_tools` | 实际发现的 MCP tools |
| `capability_mappings` | Yance Capability → MCP Tool |
| `sync_jobs` | Connector polling jobs |
| `events` | tool discovery、poll result/error 和 Adapter 事件 |
| `schema_migrations` | Schema migration 版本 |

Electron UI 的 Database 页面直接读取这些真实表，便于当前开发阶段观察和调试。数据库没有应用层加密。

**明文可见不等于凭据策略已完成。** 当前 prototype 不应被当作安全的 secret vault。正式版本需要把 Cookie、token、API key、Keychain/Windows Credential Manager 等凭据与可浏览业务 Registry 分离。

## 8. 已验证行为

自动测试当前验证：

1. 注册一个 MCP 会自动且只创建一个 Connector；
2. Tool、Capability Mapping 和 Polling Job 会进入 SQLite；
3. 删除 MCP 会级联删除关联 Connector；
4. Yance 能启动真实 stdio 测试 MCP 并发现 tool；
5. passthrough Connector 能通过 Capability Mapping 调用 MCP；
6. 用户 Node.js Adapter 能拦截 Capability 调用并调用关联 MCP；
7. Polling Job 能通过 Connector 执行并写入 hash 与 Event。

运行：

```bash
npm run typecheck
npm test
npm run build
```

这些测试只证明 Server Core 原型行为，不证明真实微信、小红书、闲鱼等 Connector 的兼容性或安全性。
