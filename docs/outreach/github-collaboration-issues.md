---
title: "GitHub 生态合作邀请候选与 Issue 草稿"
status: planning
audience: "项目维护者与生态合作参与者"
owner: UNSPECIFIED
last_reviewed: 2026-08-27
source_of_truth: true
language: zh-CN
---

# GitHub 生态合作邀请候选与 Issue 草稿

> 2026-08-27，项目负责人已确认可向本文全部候选仓库发布；发布时仍应逐仓库保存准确正文和返回链接。

## 1. 对外如何说明 Yance

Yance 是一个由多个 MCP 连接器驱动的**本地优先个人关系与沟通智能大脑**，不只是另一个聊天记录导出器。

Yance 不限定微信、小红书、闲鱼、钉钉、飞书等 MCP 的内部实现；最低要求是在授权范围内读取聊天，并告诉大脑“使用者是谁、对方是谁”，写入和发送是可选能力。大脑把使用者的多个场景身份与同一联系人的多个账号、平台身份和关系关联起来，从长期聊天中学习双方的沟通特征，并根据当前场景选择合适身份生成回复建议。早期由人选择和确认；当某一身份、账号、对象范围和场景积累足够反馈并通过验证后，用户可以开启受限、可审计、可暂停的自动回复。

长期还会探索操控性沟通信号（包括通常所说的 PUA 模式）、话外意图、机会识别，以及类似“三国式”多方关系和利益博弈的策略推演。所有结论都应保留可观察信号、证据、反证、替代解释和不确定性，不能把推测变成对人的定罪或利用弱点的操控建议。

Yance 希望与生态项目共同讨论两层基础：

1. **沟通数据底层结构**：不同平台如何保留消息、人物、会话、时间、引用、媒体、撤回和来源证据的真实语义。
2. **受控能力契约**：读取、搜索、增量同步、草稿和发送如何被发现、验证、授权、审计和安全复用。

规范不应由 Yance 单方面宣布，也不要求其他项目成为 Yance 的附属组件。合作可以从格式映射、匿名 fixture、兼容适配器、边界讨论或联合原型中的任何一项开始。

## 2. 选择原则

Star 不是门槛。候选优先级按以下因素判断：

- 与私人沟通、关系上下文、历史记忆或受控发送的实际关联；
- 最近是否有真实提交、发布、Issue 处理或上游协作；
- 是否已经处理完整消息类型、实时事件、身份、来源和异常状态；
- 是否坚持本地优先、最小权限、草稿优先或人工确认；
- 是否有意愿把能力提供给其他 Agent、CLI、MCP 或统一格式消费者。

仅有高 Star、但多年未维护或只覆盖内容发布而不覆盖沟通链路的仓库，不进入第一批。

## 3. 第一批：微信数据与智能层核心合作方

| 仓库 | 最近活动（核于 2026-08-27） | 不可替代的关联 | 建议合作位置 |
| --- | --- | --- | --- |
| `ILoveBingLu/CipherTalk` | 2026-08-26 提交并发布 | 数字人生、事实链、证据提取、独立 CLI | 原始记录到关系记忆和可追溯证据的边界 |
| `LifeArchiveProject/WeChatDataAnalysis` | 2026-08-26 提交并发布 | 微信 4.x、实时同步、朋友圈/收藏/转账等丰富数据类型 | 完整事件语义、增量同步、数据来源与时间结构 |
| `ChatLab/ChatLab` | 2026-08-26 提交，2026-08-20 发布 | 本地 AI、跨平台统一模型、SQL、Agent、标准格式 | 统一格式兼容、跨平台身份与关系证据扩展 |
| `pandorafuture/wx-cli` | 2026-08-26 提交并发布 | 本地 REST/SSE、跨会话时间线、Agent Skill、读/搜/订阅 | 面向 Agent 的会话能力契约及 Yance 直接适配 |
| `Panther114/Weport` | 2026-08-27 当天提交 | 17 个检索工具、长期记忆、关系分析、人格克隆、丰富导出 | 智能大脑本身的共同设计，而非普通连接器合作 |
| `julibeian/wechat-txt-pdf-exporter` | 2026-08-27 当天提交，2026-08-26 首发 | 本地 TXT/PDF、可搜索归档、媒体与导出历史 | 人类可读档案、证据引用和来源回链 |

许可证提示只用于内部协作判断：ChatLab 为 AGPL-3.0；wx-cli 与 wechat-txt-pdf-exporter 为 MIT；CipherTalk README 标示 CC BY-NC-SA；WeChatDataAnalysis 与 Weport 未检测到标准 SPDX 许可证。未得到明确授权前，只讨论规范、接口和独立实现，不复制代码。

## 4. 第二批：跨平台连接器与安全交互候选

这些项目不是按 Star 排序，而是按与 Yance 沟通闭环的贴合度筛选。发送前仍需逐个阅读贡献说明和最新 Issue。

