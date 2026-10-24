---
title: "测试计划"
status: proposed
audience: "验证与安全评审者"
owner: UNSPECIFIED
last_reviewed: 2026-08-28
source_of_truth: true
language: zh-CN
---

# 测试计划

本计划是 **PROPOSED**，不表示 M0 或任何产品里程碑已完成。

| ID | Fixture | 前置条件 | 步骤 | Oracle | 预期 | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DOC-001 | `docs/**/*.md` | Python 3 | 运行 `python3 scripts/docs_qa.py` | 退出码 | 0 | AUTOMATED | CI artifact |
| CON-001 | 合成 capability manifest | Schema 可解析 | 验证 valid/invalid fixture | JSON Schema 子集验证器 | valid 接受、invalid 拒绝 | AUTOMATED | CI log |
| RUNTIME-001 | in-memory SQLite | Node.js | 注册 MCP | Registry 查询 | 自动且只创建一个 Connector | AUTOMATED | `src/main/registry.test.ts` |
| RUNTIME-002 | 本地 synthetic stdio MCP | Node.js | connect → tools/list | MCP SDK 返回 + SQLite | 发现并保存两个测试 tool | AUTOMATED | `src/main/mcp-runtime.test.ts` |
| RUNTIME-003 | Capability Mapping | synthetic stdio MCP | 通过 Connector 调用 Capability | 返回内容 | passthrough 与 Node Adapter 均成功 | AUTOMATED | `src/main/mcp-runtime.test.ts` |
| RUNTIME-004 | tool-poll Job | synthetic stdio MCP | 执行 polling | Event + SHA-256 | 结果写入 Event 且保存 payload hash | AUTOMATED | `src/main/mcp-runtime.test.ts` |
| SEND-001 | 合成 approval payload | digest 规则实现 | 确认后改变正文并执行 | 执行前重算 digest | 拒绝执行并要求重批 | UNTESTED | UNSPECIFIED |
| SEND-002 | 合成未知发送结果 | 已提交动作 | 模拟核验超时 | 状态机 | 标记未知且不重试 | UNTESTED | UNSPECIFIED |
| DATA-001 | 合成 data/evidence records | 双时间记录 | 更正旧值 | 查询结果与证据链 | 冲突共存、用户更正优先 | UNTESTED | UNSPECIFIED |

自动文档检查只验证结构，不证明产品运行、安全性、平台兼容性或法律合规。
