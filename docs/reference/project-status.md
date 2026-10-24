---
title: "项目状态"
status: planning
audience: "所有规划参与者"
owner: UNSPECIFIED
last_reviewed: 2026-08-28
source_of_truth: true
language: zh-CN
---

# 项目状态

## 当前状态

Yance 已进入 **implementation prototype**。当前存在可运行的 Electron + Node.js Server Core 原型以及自动化测试，但仍没有正式安装发行版、受支持版本或冻结公开 API。`old/` 仅是 archive。

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| 产品与架构规划 | PLANNING | [文档首页](../README.md) |
| 契约草案 | PROPOSED | [契约索引](contracts/proposed/README.md) |
| Server Core | PROTOTYPE | `src/main/`、`electron/` |
| MCP Registry / Connector Runtime | PROTOTYPE | [Connector Runtime](../connectors/connector-runtime.md) |
| SQLite Registry / Database Explorer | PROTOTYPE | `src/main/database.ts`、`src/renderer/` |
| 自动化实现测试 | PASSING | `npm test` |
| 连接器兼容性 | UNTESTED | [兼容性文档](../connectors/compatibility.md) |
| 测试计划 | PROPOSED | [测试计划](../validation/test-plan.md) |
| 正式安装包和受支持运行时 | NOT RELEASED | 尚未建立发布政策与平台支持矩阵 |

## UNSPECIFIED

owner、License、最低受支持系统版本、正式 API、首个真实 connector、长期数据库方案、模型、Release policy、安全响应 SLA，以及任何尚未在[决策记录](decisions-and-open-questions.md)中确认的承诺。原型 Registry 的 SQLite 选择不自动升级为长期数据库承诺。