| 平台 | 仓库 | 选择原因 | 建议议题 |
| --- | --- | --- | --- |
| 小红书 | `xpzouying/xiaohongshu-mcp` | 活跃上游，覆盖搜索、详情、评论、发布 | 区分读取、评论与发布；对象和载荷确认 |
| 小红书 | `CNQQC/xhs-mcp` | 低 Star 但在主动修上游超时、OOM、安全验证和时间字段，并已提交多项上游 PR | 失败状态、验证挑战、可读时间和兼容测试 |
| 小红书 | `Algovate/xhs-mcp` | CLI 与 MCP 双入口，读写能力边界清楚 | 能力发现、风险分级和跨入口一致性 |
| 闲鱼 | `xiaoyushen259-cloud/xianyu-chatmate` | 默认只产草稿；真实发送要求确认开关和精确会话名 | 不可变发送确认、风险提示时停止、草稿优先 |
| 闲鱼 | `fancyboi999/goofish-cli` | MCP/CLI/Skill 共用能力注册；会话历史、实时消息和发送均有覆盖 | 会话事件、实时订阅、发送核验和风险护栏 |
| 闲鱼 | `xueshengshuma/XianyuAutoAgent` | 本地客服、AI 建议、人工接管、发送策略和本地聊天数据库 | 高并发沟通场景、人工接管、关系与业务身份分离 |
| 闲鱼 | `hui01101/XianyuAutoAgent-Plus` | 回复质检、可解释意图、本地分析、时间衰减上下文 | 事实/推断分层、承诺检查、回复风险与上下文选择 |
| 钉钉 | `keithyt06/quick-dingtalk-mcp` | 用户身份 OAuth，可读写消息，不以机器人冒充本人 | 真实身份、账号范围、发送归属和审计 |
| 钉钉 | `sputnicyoji/dingtalk-workspace` | 自动把官方 dws schema 映射为 MCP，不接管凭据 | schema 变化、能力版本、权限边界和适配失效 |
| 钉钉 | `mwe-support/DingTalkMCP` | 低 Star 但有细致的 OAuth、scope、幂等、部分覆盖声明和确认设计 | 不完整历史的显式声明、写操作确认与幂等证据 |
| 飞书 | `echowxsy/larkctl-gateway` | 用户 OAuth、消息列表/搜索/回复、审计日志与安全策略 | 消息证据、用户身份、审计与批量读取边界 |
| 飞书 | `zjdx10/feishu-mcp-server` | 低 Star、近期活跃、以用户身份发消息和操作文档 | 用户身份授权、发送确认和平台回执 |
| 飞书 | `lhhhappy/feishu-channel` | 双向实时消息、引用回复、编辑和附件 | 入站事件、引用关系、编辑语义和实时通道 |
| 飞书 | `a4001234567/yet-another-lark-mcp` | 最小权限分层、读/搜/发、watch loop、确认卡片 | 渐进授权、平台内确认和个人助理交互契约 |

官方 `larksuite/lark-openapi-mcp` 与 `open-dingtalk/dingtalk-mcp` 可作为接口背景，但最后提交分别停留在 2025-08 和 2025-07，不应只因“官方”进入第一批主动邀请。

## 5. 第一批六封定制 Issue

### 5.1 CipherTalk

#### 建议标题

`[合作讨论] 一起定义“聊天记录 → 关系记忆 → 可追溯证据”的开放边界`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。

它不限定微信、小红书、闲鱼、钉钉、飞书等 MCP 的内部实现，只要求连接器能在授权范围内读取聊天并识别“使用者是谁、对方是谁”。大脑把使用者的多个场景身份和同一联系人的多个账号、身份与关系串起来，从长期聊天中学习沟通特征并推荐回复；早期由人确认，积累足够反馈后可由用户对明确场景开启受限自动回复。长期还会探索操控性沟通信号、话外意图、机会识别和多方策略推演，但保留证据、反证与不确定性。

我们认真看了 CipherTalk。项目提出的“留住爱、提取证据、守住数字人生”，以及对完整、可追溯事实链的重视，与 Yance 想解决的问题非常接近；独立 CLI 也使它不只是桌面查看器，而可能成为可组合的数据基础。

想邀请你们一起讨论：

- 原始微信记录进入关系记忆时，怎样保留来源、时间、引用、媒体和可核验性；
- “事实链”与 AI 生成的解释怎样严格分开，避免模型把推测写成事实；
- CipherTalk CLI 与 Yance 是否可以从匿名样例和只读适配器开始做一个小型联合验证。

我们不是来要求 CipherTalk 适配某个既定私有格式。相反，希望底层结构由真正处理微信数据、档案和证据的项目共同讨论。如果你们也希望继续走向 AI 分析、关系理解或回复，我们更愿意把 CipherTalk 当作共同建设智能大脑的伙伴；字段映射和匿名 fixture 只是可以立即开始的第一步。

### 5.2 WeChatDataAnalysis

#### 建议标题

`[合作邀请] 共同定义微信沟通数据进入个人智能大脑时的真实语义`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。

它不限定各平台 MCP 的内部实现，只要求连接器能在授权范围内读取聊天并识别使用者与对方。大脑把使用者的多个场景身份和同一联系人的多个账号、平台身份与关系串起来，从长期聊天中学习沟通特征并推荐回复；早期由人确认，积累足够反馈后可由用户对明确场景开启受限自动回复。长期还会探索操控性沟通信号、话外意图、机会识别和多方策略推演，但保留证据、反证与不确定性。

WeChatDataAnalysis 对我们很有价值，不只是因为能导出聊天记录，而是因为它已经实际处理微信 4.x、实时同步、朋友圈、收藏、好友验证、转账红包、服务号和账号归档等不同语义的数据。这样的完整覆盖，正是制定底层结构时不能靠想象替代的经验。

我们想邀请你们一起讨论：

- 不同微信事件怎样保留统一骨架，同时不丢失各自真实语义；
- 实时更新、历史回填、删除或缺失数据怎样向上层明确表达覆盖范围；
- 是否可以用匿名导出样例验证 Yance 的只读映射，让大脑层不反向绑死数据工具。

我们不希望单方面发明一套“标准”再要求生态迁移。如果你们也在考虑 AI 分析、人物关系或自动回复，我们希望一起讨论大脑层，而不只是让 WeChatDataAnalysis 提供数据；事件模型和匿名 fixture 只是第一步。

### 5.3 ChatLab

#### 建议标题

`[合作讨论] ChatLab 统一格式与关系理解 / 沟通决策层的协作可能`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。

Yance 把使用者的多个场景身份和同一联系人的多个账号、平台身份与关系串起来，从长期聊天中学习沟通特征；在闲鱼买卖、小红书客户沟通、微信上下级或长晚辈等场景中选择合适身份，给出有真实取舍的回复策略。早期由人确认；积累足够反馈后，用户可对明确身份和场景开启受限自动回复。长期还会探索操控性沟通信号、话外意图、机会识别和多方策略推演，并保留证据、反证与不确定性。

