---
title: "Yance 规划文档"
status: planning
audience: "所有规划参与者"
owner: UNSPECIFIED
last_reviewed: 2026-08-28
source_of_truth: true
language: zh-CN
---

# Yance 规划文档

本目录是 Yance 当前规划的事实源。仓库已进入 **implementation prototype**，但仍没有正式发行版、冻结公开 API 或受支持版本；是否已经实现某项能力应以[项目状态](reference/project-status.md)、运行时代码和测试证据为准，不能只从规划正文推断。[`../old/`](../old/README.md) 是停止维护的历史快照。

`zh-CN` 是 source-of-truth。翻译只能作为标明来源版本的派生材料；当前不创建空英文镜像。owner、License、最低受支持系统版本、正式 API、首个真实 connector、长期数据库、模型、Release policy 与安全响应 SLA 仍为 **UNSPECIFIED**；原型 Registry 已选择普通 SQLite。

## 导航

| 分区 | 内容 |
| --- | --- |
| [开始阅读](getting-started.md) | 审阅顺序与贡献入口 |
| [产品](product/README.md) | 产品定义和用户体验 |
| [架构](architecture/README.md) | 系统、记忆与数据边界 |
| [智能](intelligence/README.md) | 人格、情感和关系分析边界 |
| [连接器](connectors/README.md) | MCP 耦合、市场和兼容性 |
| [参考](reference/README.md) | 状态、术语、决策、安全与契约草案 |
| [验证](validation/README.md) | 路线图、测试计划和匿名 fixture |
| [研究](research/README.md) | 主张来源索引 |
| [贡献](contributing/README.md) | 风格、来源与本地化政策 |

## 文档状态

- `planning`：已批准的规划事实源，不代表实现。
- `proposed`：可评审草案，尚未冻结为公开 API。
- `prototype`：已有可运行代码和自动化测试，但不是受支持发行版或冻结 API。
- `moved`：旧路径兼容跳转页，不含规范正文。
- `archive`：历史快照，不属于当前事实源。

当前交付状态和未决项见[项目状态](reference/project-status.md)。
