# 多 Agent 调研结论与来源

> 调研日期：2026-08-27。
>
> 本文是规划依据索引，不替代原始规范、论文、平台协议或正式法律意见。

## 1. 调研方式

本轮由六个独立研究 Agent 分别覆盖：

1. MCP 耦合层、权限、脚本与 token；
2. 人格、MBTI、大五、情感和长期变化；
3. 本地时序记忆、蒸馏、冲突与检索；
4. 中国隐私、安全、合规和平台条款；
5. 回复助手的人机协作体验；
6. 微信、闲鱼、小红书连接器生态。

最终规划由主会话交叉整理。研究资料优先采用官方规范、法律文本、平台协议、学术论文和高可信工程指南；社区项目只用于证明生态存在和已知故障，不作为平台能力或合法性的保证。

## 2. 关键研究结论

### 2.1 MCP

- MCP 标准化工具发现和 schema，不标准化跨服务器业务能力、权限等级、通用 dry-run 或脚本批准。
- 同平台多 MCP 的能力路由必须由宿主实现。
- 工具 annotations 不可信，不能据此放行发送。
- 成功调用可以脚本化，但脚本仍经过相同权限策略。
- 按需加载工具定义、本地处理循环和中间结果，可以显著降低 token；具体降幅必须实测。

主要来源：

- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP Architecture](https://modelcontextprotocol.io/specification/2025-11-25/architecture)
- [MCP Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [MCP Registry](https://modelcontextprotocol.io/registry/about)
- [Anthropic: Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [OWASP MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html)
- [OWASP MCP Tool Poisoning](https://owasp.org/www-community/attacks/MCP_Tool_Poisoning)

### 2.2 人格与情感

- 聊天文本支持的是特定关系、渠道和时间窗内的行为观察，不能可靠揭示固定人格或真实内心。
- MBTI 适合作为用户入口，但四字母切分会放大中点误差；应保留连续轴和候选类型。
- 大五在研究上更适合连续表示，但从聊天预测仍受样本、语言、平台和关系偏差限制。
- LLM 自报置信度不能当作准确率，需在目标中文数据上校准。
- 情感应区分明确自述、文本表达和第三方读者感知。
- 长期变化应检测持续行为偏移，而不是字母变化。

主要来源：

- [AERA/APA/NCME Standards for Educational and Psychological Testing](https://www.testingstandards.net/uploads/7/6/6/4/76643089/standards_2014edition.pdf)
- [Pittenger: The Utility of the Myers-Briggs Type Indicator](https://web.archive.org/web/20230902055656/https:/journals.sagepub.com/doi/10.3102/00346543063004467)
- [Bess & Harvey: Bimodal Score Distributions and the MBTI](https://doi.org/10.1207/s15327752jpa7801_11)
- [John, Naumann & Soto: Big Five Trait Taxonomy](https://www.bebr.ufl.edu/sites/default/files/bigfive.pdf)
- [Park et al.: Automatic Personality Assessment Through Social Media Language](https://doi.org/10.1037/pspp0000020)
- [Piastra & Catellani: ChatGPT-4 personality estimates](https://pmc.ncbi.nlm.nih.gov/articles/PMC11865037/)
- [Rao et al.: Can Third Parties Read Our Emotions?](https://aclanthology.org/2025.acl-long.1042/)
- [Roberts et al.: Patterns of Mean-Level Change in Personality Traits](https://eric.ed.gov/?id=EJ735270)

### 2.3 时序记忆

- 原始来源、事件、原子事实/观察、人物状态、周期快照和查询证据包应分层。
- 有效时间与记录时间必须区分，才能处理迟到信息和更正。
- 摘要和画像是派生物，不应成为不可追溯的真相源。
- 冲突证据需要共存，用户更正优先。
- 本地首版可用关系型存储 + JSON + 全文索引，不必先用图数据库。
- 本项目选择不长期复制原文，因此用来源 ID 回取原文，并明确失去离线复核能力的代价。

主要来源：

- [W3C PROV-DM](https://www.w3.org/TR/prov-dm/)
- [XTDB Bitemporality](https://v1-docs.xtdb.com/concepts/bitemporality/)
- [Azure Event Sourcing Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)
- [LongMemEval, ICLR 2025](https://proceedings.iclr.cc/paper_files/paper/2025/file/d813d324dbf0598bbdc9c8e79740ed01-Paper-Conference.pdf)
- [LoCoMo, ACL 2024](https://aclanthology.org/2024.acl-long.747/)
- [Recursively Summarizing Enables Long-Term Dialogue](https://arxiv.org/html/2308.15022v3)
- [SQLite JSON](https://sqlite.org/json1.html)
- [SQLite FTS5](https://www.sqlite.org/fts5.html)

### 2.4 回复体验

- 首版应是判断和表达副驾驶，不是自治聊天代理。
- 身份和目标可以自动建议，但必须可见、可纠正。
- 解释要锚定可见证据，不展示伪造的模型思维过程。
- 多候选应该代表不同策略和代价，而不是同义改写。
- AI 建议会影响用户语言和情绪，不能只优化积极、顺从和采纳率。
- 发送与生成分离，最终确认必须基于真实执行载荷。

主要来源：

- [Microsoft Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/wp-content/uploads/2019/01/Guidelines-for-Human-AI-Interaction-camera-ready.pdf)
- [Microsoft 人机交互工具包](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/)
- [Google PAIR: Explainability + Trust](https://pair.withgoogle.com/chapter/explainability-trust/)
- [Google PAIR: Feedback + Control](https://pair.withgoogle.com/chapter/People%20+%20AI%20Guidebook%20-%20Feedback%20+%20Control.pdf)
- [Apple HIG: Generative AI](https://developer.apple.com/design/human-interface-guidelines/generative-ai/)
- [NIST Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/nist.ai.600-1.pdf)
- [Problematic Email Reply Suggestions, CHI 2021](https://www.microsoft.com/en-us/research/wp-content/uploads/2021/02/assistiveWritingBiases-CHI.pdf)
- [AI in communication impacts language and social relationships](https://www.nature.com/articles/s41598-023-30938-9)

### 2.5 中国隐私与平台边界

- 群聊可见不等于允许商业产品持续收集、画像或外传。
- 人格、职场关系和交易风险推断属于高风险个人画像。
- 外部模型可能涉及委托处理、提供给其他处理者和数据出境。
- 微信、闲鱼、小红书对未授权第三方读取、抓取、插件或自动化存在不同程度限制。
- 最终确认降低误发风险，但不能消除平台条款风险。

主要来源：

- [中华人民共和国个人信息保护法](https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm)
- [中华人民共和国民法典人格权编](https://www.spp.gov.cn/spp/ssmfdyflvdtpgz/202008/t20200831_478416.shtml)
- [促进和规范数据跨境流动规定](https://www.cac.gov.cn/2024-03/22/c_1712776611775634.htm)
- [个人信息保护合规审计管理办法](https://www.cac.gov.cn/2025-02/14/c_1741233507681519.htm)
- [未成年人网络保护条例](https://www.gov.cn/zhengce/content/202310/content_6911288.htm)
- [微信服务协议](https://weixin.qq.com/agreement/service_agreement)
- [微信个人账号使用规范](https://weixin.qq.com/agreement/personal_account)
- [闲鱼软件许可使用协议](https://terms.alicdn.com/legal-agreement/terms/common_platform_service/20230509172204596/20230509172204596.html)
- [小红书官方协议入口](https://agree.xiaohongshu.com/h5/terms/ZXXY20220331001/-1)

### 2.6 平台连接器现实

- 腾讯官方微信 ClawBot 是 Bot 会话通道，不是个人微信已有好友和群聊读取 API。
- 闲鱼普通账号聊天读写主要来自社区逆向连接器，存在 Cookie、验证码、风控和封号问题。
- 主流小红书 MCP 主要覆盖内容与评论，私信不能视为成熟能力。
- 通用 MCP 首发可以承诺的是用户自备连接器接入、能力发现、权限和验证框架，而不是三平台统一收件箱开箱即用。

主要来源：

- [Tencent/openclaw-weixin](https://github.com/Tencent/openclaw-weixin)
- [BiboyQG/WeChat-MCP](https://github.com/BiboyQG/WeChat-MCP)
- [闲鱼开放平台](https://open.goofish.com/doc/development/dev/server.html)
- [DoLovya/xianyu-mcp-server](https://github.com/DoLovya/xianyu-mcp-server)
- [xpzouying/xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp)
- [小红书私信能力跟踪 issue](https://github.com/xpzouying/xiaohongshu-mcp/issues/782)
- [小红书开放平台授权流程](https://open.xiaohongshu.com/document/developer/file/38)

## 3. 证据缺口

1. 缺少可直接代表中文私人聊天的长期人格与情感基准。
2. 无法从公开研究得出统一最小消息数或可靠概率阈值。
3. 未用真实账号对各社区连接器做端到端验收。
4. 平台条款和 UI 会变化，上线前必须复核当时版本。
5. 未审阅具体云端模型供应商的合同、区域、训练和保留策略。
6. 群聊第三方画像、职场关系和数据出境需要正式法律意见。
7. 不长期复制原文会降低历史重算和逐字审计能力，需要真实用户验证该取舍。

## 4. 使用规则

- 研究事实变化时先更新本文，再更新相关规划文档。
- 社区项目 README 只能证明项目自述，不能写成官方平台能力。
- 学术相关性不能写成个体诊断准确率。
- 法律研究不能替代执业律师意见。
- 代表性 token 或准确率数字不能直接成为产品宣传。