我们注意到 ChatLab 已经在做本地 AI、百万级历史、跨平台归一化、SQL + Agent，并且公开了 Standardized Format Specification。它不是 Yance 应该绕开的“已有格式”，而是最值得先研究、兼容并共同演进的基础之一。近期关于跨会话分析、来源合并和记忆 provenance 的工作，也与关系大脑十分相关。

想邀请你们讨论三件事：

- Yance 能否先以 ChatLab 标准格式作为一类输入，而不是另造互斥格式；
- 人物跨平台身份、关系范围、证据出处和时间变化，适合成为格式扩展、旁路索引，还是独立上层；
- 双方能否用匿名数据做一次“跨会话关系理解但结论可回溯到原消息”的联合原型。

我们尊重 ChatLab 现有 schema-first 路线和 Issue-first 的协作方式，也不会要求项目成为 Yance 的从属模块。ChatLab 本身已经在走向 AI 分析，我们希望以平等项目共同讨论关系大脑和自动回复的上层结构；最小兼容说明和具体样例只是开场。

### 5.4 wx-cli

#### 建议标题

`[合作讨论] 共同定义面向 Agent 的微信会话能力契约与安全边界`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。

Yance 不限定微信等 MCP 的内部实现，只要求连接器在授权范围内读取聊天并识别使用者与对方。大脑把使用者的多个场景身份和同一联系人的多个账号、身份与关系串起来，从长期聊天中学习沟通特征并推荐回复；早期由人确认，积累足够反馈后可对明确场景开启受限自动回复。长期还会探索操控性沟通信号、话外意图、机会识别和多方策略推演。Yance 不打算自己长期维护微信解密和平台适配。

wx-cli 已经把微信做成了真正面向 Agent 的本地能力层：跨会话 timeline、REST API、SSE 实时事件、搜索、媒体、JSON 导出和 Agent Skill 都与我们的接入方向高度吻合。尤其是“一次读取时间窗内所有会话”，非常适合关系记忆补全，而不是让模型逐个搬运会话。

想邀请你们一起讨论：

- 会话读取、跨会话时间线、增量事件和媒体来源的最小稳定能力契约；
- 覆盖不完整、版本变化、风控或账号风险怎样成为机器可见状态，而不是被 Agent 当作普通失败重试；
- 由 Yance 先实现一个独立 wx-cli 只读适配器，并用匿名 fixture 验证字段与分页语义是否可行。

我们不会把 wx-cli 包装成 Yance 官方组件，也不会绕过项目自身的安全提示。如果你们对长期记忆、人物关系、AI 分析或回复也有更大设想，欢迎共同参与大脑层；能力映射只是让这些设想能够互通的第一步。

### 5.5 Weport

#### 建议标题

`[合作邀请] 共同探索本地个人沟通智能大脑：关系记忆、决策与人工确认`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。

它通过多个平台 MCP 读取授权聊天和身份，把使用者的多个场景身份与同一联系人的多个账号、平台身份和关系串起来，从长期聊天中学习沟通特征并推荐回复；早期由人确认，积累足够反馈后可对明确场景开启受限自动回复。长期还会探索操控性沟通信号、话外意图、机会识别和多方策略推演，并保留证据、反证与不确定性。

我们不想把 Weport 简单当作“微信导出器”来邀请。WeportAI 已经具备 17 个本地检索工具、跨会话时间线、长期记忆、人物与关系分析；加上朋友圈、统计、人格克隆和多种开放导出格式，它实际进入了个人沟通智能大脑的核心区域。

Yance 关注的互补部分是：把跨平台沟通放回不同身份和关系中；严格区分事实、推测、反证和未知；在回复前提供几种有代价的策略；检查承诺变化；最后把平台、对象和正文绑定到一次明确人工确认。我们认为这种重叠不是把 Weport 降格成连接器的理由，反而值得以平等项目的方式讨论共同底层。

想邀请你们一起探索：

- 长期记忆怎样保存来源、时间范围、关系范围和反证，避免旧结论永久固化；
- 人格画像、关系状态和一次沟通决策之间怎样分层；
- Weport 的开放导出 / 本地工具与 Yance 的跨平台决策流程，能否通过独立适配器或共同 fixture 做一次双向验证。

我们不预设合并项目，也不要求 Weport 采用 Yance 的架构。Weport 已经是智能大脑方向的同行项目，我们希望直接讨论共同规范、重复与互补、自动回复边界和联合原型，而不是把合作限制在导出适配。

### 5.6 wechat-txt-pdf-exporter

#### 建议标题

`[合作讨论] 让可搜索聊天归档成为可引用、可追溯的个人记忆证据层`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。

Yance 不把聊天记录只当作喂给模型的文本。它把使用者的多个场景身份与同一联系人的多个账号、身份和关系串起来，从长期互动中学习沟通特征；早期给出推荐回复并由人确认，积累足够反馈后允许用户对明确场景开启受限自动回复。每个关于人物、关系、操控性沟通信号、话外意图、机会和策略的判断，都应回到原始消息和时间，并保留反证与未知项。

我们注意到 wechat-txt-pdf-exporter 虽然是新项目、Star 不多，但最近仍在持续提交，而且坚持本机处理、可搜索 TXT/PDF、联系人/群聊与日期筛选、媒体和导出历史。这些能力对“人能读、能保存、能复核”的证据层很重要，不能被只面向机器的 JSON 接口替代。

想邀请你们讨论：

- 导出文档如何携带稳定的会话、时间、发送者和原记录引用信息；
- AI 的引用怎样能回到人类可读的 TXT/PDF 位置，而不是只给不可复核的摘要；
- 是否愿意用匿名样例共同验证一个很小的“档案 + 证据索引”结构。

我们不会把低 Star 当作低价值，也不会预设项目只想停留在 TXT/PDF 导出。如果你们也希望走向 AI 分析、人物关系或回复，欢迎共同参与大脑层；可读档案和证据索引只是一个可靠起点。

## 6. 第二批十四封定制 Issue

### 6.1 xpzouying/xiaohongshu-mcp

#### 建议标题

`[合作讨论] 小红书内容与互动能力如何安全接入个人沟通决策大脑`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。它把使用者的多个场景身份与同一联系人的多个账号、平台身份和关系串起来，从长期聊天中学习沟通特征；在小红书等场景中结合账号定位、目标人群和当前关系推荐回复。早期由人确认，积累足够反馈后可对明确场景开启受限自动回复；长期还会探索操控性沟通信号、话外意图、机会识别和多方策略推演。

我们认真看了 xiaohongshu-mcp 的搜索、详情、评论与发布能力。对 Yance 来说，小红书不是普通“内容数据源”：公开笔记和评论有明确作者、上下文、互动对象和外部副作用，不能和私聊消息混成同一种记录，也不能让模型把“能调用工具”理解成“可以直接发布”。

想邀请你们一起讨论：

- 笔记、评论、回复关系和作者身份怎样保留为可回溯的上下文；
- 读取、评论、发布怎样清楚分级，并让验证码、登录失效和平台风险成为明确状态；
- 是否可用匿名样例验证一份小红书能力映射和“确认后再评论/发布”的联合流程。

我们不要求项目采用 Yance 的私有结构，也不会把它包装成官方或零风险连接器。如果你们也在考虑从内容工具走向客户理解、AI 分析或自动回复，欢迎共同参与大脑层；平台契约只是第一步。

### 6.2 CNQQC/xhs-mcp

#### 建议标题

`[合作讨论] 把超时、验证挑战与时间语义纳入小红书 Agent 能力契约`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。它把使用者的多个场景身份和联系人的多个账号、平台身份与关系串起来，从长期聊天中学习沟通特征并推荐回复；早期由人确认，积累足够反馈后可对明确场景开启受限自动回复。Yance 需要读取平台上下文，但不会把失败自动当成可重试，更不会绕过验证码或平台风险提示。

我们注意到这个项目虽然 Star 很少，却在认真修复上游的超时、panic、OOM、安全验证识别和时间字段，并把改动拆成多个 PR 回馈 `xpzouying/xiaohongshu-mcp`。这类“真实失败怎样被 Agent 理解”的经验，比单纯增加工具数量更适合参与底层规范。

想邀请你们讨论：

- 正常空结果、软超时、安全验证、登录失效和部分成功应怎样结构化区分；
- 原始时间戳与可读时间如何同时保留，避免模型自行换算出错；
- Yance 是否可以贡献匿名失败 fixture 或兼容测试，并优先通过上游 PR 协作而不是制造长期分叉。

我们尊重该项目以上游回馈为主的定位，不会要求另起一套实现。如果你们也在考虑 AI 分析或回复，欢迎参与共同大脑；“Agent 不应盲目重试的状态”可以成为第一项具体协作。

### 6.3 Algovate/xhs-mcp

#### 建议标题

`[合作讨论] CLI / MCP 双入口下的小红书能力一致性与发送确认`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。它不限定 MCP 内部实现，只要求在授权范围内读取聊天并识别使用者与对方；大脑关联双方的多个账号、身份与场景，从长期反馈中学习沟通特征。早期评论和发布由人确认，模型与场景通过验证后可由用户开启受限自动回复。

Algovate/xhs-mcp 同时提供 CLI 和 MCP，覆盖登录、推荐、搜索、详情、评论与发布。我们很关注这种“一套平台能力、多种调用入口”的设计，因为 Yance 希望验证一次成功调用后复用本地脚本，但不能让脚本绕过权限和确认。

想邀请你们讨论：

- CLI 与 MCP 如何保持同一能力、参数和错误语义；
- 读取、登录、评论和发布怎样声明不同风险等级；
- 是否能用匿名 fixture 验证“生成草稿 → 展示目标与正文 → 确认 → 执行 → 返回平台结果”的最小闭环。

这不是要求项目为 Yance 定制功能。如果你们也希望从平台自动化走向客户理解、AI 分析或回复，欢迎一起建设大脑层；可被不同 Agent 宿主复用的能力边界只是共同地基。

### 6.4 xiaoyushen259-cloud/xianyu-chatmate

#### 建议标题

`[合作邀请] 共同定义不可被 Agent 绕过的闲鱼草稿与发送确认`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。它关联使用者和联系人的多个账号与身份，判断当前使用者是闲鱼个人买家、个人卖家还是商家，并结合商品、交易上下文、历史承诺和风险信号推荐回复。早期由人确认；积累足够反馈后，用户可对明确商品、对象范围和场景开启受限自动回复。

我们非常认同 xianyu-chatmate 的安全取向：默认 `send` 只返回草稿，真实发送同时要求 `--confirm-send` 与准确的 `--expected-chat`，遇到平台风险提示就停止。这与 Yance 规划的不可变发送批准载荷高度一致，而且价值与 Star 数无关。

想邀请你们一起讨论：

- 确认如何绑定会话、对象、正文和一次执行，避免确认后被替换；
- 页面变化、对象无法核验、风险提示或发送结果未知时怎样失败关闭；
- 是否愿意用匿名测试页面共同验证一套可供其他平台复用的发送安全契约。

我们愿意先贡献独立 fixture、测试和说明，也不会削弱现有的草稿默认策略。如果你们希望继续发展 AI 分析或自动回复，我们更愿意把这个项目当作共同大脑的安全实践伙伴。

### 6.5 fancyboi999/goofish-cli

#### 建议标题

`[合作讨论] 闲鱼实时会话、历史上下文与确认发送的开放能力契约`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。它关联使用者和联系人的多个账号、身份与关系，判断当前是个人买卖还是商家经营，并从会话历史与实时消息中理解议价、承诺、机会和风险。早期给出推荐回复并由人确认；积累足够反馈后，用户可对明确商品、对象范围和场景开启受限自动回复。

goofish-cli 的 CLI / MCP / Skill 共用 registry，并覆盖会话列表、历史消息、实时 watch、文本或图片发送和风险护栏。这已经是完整的 Agent 会话能力层，而不只是商品搜索工具。

想邀请你们一起讨论：

- 历史消息与 WebSocket 实时事件如何去重、排序并声明覆盖范围；
- 已读、新消息、发送成功、发送未知和平台风控怎样形成稳定状态；
- Yance 是否可以先做独立适配器，用匿名 fixture 验证“读历史 → 收实时事件 → 生成策略 → 用户确认 → 发送并核验”。

我们不会要求 goofish-cli 成为 Yance 专属组件，也不会把议价分类直接当作对人的定性。如果你们对买家理解、关系记忆和 AI 回复还有更大规划，欢迎共同建设大脑层；会话契约只是第一步。

### 6.6 xueshengshuma/XianyuAutoAgent

#### 建议标题

`[合作邀请] 本地闲鱼客服中的关系上下文、人工接管与安全决策`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。它既面向私人沟通，也面向闲鱼卖家等高频沟通用户；关联使用者与买家的多个账号、身份、商品和关系，从长期互动中学习沟通特征，生成可解释策略。早期以人工建议和接管为主；积累足够反馈后，用户可按身份、账号、对象和场景选择受限自动回复。

我们看到 XianyuAutoAgent 已经在本地监听闲鱼消息、保存聊天历史、生成 AI 回复建议，并提供人工接管、自动发送策略、安全拦截和诊断中心。它处理的是 Yance 需要认真学习的真实高频客服链路。

想邀请你们讨论：

- AI 建议、人工接管和自动策略之间怎样留下明确状态与责任边界；
- 买家关系、商品事实和单次会话意图怎样分层，避免把模型猜测写进长期记录；
- 是否可以通过匿名会话 fixture 对齐消息、会话状态、草稿和发送结果的最小结构。

Yance 早期采用确认后发送，成熟后允许用户按身份和场景选择受限自动回复。我们希望与已经实践自动客服、建议和人工接管的项目共同定义不同自动化等级，并直接交流大脑层，而不是只讨论接口。

### 6.7 hui01101/XianyuAutoAgent-Plus

#### 建议标题

`[合作讨论] 可解释意图、回复质检与关系记忆如何形成可核验链路`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。它关联使用者与联系人的多个账号、身份和场景，从长期互动中学习沟通特征；把字面事实、可能意图、支持证据、反证和未知项分开，再给出有真实取舍的回复策略。早期由人确认；积累足够反馈后，用户可开启受限自动回复。长期还会探索操控性沟通信号、话外意图、机会和多方策略。

XianyuAutoAgent-Plus 的可解释意图路由、时间衰减上下文、回复质检、过度承诺与站外引流检查、本地分析和并发历史读取，都与这一目标直接相关。我们尤其认可“发送前发现表达和承诺问题”比事后统计更接近沟通决策。

想邀请你们讨论：

- 意图结论如何附带消息证据、置信度、替代解释和有效时间；
- 质检如何说明具体风险与修改差异，而不是只给不可解释分数；
- 是否能以匿名闲鱼对话共同验证一套“检索上下文 → 提出判断 → 质检草稿 → 人工决定”的结构。

我们不会把交易风险信号直接升级为对买家的定罪，也希望相关约束能成为跨项目共享的安全底线。如果你们愿意，我们希望从可解释意图和回复质检继续共同设计关系记忆与自动回复大脑。

### 6.8 keithyt06/quick-dingtalk-mcp

#### 建议标题

`[合作讨论] 以真实用户身份操作钉钉时的授权、归属与发送确认`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。它关联使用者和联系人的多个账号、平台身份与关系，判断当前面对的是领导、提携者、同事、客户、长辈或晚辈，并据此推荐回复。早期由人确认；在身份和场景积累足够反馈后，用户可开启范围受限、可审计、可暂停的自动回复。

quick-dingtalk-mcp 通过官方 dws 与用户身份 OAuth 读写钉钉消息，而不是让机器人代发；本地与远程模式又共享同一组工具。这使“动作到底以谁的身份发生”成为必须进入能力契约的一等信息。

想邀请你们讨论：

- 用户身份、企业、账号范围和消息作者归属怎样被 Agent 明确核验；
- 本地与远程模式如何保持权限、审计和错误语义一致；
- 是否可以用测试群做一个“读取上下文 → 生成草稿 → 确认真实身份和群 → 发送 → 核验”的小型联合验证。

我们不会把 OAuth 成功等同于自动回复授权，也不会把项目包装成钉钉官方能力。如果你们也在考虑从消息工具走向身份理解、AI 分析或自动回复，欢迎共同参与大脑层。

### 6.9 sputnicyoji/dingtalk-workspace

#### 建议标题

`[合作讨论] 官方 dws 动态能力映射中的版本、权限与失效语义`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。它通过平台 MCP 读取聊天和身份，关联使用者与联系人的多个账号、关系和场景，从长期反馈中学习沟通特征并推荐回复，成熟后允许用户按明确场景开启受限自动回复。Yance 会先验证第三方能力再保存本地调用路径；连接器 schema 或权限变化后，旧路径必须回到待复核状态。

dingtalk-workspace 自动遍历官方 dws 的命令或 JSON schema，将完整能力面映射为 MCP，同时把身份、凭据和权限继续交给官方 CLI。这种薄适配层与 Yance 的连接器理念很接近，也恰好暴露出动态能力升级时最关键的问题。

想邀请你们讨论：

- dws 升级后怎样标识工具新增、删除和语义变化；
- 动态生成的工具如何保留风险、身份范围和外部副作用信息；
- Yance 是否可以贡献 schema 快照与兼容测试，验证旧映射何时必须失效。

我们不希望冻结 dws 的迭代。如果你们对身份理解、AI 分析或回复有更大设想，欢迎共同参与大脑层；动态 schema 的可见与可验证是第一项地基工作。

### 6.10 mwe-support/DingTalkMCP

#### 建议标题

`[合作讨论] 从钉钉审批实践提炼可核验、可确认、可声明不完整的 Agent 契约`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。它通过平台 MCP 读取聊天和身份，关联使用者与联系人的多个账号、关系和场景，从长期反馈中学习沟通特征并推荐回复；成熟后允许用户按明确身份和场景开启受限自动回复。虽然主要场景是消息沟通，但审批项目对确认、幂等、身份和不完整覆盖的实践同样能帮助我们制定底层结构。

MWE审批MCP 虽然不是通用聊天连接器，却在 OAuth 用户绑定、scope、任务归属复核、幂等账本、`confirm`、部分覆盖和 `resyncRequired` 等方面给出了非常具体的实现。这样的低 Star 项目对底层规范的价值很高。

想邀请你们讨论：

- “历史不完整”和“已核验属于当前用户”如何成为标准机器状态；
- 高风险动作如何绑定当前对象、当前状态与一次确认，并防止重复执行；
- 是否愿意共同抽取几条与业务无关的安全 fixture，供消息发送和审批决定两类 Agent 复用。

我们不会要求项目扩展聊天能力，也不会复制业务实现。如果你们对个人 Agent 或自动决策有更大规划，欢迎共同参与大脑层；审批实践可以帮助我们把确认、身份、幂等和覆盖范围做成真实可验证的地基。

### 6.11 echowxsy/larkctl-gateway

#### 建议标题

`[合作讨论] 飞书用户身份、消息证据与审计如何接入个人沟通大脑`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。它关联使用者和联系人的多个账号、平台身份与关系，从长期消息中学习沟通特征和历史承诺，并根据当前场景推荐回复；早期由人确认，积累足够反馈后可对明确场景开启受限自动回复。每个结论需要回到来源，每个外部动作需要审计。

larkctl-gateway 已经覆盖 OAuth device flow、消息列表/搜索/批量读取/资源下载/回复/发送、会话搜索，并使用审计日志和安全策略。它提供的不是单一工具，而是很完整的用户身份网关实践。

想邀请你们讨论：

- 消息、线程、引用、资源和发送结果怎样保留稳定来源标识；
- OAuth 用户、会话范围、批量读取和审计记录怎样进入能力元数据；
- 是否可用测试租户和匿名 fixture 验证 Yance 的只读接入及确认后回复流程。

我们不会要求网关暴露更多权限，也不会把“已接入”宣传成安全认证。如果你们也在考虑从网关走向 AI 分析、关系理解或回复，欢迎共同参与大脑层；最小权限和审计是共同地基。

### 6.12 zjdx10/feishu-mcp-server

#### 建议标题

`[合作讨论] 以用户身份发送飞书消息时的授权范围与结果核验`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。它关联使用者和联系人的多个账号、平台身份与关系，从跨平台历史中学习沟通特征并按当前场景推荐回复。早期由人确认；积累足够反馈后，用户可对明确身份、账号、对象范围和场景开启受限自动回复，但 OAuth 登录本身绝不等于自动发送授权。

feishu-mcp-server 最近仍在活跃开发，并明确使用 OAuth user access token 以用户本人身份创建文档和发送消息。对个人沟通助手来说，“以谁的身份执行”比是否能调用 API 更重要。

想邀请你们讨论：

- user token 的身份、租户和 scope 如何以最少敏感信息提供给宿主核验；
- 发送工具如何支持对象预览、确认绑定、平台消息 ID 与失败状态；
- 是否能在测试账号上共同验证一个小型确认发送 fixture。

我们不会复制凭据处理代码。如果你们也希望从用户身份工具走向关系分析或自动回复，欢迎共同参与大脑层；先把身份与发送边界做清楚，可以让后续智能建立在可靠基础上。

### 6.13 lhhhappy/feishu-channel

#### 建议标题

`[合作讨论] 飞书双向消息中的引用、编辑、附件与实时事件语义`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。它关联使用者和联系人的多个账号、身份与关系，把实时新消息与历史上下文结合，按当前场景推荐回复；早期由人确认，积累足够反馈后可由用户开启受限自动回复。编辑、引用和附件不能在归一化时丢失。

feishu-channel 已经实现实时入站消息、MCP 回复、引用回复、附件、表情回应和编辑，这些都是单纯 `send_message` 接口覆盖不到的真实沟通语义。

想邀请你们讨论：

- 入站事件与历史读取如何用 message/chat/user/time 标识去重和回链；
- 引用、编辑、reaction 和附件怎样保留为一等事件而非拼进纯文本；
- 是否能以测试机器人共同验证“实时接收 → 上下文分析 → 人工确认 → 引用回复”的最小流程。

我们不预设频道项目只想停留在消息转发。如果你们也在考虑长期记忆、人物分析或自动回复，欢迎共同参与大脑层；实时事件结构是双方可以立即协作的第一步。

### 6.14 a4001234567/yet-another-lark-mcp

#### 建议标题

`[合作讨论] 渐进权限与飞书内确认如何成为个人 Agent 的通用能力`

#### 正文

你好，我们正在开发 [Yance](https://github.com/XRSec/Yance)：一个由多个 MCP 连接器驱动的本地优先个人关系与沟通智能大脑。它关联使用者和联系人的多个账号、平台身份与关系，从长期聊天中学习沟通特征并按当前场景推荐回复。早期由人确认；积累足够反馈后，用户可按身份、账号、对象范围、时间窗和场景开启受限自动回复，因此读取、草稿、单次发送和自动回复必须是不同权限。

yet-another-lark-mcp 将能力分为 Send-only、Interactive 和 Full，支持读、搜、发、watch loop，并能用飞书卡片完成确认或输入。这种“从最小权限开始、需要时才升级”的设计与 Yance 非常契合。

想邀请你们讨论：

- 权限 tier、OAuth 状态和具体工具风险怎样被 MCP 宿主可靠理解；
- 平台内确认卡片如何绑定原始动作、对象、正文、有效期和执行结果；
- 是否能共同做一个不依赖 Yance 私有实现的确认 fixture 或小型演示。

我们不希望把确认变成一个模型可自行点击的形式步骤，也不会要求项目采用 Yance 架构。如果你们也在建设更完整的个人 Agent，欢迎共同设计身份、关系记忆、渐进授权和自动回复的大脑层。

## 7. 发布记录

以下 Issue 已于 2026-08-27 发布：

| 平台/方向 | 仓库 | Issue |
| --- | --- | --- |
| 微信 / 证据 | `ILoveBingLu/CipherTalk` | [#385](https://github.com/ILoveBingLu/CipherTalk/issues/385) |
| 微信 / 数据 | `LifeArchiveProject/WeChatDataAnalysis` | [#123](https://github.com/LifeArchiveProject/WeChatDataAnalysis/issues/123) |
| 跨平台分析 | `ChatLab/ChatLab` | [#433](https://github.com/ChatLab/ChatLab/issues/433) |
| 微信 / Agent 数据源 | `pandorafuture/wx-cli` | [#18](https://github.com/pandorafuture/wx-cli/issues/18) |
| 微信 / 智能大脑 | `Panther114/Weport` | [#14](https://github.com/Panther114/Weport/issues/14) |
| 微信 / 可读档案 | `julibeian/wechat-txt-pdf-exporter` | [#1](https://github.com/julibeian/wechat-txt-pdf-exporter/issues/1) |
| 小红书 | `xpzouying/xiaohongshu-mcp` | [#829](https://github.com/xpzouying/xiaohongshu-mcp/issues/829) |
| 小红书 | `CNQQC/xhs-mcp` | [#1](https://github.com/CNQQC/xhs-mcp/issues/1) |
| 小红书 | `Algovate/xhs-mcp` | [#10](https://github.com/Algovate/xhs-mcp/issues/10) |
| 闲鱼 | `xiaoyushen259-cloud/xianyu-chatmate` | [#2](https://github.com/xiaoyushen259-cloud/xianyu-chatmate/issues/2) |
| 闲鱼 | `fancyboi999/goofish-cli` | [#27](https://github.com/fancyboi999/goofish-cli/issues/27) |
| 闲鱼 | `xueshengshuma/XianyuAutoAgent` | [#1](https://github.com/xueshengshuma/XianyuAutoAgent/issues/1) |
| 闲鱼 | `hui01101/XianyuAutoAgent-Plus` | [#1](https://github.com/hui01101/XianyuAutoAgent-Plus/issues/1) |
| 钉钉 | `keithyt06/quick-dingtalk-mcp` | [#6](https://github.com/keithyt06/quick-dingtalk-mcp/issues/6) |
| 钉钉 | `sputnicyoji/dingtalk-workspace` | [#1](https://github.com/sputnicyoji/dingtalk-workspace/issues/1) |
| 钉钉 | `mwe-support/DingTalkMCP` | [#1](https://github.com/mwe-support/DingTalkMCP/issues/1) |
| 飞书 | `echowxsy/larkctl-gateway` | [#1](https://github.com/echowxsy/larkctl-gateway/issues/1) |
| 飞书 | `zjdx10/feishu-mcp-server` | [#1](https://github.com/zjdx10/feishu-mcp-server/issues/1) |
| 飞书 | `lhhhappy/feishu-channel` | [#2](https://github.com/lhhhappy/feishu-channel/issues/2) |
| 飞书 | `a4001234567/yet-another-lark-mcp` | [#1](https://github.com/a4001234567/yet-another-lark-mcp/issues/1) |

### 7.1 后续扩展联络

项目负责人进一步确认向所有相关且开放 Issues 的候选仓库发布。以下 47 封 Issue 于 2026-08-27 发布；每封均按仓库实际能力调整合作重点，并在发布后复核为唯一、开放且正文完整的 Yance Issue。

| 平台/方向 | 仓库 | Issue |
| --- | --- | --- |
| 微信 / 关系分析 | `CCSU-HorizonLab/Chrono_Trace` | [#2](https://github.com/CCSU-HorizonLab/Chrono_Trace/issues/2) |
| 微信 / 可追溯 AI | `Wxw-Gu/TraceMemo` | [#26](https://github.com/Wxw-Gu/TraceMemo/issues/26) |
| 微信 / 数字分身 | `xming521/WeClone` | [#230](https://github.com/xming521/WeClone/issues/230) |
| 微信 / Agent 数据层 | `leecyno1/wechat-chatlog-analysis` | [#2](https://github.com/leecyno1/wechat-chatlog-analysis/issues/2) |
| 微信 / 联系人记忆 | `byteD-x/wechat-bot` | [#3](https://github.com/byteD-x/wechat-bot/issues/3) |
| 微信 / 个性化回复 | `PW970/Auto_reply` | [#1](https://github.com/PW970/Auto_reply/issues/1) |
| 微信 / 关系策略 | `chaojidaniuma/junshi-assistant` | [#1](https://github.com/chaojidaniuma/junshi-assistant/issues/1) |
| 微信 / 证据分析 | `amy-77/Wechat-Rewind` | [#1](https://github.com/amy-77/Wechat-Rewind/issues/1) |
| 微信 / Persona RAG | `HIT-JimmyXiao/Distill_myself_RAG-Skill` | [#1](https://github.com/HIT-JimmyXiao/Distill_myself_RAG-Skill/issues/1) |
| 微信 / 数据治理 | `Sunnybay1994/wechat_database_governance` | [#1](https://github.com/Sunnybay1994/wechat_database_governance/issues/1) |
| 闲鱼 / 安全 Agent | `falses00/Falses-Goofish-GuardAgent` | [#1](https://github.com/falses00/Falses-Goofish-GuardAgent/issues/1) |
| 跨平台 / 身份图谱 | `AbyssRow/ChatArchive` | [#1](https://github.com/AbyssRow/ChatArchive/issues/1) |
| 微信 / 联系人 Persona | `aiyufan3/wechat-hermes-bot` | [#1](https://github.com/aiyufan3/wechat-hermes-bot/issues/1) |
| 微信 / MCP 与知识库 | `zhuobichen/weflow-cli` | [#4](https://github.com/zhuobichen/weflow-cli/issues/4) |
| 微信 / 实时分析 | `jiankujidu/WeLine` | [#7](https://github.com/jiankujidu/WeLine/issues/7) |
| 微信 / 归一化导出 | `Mervyn620/wechat-record-kit` | [#1](https://github.com/Mervyn620/wechat-record-kit/issues/1) |
| 微信 / 导出与回复 | `xjin6/wechat-rune` | [#1](https://github.com/xjin6/wechat-rune/issues/1) |
| 微信 / 严格只读 MCP | `Igor-Xu/wechat-local-platform` | [#1](https://github.com/Igor-Xu/wechat-local-platform/issues/1) |
| 微信 / 建议与执行 | `2933684073/wechat-decrypt-contributors` | [#4](https://github.com/2933684073/wechat-decrypt-contributors/issues/4) |
| 微信 / 解密 MCP | `328336690/wechat-decrypt` | [#4](https://github.com/328336690/wechat-decrypt/issues/4) |
| 微信 / RPA SDK | `scottfly189/WeChatAuto.SDK` | [#4](https://github.com/scottfly189/WeChatAuto.SDK/issues/4) |
| 微信 / 读取与 UI 执行 | `fanyuantaier/wechatauto-replica` | [#17](https://github.com/fanyuantaier/wechatauto-replica/issues/17) |
| 微信 / 桌面 MCP | `Wirkflow/wechat-desktop-mcp` | [#1](https://github.com/Wirkflow/wechat-desktop-mcp/issues/1) |
| 微信 / 多账号 Copilot | `gih10012/wechatcopilot` | [#4](https://github.com/gih10012/wechatcopilot/issues/4) |
| 企业微信 / 官方 CLI | `WecomTeam/wecom-cli` | [#122](https://github.com/WecomTeam/wecom-cli/issues/122) |
| 小红书 / Skill | `DeliciousBuding/xiaohongshu-skill` | [#15](https://github.com/DeliciousBuding/xiaohongshu-skill/issues/15) |
| 小红书 / 评论回复 | `lee890720/xhs-auto-reply-mac` | [#1](https://github.com/lee890720/xhs-auto-reply-mac/issues/1) |
| 小红书 / 私信回复 | `sonny2handsome/xhs-ai-reply` | [#1](https://github.com/sonny2handsome/xhs-ai-reply/issues/1) |
| 小红书 / 证据归档 | `ChanTso/rednote-archivist` | [#4](https://github.com/ChanTso/rednote-archivist/issues/4) |
| 闲鱼 / 自动回复上游 | `zhinianboke/xianyu-auto-reply` | [#307](https://github.com/zhinianboke/xianyu-auto-reply/issues/307) |
| 闲鱼 / 回复过滤 | `GuDong2003/xianyu-auto-reply-fix` | [#113](https://github.com/GuDong2003/xianyu-auto-reply-fix/issues/113) |
| 闲鱼 / 多账号运营 | `Christ9038/Ydisks-Xianyu-Helper` | [#19](https://github.com/Christ9038/Ydisks-Xianyu-Helper/issues/19) |
| 闲鱼 / 可恢复执行 | `Evvvvvvvan/XianYuSmart` | [#28](https://github.com/Evvvvvvvan/XianYuSmart/issues/28) |
| 闲鱼 / RAG 客服 | `dameng2026/xianyu-pilot` | [#38](https://github.com/dameng2026/xianyu-pilot/issues/38) |
| 钉钉 / 官方工作台 CLI | `DingTalk-Real-AI/dingtalk-workspace-cli` | [#1168](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/issues/1168) |
| 钉钉 / 官方 Agent 通道 | `DingTalk-Real-AI/dingtalk-openclaw-connector` | [#654](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/issues/654) |
| 钉钉 / Agent 通道 | `soimy/openclaw-channel-dingtalk` | [#602](https://github.com/soimy/openclaw-channel-dingtalk/issues/602) |
| 钉钉 / 会话与审批 | `ttmouse/dsh-dingtalk-channel` | [#1](https://github.com/ttmouse/dsh-dingtalk-channel/issues/1) |
| 飞书 / 持久会话 | `JunguangJiang/dsh-lark-channel` | [#1](https://github.com/JunguangJiang/dsh-lark-channel/issues/1) |
| 飞书 / Thread 路由 | `tkwkeven/dsh-lark` | [#1](https://github.com/tkwkeven/dsh-lark/issues/1) |
| 飞书 / 一次性审批 | `srchengtao2025/dsh-feishu-channel` | [#1](https://github.com/srchengtao2025/dsh-feishu-channel/issues/1) |
| 多企业 IM / 身份会话 | `sosojust/dsh-messge-channels` | [#1](https://github.com/sosojust/dsh-messge-channels/issues/1) |
| 跨平台 IM / AI Agent | `wangrongding/wechat-bot` | [#310](https://github.com/wangrongding/wechat-bot/issues/310) |
| 跨平台 / 长期记忆 | `while-coder/sbot` | [#3](https://github.com/while-coder/sbot/issues/3) |
| 跨平台 / Agent Harness | `zhayujie/CowAgent` | [#3081](https://github.com/zhayujie/CowAgent/issues/3081) |
| 跨平台 / 多 Agent | `DemonDamon/AgenticX` | [#48](https://github.com/DemonDamon/AgenticX/issues/48) |
| 跨平台 / 消息桥 | `chenhg5/cc-connect` | [#1759](https://github.com/chenhg5/cc-connect/issues/1759) |

## 8. 发布顺序与约束

1. 先发布第一批六封定制 Issue，不使用同文群发。
2. 每封发布前再次检查仓库最新 README、贡献约定、重复 Issue 和许可证。
3. Issue 中只邀请讨论，不承诺对方已经支持 Yance，也不宣称规范已冻结。
4. 若维护者反馈不希望讨论、仓库用途不匹配或 Issue 区仅收 Bug，立即停止，不换措辞重复发送。
5. 第二批根据第一批反馈调整；同一生态分支或上下游项目避免重复轰炸。
6. 任何实际发布都是代表项目对外沟通，必须由项目负责人确认最终标题、正文和目标仓库。
