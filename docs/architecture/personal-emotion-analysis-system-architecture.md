---
title: "个人对话情感计算与行为演化分析系统设计蓝图"
status: planning
audience: "架构与算法评审者"
owner: UNSPECIFIED
last_reviewed: 2026-10-24
source_of_truth: true
language: zh-CN
---

# Personal Emotion Analysis System Architecture
## 基于本地优先架构的个人对话情感计算与行为演化分析系统设计蓝图

> - **文档类型**: Google Gemini Deep Research 深度专业研究报告
> - **会话原链**: [https://gemini.google.com/app/d07a081a80792f09](https://gemini.google.com/app/d07a081a80792f09)
> - **公开分享**: [https://share.gemini.google/xl42QydkNRkP](https://share.gemini.google/xl42QydkNRkP)
> - **关联目标项目**: [XRSec/Yance (GitHub)](https://github.com/XRSec/Yance)
> - **进阶工程与数学拆解专著**: [personal-emotion-analysis-advanced-mechanisms.md](./personal-emotion-analysis-advanced-mechanisms.md)
> - **研究范围**: 多轮对话情绪识别 (ERC/DiaASQ)、用户行为动力学 (多元 Hawkes 点过程 / LSM 风格匹配 / BOCPD 变点检测 / Knapp-HMM 关系阶段建模)、本地优先多模态数据基础设施 (DuckDB / Kùzu / LanceDB / SQLite)、端云分级协同与 Agentic 决策闭环、系统评测体系与阶梯式落地规划。

---

## 目录

1. [研究思路与规划过程 (Deep Research Thinking)](#1-研究思路与规划过程)
2. [架构设计报告全文 (Architecture Blueprint)](#2-架构设计报告全文)
   - [系统定位与核心设计准则：解构 Yance 的工程范式](#系统定位与核心设计准则解构-yance-的工程范式)
   - [对话级情感计算与细粒度意图解析算法体系](#对话级情感计算与细粒度意图解析算法体系)
   - [用户行为动力学建模与时序变点检测算法](#用户行为动力学建模与时序变点检测算法)
   - [本地优先多模态系统架构与数据基础设施设计](#本地优先多模态系统架构与数据基础设施设计)
   - [前沿范式：端云分级推理、Agentic 策略编排与内存可信防御](#前沿范式端云分级推理agentic-策略编排与内存可信防御)
   - [系统评估指标体系与分阶段落地路线](#系统评估指标体系与分阶段落地路线)
3. [报告中使用的来源 (References & Footnotes - 共 32 项)](#3-报告中使用的来源)
4. [已查阅但未在报告中使用的来源 (Consulted Sources - 共 51 项)](#4-已查阅但未在报告中使用的来源)

---

## 1. 研究思路与规划过程

<details open>
<summary><b>展开查看 Gemini Deep Research 完整调研思考链与检索演进</b></summary>

#### ✦ 解析研究需求与目标

正在梳理针对个人情感与行为分析工具的整体研究方向。为了构建高专业的系统蓝图，需要从目标开源项目的架构定位入手，结合多轮对话情绪识别（ERC）、细粒度属性级情感分析（ABSA）以及时间序列变点检测等算法，探索端到端的技术架构选型。

#### ✦ 识别知识盲区与核心挑战

目前需要明确特定项目仓库（XRSec/Yance）的技术现状与功能规划，同时厘清如何将高精度的对话上下文建模与时序行为漂移检测算法高效融合。此外，如何在保证本地优先（Local-First）和隐私保护的前提下实现多模态数据的长周期存储与计算，也是解决系统架构设计的关键点。

#### ✦ 制定多维度检索与调研计划

接下来将首先针对目标开源项目进行检索与解析，提取其既有设计与架构定位；同时深入检索对话情绪识别的前沿学术成果（如SOTA算法）以及用户行为变点检测的统计学习方法，为后续系统层与算法层的详细对比评估提供数据支撑。

- **[github.com]** [XRSec/Yance: Local](https://github.com/XRSec/Yance) [^1]-first AI brain for personal relationships ... - GitHub

- **[github.com]** [Views · XRSec/Yance](https://github.com/XRSec/Yance/issues/views)- GitHub

- **[github.com]** [Yance/docs/product/README.md at main - GitHub](https://github.com/XRSec/Yance/blob/main/docs/product/README.md)

- **[github.com]** [Yance/CHANGELOG.md at main - GitHub](https://github.com/XRSec/Yance/blob/main/CHANGELOG.md)

- **[github.com]** [Yance/docs/validation/test-plan.md at main - GitHub](https://github.com/XRSec/Yance/blob/main/docs/validation/test-plan.md)

- **[github.com]** [Yance/docs/connectors/README.md at main - GitHub](https://github.com/XRSec/Yance/blob/main/docs/connectors/README.md)

- **[github.com]** [Yance/docs/intelligence/README.md at main · XRSec/Yance · GitHub](https://github.com/XRSec/Yance/blob/main/docs/intelligence/README.md)

- **[github.com]** [Yance/docs/connectors/README.md at main - GitHub](https://github.com/XRSec/Yance/blob/main/docs/connectors/README.md)

- **[github.com]** [07. 隐私、安全与合规边界](https://github.com/XRSec/Yance/blob/main/docs/reference/privacy-safety.md)- GitHub

- **[arxiv.org]** [Deep Emotion Recognition in Textual Conversations: A Survey - arXiv](https://arxiv.org/html/2211.09172v4) [^13]

- **[arxiv.org]** [arXiv:2203.02385v1 [cs.CL] 4 Mar 2022](https://arxiv.org)

- **[arxiv.org]** [arXiv:2403.07260v2 [cs.CL] 3 Mar 2025](https://arxiv.org)

- **[arxiv.org]** [Emotion Recognition in Conversation: Research Challenges ... - arXiv](https://arxiv.org/abs/1905.02947)

opentrain.ai

- **[arxiv.org]** [Emotion Transcription in Conversation: A Benchmark for Capturing](https://arxiv.org/abs/2603.07138)

- **[arxiv.org]** [Deep Emotion Recognition in Textual Conversations: A Survey - arXiv](https://arxiv.org/html/2211.09172v4) [^13]

- **[arxiv.org]** [AtmosERC: Modeling Dialogue-Level Affective Atmosphere ... - arXiv](https://arxiv.org/abs/2607.26726) [^8]

- **[opentrain.ai]** [Emotion Transcription in Conversation: A Benchmark for Capturing](https://www.opentrain.ai/papers/emotion-transcription-in-conversation-a-benchmark-for-capturing-subtle-and-compl--arxiv-2603.07138/)

- **[arxiv.org]** [arXiv:2012.08695v1 [cs.CL] 16 Dec 2020](https://arxiv.org)

- **[aclanthology.org]** [Multimodal Emotion Recognition in Conversations: A Survey of](https://aclanthology.org/2025.findings-emnlp.332.pdf) [^2]

解析目标项目定位

在初步探查中，我明确了开源项目 Yance 的基本定位与核心架构思想。该项目旨在构建一个“本地优先（Local-First）”的个人关系与沟通 AI 大脑，依托 Model Context Protocol（MCP）协议建立跨平台身份图谱、关系记忆与策略生成体系。这一发现为后续设计隐私安全与高敏个人数据处理架构奠定了基础。

梳理对话情绪与行为变点技术路线

针对对话情绪识别（ERC）与行为变更检测，我整理了最新的学术与工程方案。在 ERC 领域，多轮对话上下文建模（如图神经网络与长文本 Transformer）以及特定说话人特征注入（如 LaERC-S 架构）是捕捉微小情感波动的关键；在行为变更与漂移检测方面，时间序列变点检测（CPD）、隐马尔可夫模型（HMM）与序列模式挖掘为分析用户互动频率及情绪转变提供了稳健的统计学工具。

深入挖掘开源项目设计细节

接下来，我将深入调阅 Yance 仓库的具体产品规划与情报模块文档，重点提取其在数据集成、MCP 耦合层以及本地端侧推理方面的实现思路，以便将其优势融入到完整的技术蓝图中。

- **[github.com]** [XRSec/Yance: Local](https://github.com/XRSec/Yance) [^1]-first AI brain for personal relationships ... - GitHub

提取目标项目的核心架构与设计哲学

通过对目标开源项目的深度解析，我发现其定位是一个本地优先（Local-First）的关系与沟通智能决策系统。系统核心采用了“macOS 本地大脑 + Android 决策界面 + 多平台 MCP 链接器”的三层架构，强调人机协同（Human-in-the-Loop）与受控自动化，并制定了严苛的读取与发送权限隔离机制机制。针对聊天记录，该项目坚持事实证据与时间范围边界，避免将一次性行为过度标签化，这为后续的个人情感与行为分析系统奠定了安全与隐私基调。

厘清情感识别与行为漂移的关键算法挑战

为了实现深度的个人情感与行为变更分析，我意识到仅靠传统的单句情感分类远远不够。必须解决两个核心技术瓶颈：一是多轮对话中的情绪识别（ERC）与说话人依赖建模（如 GraphNN 或微调大模型），以及属性级细粒度情感提取（ABSA）；二是将互动频率、回复时延与情感极性转化为时间序列，利用变点检测（PELT、BOCPD）和点过程（Hawkes Process）来精准捕捉用户关系或行为模式的骤变与渐进式漂移。

规划端侧基础设施选型与系统蓝图构建

下一步我将重点深入研究前沿算法与端侧基础设施的融合方案。针对长周期多模态数据，我计划在本地优先架构中整合嵌入式图数据库（如 Kùzu）、嵌入式向量库（如 LanceDB）与分析型数据库（DuckDB），并结合 Apple Silicon 端侧小模型量化（MLX/GGUF）与 Agentic Workflow 机制。我将把这些技术梳理为涵盖数据 ETL、算法层、服务层和应用层的完整架构蓝图，并提供详细的算法对比矩阵与评估指标。

- **[arxiv.org]** [arXiv:2205.09263v2 [cs.LG] 7 Jul 2022](https://arxiv.org)

- **[arxiv.org]** [A Continuous](https://arxiv.org/pdf/1511.04145)-time Mutually-Exciting Point Process ... - arXiv

- **[arxiv.org]** [A Mutually Exciting Latent Space Hawkes Process Model for ... - arXiv](https://arxiv.org/html/2205.09263v2) [^19]

- **[par.nsf.gov]** [CHIP: A Hawkes process model for continuous-time networks with](https://par.nsf.gov/servlets/purl/10250504)

- **[arxiv.org]** [The Ancestor Hawkes Process with an Application to Group Chat Data](https://arxiv.org/html/2605.02613v1)

- **[arxiv.org]** [arXiv:1411.2674v3 [stat.ML] 27 Jan 2015](https://arxiv.org)

- **[arxiv.org]** [- **[proceedings.neurips.cc]** [CHIP: A Hawkes Process Model for Continuous-time Networks with](https://proceedings.neurips.cc/paper/2020/file/c5a0ac0e2f48af1a4e619e7036fe5977-Paper.pdf) [^20]](https://arxiv.org/html/1908.06940v3) [^18]

- **[alphaxiv.org]** [Modeling User Satisfaction Dynamics in Dialogue via Hawkes Process](https://www.alphaxiv.org/abs/2305.12594)

proceedings.neurips.cc

CHIP: A Hawkes Process Model for Continuous-time Networks with

- **[arxiv.org]** [Conversation Persistence in an Artificial Intelligence Agent Social](https://arxiv.org/html/2602.07667v2)

- **[computer.org]** [Semantic and Emotional Dual Channel for Emotion Recognition in](https://www.computer.org/csdl/journal/ta/2025/03/10900452/24AYC1lhExW) [^5]

- **[scispace.com]** [Directed Acyclic Graph Network for Conversational ... - SciSpace](https://scispace.com/pdf/directed-acyclic-graph-network-for-conversational-emotion-3w372cwzzl.pdf) [^6]

- **[sentic.net]** [Dialogue emotion model based on local–global context encoder](https://www.sentic.net/dialogue-emotion-model-based-on-commonsense-knowledge-fusion-attention.pdf)

- **[researchgate.net]** [Comparison among IEMOCAP, SEMAINE, EmotionLines, MELD](https://www.researchgate.net/figure/Comparison-among-IEMOCAP-SEMAINE-EmotionLines-MELD-and-DailyDialog-datasets_tbl2_334498503) [^9]

- **[researchgate.net]** [Exposing Weaknesses in Emotion Recognition in Conversations](https://www.researchgate.net/publication/414117385_Exposing_Weaknesses_in_Emotion_Recognition_in_Conversations) [^11]

- **[arxiv.org]** [Emotion Recognition in Conversation: Research Challenges ... - arXiv](https://arxiv.org/abs/1905.02947)

- **[ojs.aaai.org]** [SKIER: A Symbolic Knowledge Integrated Model for Conversational](https://ojs.aaai.org/index.php/AAAI/article/view/26541/26313) [^7]

- **[oaktrust.library.tamu.edu]** [ENHANCING EMOTION RECOGNITION IN TEXTUAL ... - OAKTrust](https://oaktrust.library.tamu.edu/server/api/core/bitstreams/0db73e68-91d2-428b-8299-56490f6c09b8/content)

- **[opentrain.ai]** [Emotion Transcription in Conversation: A Benchmark for Capturing](https://www.opentrain.ai/papers/emotion-transcription-in-conversation-a-benchmark-for-capturing-subtle-and-compl--arxiv-2603.07138/)

- **[openreview.net]** [Exposing Weaknesses of Large Language Models in Emotion](https://openreview.net/pdf?id=s1DsLik5hG) [^12]

深化对话情绪与时序点过程建模

正在深化对话情绪识别（ERC）与互动行为建模的技术细节。通过对比基于图神经网络（如 DialogueGCN）与指令微调大模型（如 InstructERC）的构架，我发现图结构能有效捕捉说话人状态与上下文依赖。同时，利用霍克斯过程（Hawkes Process）等点过程模型，能够精准量化对话中的轮替交互、互惠效应及情绪衰减，为分析用户行为动力学提供了有力工具。

整合行为变点检测与嵌入式存储体系

针对行为漂移与模式变更，我梳理了结合 PELT 剪枝算法、贝叶斯在线变点检测（BOCPD）与隐马尔可夫模型（HMM）的综合方案。在本地优先（Local-First）存储架构上，嵌入式图数据库（如 Kùzu）、列式分析引擎（DuckDB）与向量数据库（LanceDB）的组合能够以极低开销实现多模态关系图谱与长周期记忆的高效检索。

探索目标项目文档与架构集成

接下来，我将查阅目标开源项目仓库中的情报模块与产品设计规划，将其本地架构理念与前沿算法选型深入结合，准备构建最终的全栈系统技术蓝图与评估指标。

- **[github.com]** [Yance/docs/intelligence/README.md at main · XRSec/Yance · GitHub](https://github.com/XRSec/Yance/blob/main/docs/intelligence/README.md)

定位智能化模块的具体规划路径

通过查阅项目仓库中的智能能力规划文档，我确认了其核心重点在于“人物性格、情感与关系分析”。目前文档正处于规划阶段，强调基于证据链与时间域的严格边界判断，这证明该项目倾向于依赖基于事实的推断而非无依据的泛化预测。

解决细粒度情报模块的文件关联

为了获取更具体的算法落地思路与逻辑架构，我正在探寻智能分析模块下的关联子文档与技术细节，以打通从宏观架构规划到微观算法落地的完整逻辑链条。

检索具体文档并展开系统技术蓝图设计

下一步我将定位并解析智能模块的详细子目录文件，整合先前在对话情绪识别（ERC）、行为变点检测（CPD）以及端侧本地数据库选型上的调研，开始全面绘制涵盖数据层、算法层、服务层与应用层的技术蓝图与对比选型矩阵。

- **[techscience.com]** [Improve Chinese Aspect Sentiment Quadruplet Prediction via](https://www.techscience.com/cmc/v78n3/55910/html)

- **[scilit.com]** [Zengzhi Wang from Nanjing University of Science and Technology](https://www.scilit.com/scholars/019f2980d82172f2a485ef76ffac6102)

- **[researchgate.net]** [SetFitQuad: A Few-Shot Framework for Aspect Sentiment Quad](https://www.researchgate.net/publication/394781307_SetFitQuad_A_Few-Shot_Framework_for_Aspect_Sentiment_Quad_Prediction_with_Sampling_Strategies) [^14]

- **[aclanthology.org]** [Adding Flexibility to Aspect-Based Sentiment Analysis Evaluation](https://aclanthology.org/2025.naacl-long.603.pdf)

- **[aclanthology.org]** [Task](https://aclanthology.org/2025.emnlp-main.207v1.pdf) [^3]-aware Contrastive Mixture of Experts for Quadruple Extraction

- **[arxiv.org]** [Dialogues Aspect](https://arxiv.org/pdf/2508.05023) [^15]-based Sentiment Quadruple Extraction via ... - arXiv

- **[aclanthology.org]** [Sentimental Image Generation for Aspect-based Sentiment Analysis](https://aclanthology.org/2025.findings-acl.210.pdf)

- **[ojs.aaai.org]** [DanceHA: A Multi-Agent Framework for Document-Level Aspect](https://ojs.aaai.org/index.php/AAAI/article/view/40216/44177)

- **[arxiv.org]** [SuperLocalMemory: Privacy-Preserving Multi-Agent Memory ... - arXiv](https://arxiv.org/html/2603.02240v1) [^32]

- **[blog.logrocket.com]** [Designing a fully local RAG with small language models setup](https://blog.logrocket.com/local-rag-with-small-language-models/)

- **[medium.com]** [Privacy-Preserving AI: My Journey to a Self-Hosted RAG Pipeline](https://medium.com/dkatalis/privacy-preserving-ai-my-journey-to-a-self-hosted-rag-pipeline-085a1e1f5d7a)

- **[dr.lib.iastate.edu]** [PARROT: Privacy-focused agentic retrieval-augmented generation](https://dr.lib.iastate.edu/bitstreams/3f4aff1f-349d-4c52-98e8-66afb855b17d/download)

- **[github.com]** [skills](https://github.com/microsoft/ai-agents-for-beginners/blob/main/.agents/skills/local-ai-agents/SKILL.md) [^31]- local-ai-agents - GitHub

- **[huggingface.co]** [Daily Papers - Hugging Face](https://huggingface.co/papers?q=RAG)

- **[appliedaihub.org]** [The Complete Guide to Local-First AI & Data Privacy - Applied AI Hub](https://appliedaihub.org/blog/local-first-privacy-guide/)

- **[dev.to]** [VaultGuard-AI: Building a Local-First Hybrid Search RAG for Private](https://dev.to/exploredataaiml/vaultguard-ai-building-a-local-first-hybrid-search-rag-for-private-equity-intelligence-7k7)

- **[local-llm.net]** [What Is Local AI? A Complete Guide](https://www.local-llm.net/learn/what-is-local-ai/)

- **[wjarr.com]** [a privacy preserving personal ai assistant and the cost of cloud](https://wjarr.com/sites/default/files/fulltext_pdf/WJARR-2026-2606.pdf)

拓展对话属性提取与多 Agent 本地协作

正在深入探索对话级细粒度属性情感分析（DiaASQ）与最新多 Agent 协同提取框架。我发现针对复杂多轮对话，将说话人、属性、观点与情感极性整合为四元组结构，能够极大提升情感抽取的精确度。同时，研究表明利用本地轻量级多 Agent 协作与检索重排序（Adaptive Re-ranking），可以在不依赖云端 API 的前提下显著增强复杂情感推理与记忆检索效果。

解决隐私安全与端侧高性能算力的冲突

为了解决“个人高敏数据绝对私密”与“复杂 NLP/行为分析需强大算力”之间的矛盾，我通过调研端侧硬件加速（如 Apple Silicon MLX 统一内存架构）与差分隐私（Differential Privacy）噪声注入技术，找到了最佳平衡点。通过把敏感数据清洗（PII Filtering）与轻量抽取放在本地 SLM 执行，仅在极少数高度抽象场景下进行匿名化计算，保证了高隐私与低延迟。

补充人际关系阶段与行为漂移评估模型

下一步，我将针对人际沟通与关系演进理论（如 Knapp 关系阶段模型）进行深度交叉检索，补充行为漂移识别中的评估指标体系与基准测试方法，为最终绘制系统技术蓝图提供严密的数学与理论依据。

- **[arxiv.org]** [A Preliminary Mixed](https://arxiv.org/html/2508.13655v1) [^30]-Method Exploration of Human-AI Romantic

- **[researchgate.net]** [Relationship Management System: A Data-Driven Framework for](https://www.researchgate.net/publication/399362438_Relationship_Management_System_A_Data-Driven_Framework_for_Modeling_Monitoring_and_Restoring_Human-AI_Relationships)

- **[scribd.com]** [Key Elements of Effective Communication | PDF - Scribd](https://www.scribd.com/document/469678679/CHAPTER-TWO-COMMUNICATION-PROCESS-pdf)

- **[ai4robot.github.io]** [Developing Artificial Social Intelligence for Human-Care Robots](https://ai4robot.github.io/resources/minsujang_hri2018workshop.pdf)

- **[ibm.com]** [IBM Design for AI](https://www.ibm.com/design/ai/)

- **[researchgate.net]** [An Integrative Process Model of Romantic Human-Chatbot](https://www.researchgate.net/publication/412348857_Love_in_the_Age_of_AI_An_Integrative_Process_Model_of_Romantic_Human-Chatbot_Relationships)

- **[pubhtml5.com]** [ICOMM_ Interpersonal Concepts and Competencies_ Foundations](https://pubhtml5.com/kuly/zmuh/ICOMM__Interpersonal_Concepts_and_Competencies__Foundations_of_Interpersonal_Communication/)

- **[pmc.ncbi.nlm.nih.gov]** [Connectome-based prediction of marital quality in husbands ... - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9714425/)

- **[spiedigitallibrary.org]** [Performance measurement of Bayesian online changepoint](https://www.spiedigitallibrary.org/conference-proceedings-of-spie/13815/138150B/Performance-measurement-of-Bayesian-online-changepoint-detection-and-its-application/10.1117/12.3083595.full)

- **[researchgate.net]** [Bayesian Online Changepoint Detection | Request PDF](https://www.researchgate.net/publication/1771282_Bayesian_Online_Changepoint_Detection)

- **[aclanthology.org]** [EuroGames16: Evaluating Change Detection in Online Conversation](https://aclanthology.org/L18-1277.pdf) [^29]

- **[metricgate.com]** [Changepoint Detection: PELT, BinSeg, CUSUM - MetricGate](https://metricgate.com/blogs/changepoint-detection-methods/) [^26]

- **[ricerca.sns.it]** [Online learning of order flow and market impact with Bayesian](https://ricerca.sns.it/retrieve/7bc5e659-ed02-4124-9739-c07e31aa06db/Online%20learning%20of%20order%20flow%20and%20market%20impact%20with%20Bayesian%20change-point%20detection%20methods.pdf) [^28]

- **[nrc-publications.canada.ca]** [Real-time change point detection using on-line topic models](https://nrc-publications.canada.ca/eng/view/ft/?id=ae468b4e-c80f-4e4a-8546-8c92f9584cae) [^27]

- **[mql5.com]** [Bayesian Online Change-Point Detection (BOCPD) in MQL5](https://www.mql5.com/en/articles/23482)

ricerca.sns.it

Online learning of order flow and market impact with Bayesian

梳理语言风格匹配与关系阶段模型

在深化行为分析算法的过程中，我将语言风格匹配（LSM）公式与克纳普关系阶段模型（Knapp's Relational Stages）结合到了对话行为建模中。通过计算虚词使用频率的相似度以及隐马尔可夫模型（HMM）的状态转移，能够量化人际亲密度与关系升级或退化的演进轨迹。

精细化点过程与在线变点算法公式

为了更精准地解决行为漂移检测问题，我推演了霍克斯过程（Hawkes Process）的条件强度函数以及贝叶斯在线变点检测（BOCPD）的游程长度后验概率。这些数学公式为实时捕获用户回复时延突变、交互互惠性下降以及感情极性转折提供了坚实的理论支撑。

整合 MCP 耦合层与系统蓝图绘制

下一步，我将把目标项目的 MCP 接口层与数据流水线、端侧 AI 引擎及变点检测模块全面打通，开始撰写涵盖数据层、算法层、服务层与应用层的完整系统技术蓝图，并列出推荐的算法选型对比表与评估指标体系。

scholarworks.waldenu.edu

Language Style Matching in Older Couples and Marital Satisfaction

- **[static1.squarespace.com]** [Language Style Matching in Writing: Synchrony in Essays](https://static1.squarespace.com/static/5c17d328372b964a03d16eca/t/5db4734a2ca7a63a6d43f473/1572107082329/ireland_pennebaker_2010.pdf) [^22]

- **[ovid.com]** [Language Style Matching and Police Interrogation... : Law & Human](https://www.ovid.com/00011272-201408000-00006)

- **[scholarworks.waldenu.edu]** [Language Style Matching in Older Couples and Marital Satisfaction](https://scholarworks.waldenu.edu/cgi/viewcontent.cgi?article=1566&context=jsbhs) [^21]

- **[exprea.io]** [Language Style Matching: How the Smallest Words Predict ... - Exprea](https://exprea.io/blog/ireland-2011-language-style-matching-predicts-relationship-initiation-and-stability)

- **[sites.socsci.uci.edu]** [- **[researchgate.net]** [Language Style Matching Predicts Relationship Initiation and Stability](https://www.researchgate.net/publication/49675674_Language_Style_Matching_Predicts_Relationship_Initiation_and_Stability) [^24]](https://sites.socsci.uci.edu/~lpearl/courses/readings/IrelandEtAl2011_RelationshipPrediction.pdf) [^23]

- **[arxiv.org]** [A new approach to understanding coordination of linguistic style in](https://arxiv.org/html/1106.3077v1)

- **[languagelog.ldc.upenn.edu]** [Little words - Language Log](https://languagelog.ldc.upenn.edu/nll/?p=3164)

- **[faculty.wcas.northwestern.edu]** [For Review Only - Northwestern University](https://faculty.wcas.northwestern.edu/eli-finkel/documents/InPress_IrelandSlatcherEastwickScissorsFinkelPennebaker_PSci.pdf)

researchgate.net

Language Style Matching Predicts Relationship Initiation and Stability

语言风格匹配度与沟通动力学计算

正在深入探索基于心理语言学的功能词匹配度（LSM）算法。通过精确计算对话双方在代词、介词、连贯词等九类功能词上的使用相似度，能够量化人际交互中的隐性潜意识同步与关系亲密度。此外，结合霍克斯点过程（Hawkes Process）建模对话的响应延迟与突发性，进一步提升了对人际互动动态与互惠效应的捕捉能力。

关系演进阶段与行为变点模型融合

为了准确识别用户行为模式的渐变与突变，我将 Knapp 关系阶段理论与隐马尔可夫模型（HMM）、贝叶斯在线变点检测（BOCPD）进行了数学映射。这一结合成功解决了传统统计变点检测无法解释关系发展阶段（如亲密递进、平稳维护或冷淡避让）的难题，让行为变更分析兼具统计显著性与人际心理学可解释性。

#### ✦ 完成全栈技术蓝图设计与成果输出

目前针对系统架构、算法选型、端侧存储与安全隐私等所有维度的调研已全面完成。我正在整合全部分析成果，构建涵盖数据层、算法层、服务层与应用层的完整系统技术蓝图，并梳理算法对比矩阵与评估指标，准备输出最终的专业建议报告。

#### ✦ 初步研究收集了大量信息。我正在整理和组织这些信息，以确保整个项目流程顺畅，并涵盖您要求的所有关键点。

#### ✦ 就是这样！我要把所有东西都整合起来。记下我最后的想法，润色一切，确保给你我最好的作品。

</details>

---

## 2. 架构设计报告全文

# 基于本地优先架构的个人对话情感计算与行为演化分析系统设计蓝图

## 系统定位与核心设计准则：解构 Yance 的工程范式

构建面向个人即时通信（IM）环境的情感与关系智能分析系统，其系统设计的首要挑战在于如何在极度私密、高频多变且跨平台的碎片化数据流中，建立既具备深度语义洞察力又符合严格隐私合规边界的计算架构。开源项目 `XRSec/Yance` 确立了“基于模型上下文协议（Model Context Protocol, MCP）构建的本地优先（Local-First）个人关系与沟通智能大脑”这一系统定位[^1]。与传统依赖集中式云端数仓的社会化聆听或客服质检系统不同，该系统从数据主权、人机权责与关系本体论三个维度确立了底层架构准则。

系统确立了“本地优先与数据所有权绝对闭环”的物理边界。长周期记忆图谱、动态特征指标与各平台连接器凭证严格持久化于用户的本地宿主机（如 macOS 环境）[^1]。在数据留存机制上，系统摒弃了全量聊天正文集中复制的冗余方案，实施“原始文本不落地”的极简持久化准则：多平台原始聊天正文默认留存于各平台本地数据库或用户手动导入的冷备份中，核心计算引擎仅对消息元数据（时间戳、发送接收拓扑、消息唯一指纹）以及提炼后的事实陈述、行为特征向量和用户纠偏记录进行结构化存储[^1]。当特定深度审计场景需要调取原始文本时，系统通过标准消息标识符（Source ID）向底层平台连接器发起瞬时回溯，避免了集中式数据汇聚带来的隐私泄露风险[^1]。

在认知与控制权能方面，系统实行严格的“分析建议与发送授权物理隔离”[^1]。大语言模型或统计模型生成的回复草案、策略建议仅具备只读与呈现权能，绝不直接等同于系统的外发授权[^1]。为此，架构层设计了 P0 至 P4 的分级权限状态机：P0 对应于工具自省与元数据健康探测，P1 对应于单会话/单联系人时间窗口内的受限只读，P2 覆盖本地与受限网络检索，P3 允许生成本地草案与临时标签，而引发外部状态变更的副作用操作（如实际发信、修改公开资料）被严格归类为 P4 级别[^1]。所有 P4 操作必须将目标载荷计算为不可逆密码学散列值，并在独立于模型上下文的受信任用户界面（如 Android 决策终端）由人工完成显式确认，杜绝了模型因幻觉或外挂提示词注入而擅自触发通信行为的系统风险[^1]。

在对象建模范式上，系统打破了传统自然语言处理将对话视为同质文本流的扁平视角，确立了以“真实实体（Person）—平台账号（Account）—场景身份（Identity）”为核心的三层图谱模型[^1]。这种建模承认了人类在数字交互中的多面性与语境依赖性。系统避免对交互对象过早进行不可逆的静态心理学定性（如贴上永久的人格缺陷或性格标签），而是将每次分析结论严格限制在明确的时间跨度、交互场景与证据链条之内[^1]。在输出层面，系统聚焦于生成具有显式代价权衡的策略分支（如推进客观结果、维护情感关系、明确防守边界），而非肤浅的句式语调修饰，使智能计算真正服务于个体复杂的社交博弈决策[^1]。

## 对话级情感计算与细粒度意图解析算法体系

在多轮即时聊天场景中，自然语言呈现出高度口语化、断句碎片化、上下文强烈依赖以及富含讽刺、隐喻与反问的特征。传统的单句情绪极性分析（正面、负面、中性）无法捕捉动态交互中的心理嬗变，必须引入对话情绪识别（Emotion Recognition in Conversation, ERC）与对话属性级情感四元组抽取（Dialogue Aspect-Based Sentiment Quadruple, DiaASQ）构成双层语义解析网络[^2]。

### 对话情绪识别的演进机制与拓扑建模

在多方或双人多轮交互中，发言者在任意时间步的情绪状态受双重动力学驱动：一方面受自身情绪惯性与心理防卫机制主导（发言者内部依赖，Intra-speaker Dependency），另一方面受交谈对象的观点冲击、共情或对抗态度所牵引（跨发言者相互依赖，Inter-speaker Dependency）[^2]。现代 ERC 算法通过图神经网络与长短时自注意力机制显式建模这一过程。

基于图卷积的架构（如 DialogueGCN、DAG-ERC）将多轮对话重构为时序有向依赖图[^5]。在图拓扑中，每个发言单元（Utterance）作为特征节点，节点初始向量由预训练语言模型（如 RoBERTa 或微调的对话编码器）提取；节点之间的连接边则依据发言者身份标记与滑动时序窗口构建，分别赋予“自我历史边”与“对象交互边”[^5]。关系图卷积网络（RGCN）通过在拓扑结构中传播邻域特征，能够有效解耦特定发言者的情绪连续性与外部情绪刺激，抑制了因单句文本缺乏情绪词而导致的识别失真[^7]。

在时序注意力流派中，DialogXL 对传统自注意力掩码进行了重构，设置了全局感受野、局部上下文滑动窗口、发言者自注意力掩码以及针对倾听者的交互掩码，直接在多头注意力计算中内化了人际交互动态[^4]。更为前沿的 AtmosERC 则引入了对话全局情感氛围（Dialogue-Level Affective Atmosphere）的概念，通过图模型在捕捉局部微观情绪波动的同步，抽取全会话的宏观情感底色，有效解决了局部用词偏激但整体属于良性调侃的反讽识别难题[^8]。

针对复杂的认知推断与意图归因，生成式微调框架（如 InstructERC 与 LaERC-S）展现了超越纯判别式模型的性能[^10]。此类模型通过两阶段认知对齐，首先驱动轻量微调的大语言模型对发言者的潜在动机、心理防卫机制及交互角色进行隐式表征，随后将其转化为显式的结构化情感标签及情绪诱因（Emotion Cause）[^10]。在 MELD、DailyDialog 及 EmoryNLP 等公开评测基准上的实证表明，由于即时聊天中中性情绪往往占据主导地位（DailyDialog 数据集中性样本占比超过 80%），导致恐惧（Fear）、厌恶（Disgust）等高风险但极度稀疏的负面情绪在常规推理中极易被吞没[^11]。因此，系统必须在线上流水线中配置具有类别重加权机制的损失函数（如 Focal Loss），或采用基于原型网络（Prototypical Networks）的少样本自适应模块，以确保高危社交情绪信号的敏感捕获[^13]。

### 对话属性级情感四元组抽取

单纯识别离散的情绪标签不足以支撑精确的沟通决策。在二手交易协商（如闲鱼维权）、商务推进（如钉钉、飞书协作）等具体业务场景中，算法必须准确定位争议焦点与诉求客体。对话属性级情感四元组抽取（DiaASQ）旨在从非连续的多轮对话流中，解耦出结构化的情感四元组集合[^3]：

$$
\mathcal{Q} = \{(t_i, a_i, o_i, p_i)\}_{i=1}^{\vert{}\mathcal{Q}\vert{}}
$$

其中  $t_i$  为评价目标（Target）， $a_i$  为具体属性维度（Aspect，如发货时效、商品成色、响应态度）， $o_i$  为观点表达片段（Opinion Span）， $p_i \in \{\text{Positive}, \text{Negative}, \text{Neutral}\}$  为针对该属性的情感极性[^3]。

DiaASQ 的技术瓶颈在于，评价属性与观点词常常跨越数个发言轮次，并伴随严重的代词省略与上下文指代[^3]。最先进的工程实现采用结构熵最小化划分（DSEM）算法将复杂的树状对话历史划分为具有高度语义自洽性的子对话簇，再利用统一的网格标记（Grid Tagging）框架或端到端生成模型（如 SetFitQuad）完成实体边界与配对关系的联合解码，克服了级联抽取带来的错误传递问题，使得系统能够精准输出“针对价格条款表现出反感”或“针对技术方案表现出认可”等细粒度洞察[^14]。

| 算法架构类别 | 代表模型与范式 | 核心数学与表征机制 | 关键工程优势 | 算力与计算资源约束 |
| --- | --- | --- | --- | --- |
| **关系图神经网络 (RGCN)** | DialogueGCN[^5], DAG-ERC[^6] | 基于发言者拓扑图的跨轮次特征消息传递聚合 | 显式解耦自我情绪惯性与对方情绪感染，鲁棒性强 | 需预先解析指代拓扑，长上下文显存开销随节点数二次方增长 |
| **时序注意力重构** | DialogXL[^4], AtmosERC[^8] | 多通道注意力掩码（角色/全局）与宏观氛围向量融合 | 兼顾全会话基调与瞬时微表情，长序列稳定性优异 | 对无标点符号、超短断句口语的局部语义边界敏感度受限 |
| **指令驱动大模型生成** | InstructERC[^10], LaERC-S[^10] | 序列到序列生成，融入主体心理状态表征与诱因提取 | 上下文理解与隐喻反讽识别极高，输出具备因果解释力 | 参数量大，端侧执行需采用低比特深度量化与投机解码 |
| **少样本四元组抽取** | SetFitQuad[^14], DiaASQ-Parser[^3] | 对比学习表征结合结构熵最小化子图划分与网格填充 | 极低标注样本冷启动，实现属性、观点与极性的端到端抽取 | 跨越 5 轮以上的远距离跨度关联仍存在边界退化概率 |

## 用户行为动力学建模与时序变点检测算法

人际交往中的深层态度变化往往无法完全通过字面语义即时体现，言不由衷、刻意客套或冷处理等行为模式更显著地投射在物理交互规律之中。系统必须跳出纯粹的自然语言表征，从交互时序点过程、心理语言学特征对齐以及状态空间演化的宏观视角，构建全方位的行为动力学分析引擎。

### 交互时序点过程：多元互激发霍克斯过程

即时通信中的消息收发具有典型的突发聚集性与级联激发特征。单条消息的到达不仅是孤立的随机事件，更会引发后续消息在时间维度上的密集反馈，这一现象必须通过多元相互激发的霍克斯过程（Multivariate Mutually Exciting Hawkes Process）进行量化建模[^16]。

对于会话双方案例中的实体  $u$  与实体  $v$ ，将  $u$  在时刻  $t$  主动向  $v$  发送消息的瞬时强度（发信概率速率）定义为条件强度函数  $\lambda_{u \to v}^*(t)$ [^17]：

$$
\lambda_{u \to v}^*(t) = \mu_{uv} + \sum_{t_i < t, u \to v} \alpha_{\text{self}} e^{-\beta_{\text{self}} (t - t_i)} + \sum_{t_j < t, v \to u} \alpha_{\text{recip}} e^{-\beta_{\text{recip}} (t - t_j)}
$$

该数学公式严谨地解构了人类交互的三种核心驱动力：

- 长期沟通基线强度  $\mu_{uv}$  刻画了即使在没有近期消息刺激的情况下，实体  $u$  主动发起沟通的固有倾向，反映了该关系在用户生活中的基础权重[^17]；
- 自激发跳跃项  $\alpha_{\text{self}}$  与衰减率  $\beta_{\text{self}}$  刻画了追发行为动力学，即实体  $u$  在未收到对方回复时连续追发短消息的紧迫度与焦虑水平[^17]；
- 互激发跳跃项  $\alpha_{\text{recip}}$  与衰减率  $\beta_{\text{recip}}$  刻画了人际互惠响应强度（Reciprocity），即受到实体  $v$  的消息刺激后， $u$  产生回应冲动的增益幅度及其衰退半衰期[^17]。

通过最大似然估计（MLE）持续校准各通信链路的点过程参数，系统能够获得极其灵敏的关系失衡指标。当跨周期拟合发现某联系人的  $\alpha_{\text{recip}} / \beta_{\text{recip}}$  出现单调持续衰退，而本地用户的  $\alpha_{\text{self}}$  显著上升时，表明人际权能与情感卷入度发生非对称倾斜，为后续策略生成提供底层的物理规律支撑[^19]。

### 心理语言学对齐：语言风格匹配度

在社会心理学领域，心理学家 James Pennebaker 与 Molly Ireland 证实的语言风格匹配（Language Style Matching, LSM）理论表明，当两个人处于高度共鸣、投入或协商对等状态时，会下意识地同步各自在非内容虚词（Function Words）上的使用比例[^21]。虚词是大脑非意识加工的产物，因而在揭示社交距离与权力动态方面比实词语义更难以伪装[^21]。

LSM 模型严格围绕九类核心虚词展开高频统计：人称代词（Personal Pronouns）、非人称代词（Impersonal Pronouns）、冠词（Articles）、连词（Conjunctions）、介词（Prepositions）、助动词（Auxiliary Verbs）、高频副词（Adverbs）、否定词（Negations）以及量词（Quantifiers）[^21]。

对于会话双方的文本语料集  $D_1$  与  $D_2$ ，特定类别  $c$  的风格匹配度由归一化绝对差异公式界定[^21]：

$$
LSM_c = 1 - \frac{\vert{}f_{1,c} - f_{2,c}\vert{}}{f_{1,c} + f_{2,c} + \epsilon}
$$

其中  $f_{1,c}$  与  $f_{2,c}$  分别为虚词类  $c$  在发言者 1 和发言者 2 各自总词汇量中的出现频率， $\epsilon = 0.0001$  为抗除零平滑常数[^21]。会话全局风格对齐指标即为该九个维度的宏观算术均值[^21]：

$$
LSM = \frac{1}{\vert{}C\vert{}} \sum_{c \in C} LSM_c
$$

LSM 的输出严格分布于  $[0, 1]$  区间。实证标准确立了其参考基准： $LSM \ge 0.85$  表明双方在潜意识层面高度拟合与共情；而当  $LSM \le 0.65$  时，则反映出明显的心理隔阂、认知疏离或权力博弈中的抵触情绪[^21]。通过在流式滑动窗口中追踪该指标的轨迹，系统能够无感监测情感温度的渐进式冷却[^23]。

### 时序变点检测：贝叶斯在线变点检测算法

用户行为与人际关系并非恒定不变，其交互模式常因现实生活中的关键转折事件（如职务调动、情感破裂、利益冲突）而发生结构性突变（Structural Breaks）[^26]。传统的离线变点算法（如 PELT、二分分割法）要求获取全时段完整时序，无法适应日常沟通流的即时预警[^26]。因此，系统采用基于共轭指数族的贝叶斯在线变点检测（Bayesian Online Changepoint Detection, BOCPD）算法[^26]。

BOCPD 的核心机制在于维护当前时步平稳运行长度（Run Length）  $r_t$  的后验概率分布[^29]。 $r_t$  代表从最近一次突变点发生到当前时刻  $t$  所持续平稳累积的时间步长[^29]。其后验递归演进遵循概率图模型的全概率展开[^29]：

$$
P(r_t \vert{} x_{1:t}) \propto \sum_{r_{t-1}} P(r_t \vert{} r_{t-1}) P(x_t \vert{} r_{t-1}, x_t^{(r)}) P(r_{t-1} \vert{} x_{1:t-1})
$$

在状态转移先验  $P(r_t \vert{} r_{t-1})$  中，状态转移呈现出二元确定性分支：如果检测到行为模式重置（发生变点），运行长度直接归零（ $r_t = 0$ ），其发生的先验概率由离散风险函数（Hazard Function）  $H(r_{t-1} + 1)$  给出；若系统保持平稳，运行长度则确定性递增（ $r_t = r_{t-1} + 1$ ），对应先验概率为  $1 - H(r_{t-1} + 1)$ [^29]。

系统输入 BOCPD 模型的观测向量  $x_t$  整合了前述算法的综合衍生特征：

$$
x_t = \left[ \Delta t_{\text{reply}}, LSM_t, \text{Ratio}_{\text{neg}}, \text{Len}_{\text{ratio}} \right]^T
$$

涵盖了平均响应延迟、当前轮次 LSM 指标、负面情绪出现频次以及双方单次消息长度比。当递归计算出的后验归零概率  $P(r_t = 0 \vert{} x_{1:t})$  突破动态置信阈值时，系统立即断定该关系发生模式突变，防止策略编排层继续使用失效的历史经验进行误导性推荐[^26]。

### 关系演化态势分析：Knapp 阶段模型与隐马尔可夫模型

为了将低阶的物理特征升华为符合人类认知的宏观态势，系统借鉴人际传播学经典的 Knapp 关系发展阶段模型（Knapp's Relational Stages Model）[^30]。该理论将人际交往划分为聚合（Escalation）与解离（Termination）两条演进路径，细分为从接触、探索、深化、整合、结合，到分化、划界、停滞、回避直至终结的十个离散阶段[^30]。

系统构建一阶隐马尔可夫模型（Hidden Markov Model, HMM）或连续时间隐半马尔可夫模型（HSMM），将 Knapp 阶段设定为隐状态集合  $S = \{s_1, \dots, s_{10}\}$ ，将霍克斯过程参数、LSM 指标、ERC 情感状态及变点信号构造成多维高斯发射分布。通过前向-后向算法与 Viterbi 解码，系统能够推断当前联系人所处的深层关系阶段。当系统识别到状态从“深化（Intensifying）”异常跳变为“划界（Circumscribing）”时，即使表面文字依旧客套，系统仍会自动下调自动回复的授权级别，启动防卫性沟通策略。

| 行为计算模块 | 底层数学与统计物理模型 | 观测与输入特征项 | 系统洞察与业务决策含义 | 算法计算复杂度 |
| --- | --- | --- | --- | --- |
| **时序响应点过程** [cite: 17, 18] | 多元自/互激发时序泊松过程，条件强度指数核函数 | 毫秒级时间戳序列、消息交互流向二元组 | 量化主动沟通基线  $μ$ 、追发焦虑系数  $αself​$  与互惠系数  $αrecip​$ | 准实时递推拟合， $O(K⋅N)$  计算开销，无需 GPU 支持 |
| **语言风格匹配 (LSM)** [cite: 21, 23] | 9 类功能虚词出现频率的加权相对差异度量 | 分词流、高频虚词形态特征词典 | 评估双方非受控潜意识层面的心理共鸣度与权力对等性 | 极低（ $<5ms$ ），完全依赖纯规则哈希词典查找 |
| **在线变点检测 (BOCPD)** [cite: 26, 29] | 指数族共轭先验下运行长度  $rt​$  的贝叶斯在线推断 | 滑动时序特征向量  $xt​$ （延迟、LSM、情感极性） | 毫秒级捕捉行为断崖式突变，防范欺诈、冷暴力与异常状态 | 剪枝优化后空间与时间复杂度维持在  $O(rmax​)$ |
| **关系宏观态势 (Knapp-HMM)** [cite: 30] | 具有结构化转移约束的一阶隐马尔可夫模型与 Viterbi 解码 | 上述点过程参数、LSM 分数及 DiaASQ 抽取的离散聚合特征 | 输出长期关系生命周期阶段判断（如由整合向停滞倒退），指导宏观策略 | 离线定时批处理（天/周级别），状态转移矩阵计算开销忽略不计 |

## 本地优先多模态系统架构与数据基础设施设计

为了承载上述算法在本地设备（如 macOS 环境）上的低延迟运行，并确保在异构平台扩展下的系统稳定性，系统必须摆脱重型分布式中间件的束缚，采用高内聚、轻量化、进程内（In-Process）的混合存储与微核架构。

### 系统逻辑分层与数据流转拓扑

系统整体架构纵向划分为四层体系，各层之间通过强类型契约与进程间通信（IPC）机制进行交互：

第一层为接入与连接器层（Connector Fabric Layer）。基于 MCP 协议构建标准解耦层（MCP Coupling Layer），将不同第三方平台的逆向接口或公开 API 抽象为统一样式的标准原子能力，包括消息流轮询、历史消息拉取、草案写入以及发送确认等操作[^1]。MCP 耦合层具备能力探查（Trial Run）与版本指纹机制，任何底层工具 JSON Schema 的非预期修改均会触发安全熔断，退回待审状态[^1]。

第二层为混合存储基础设施层（Storage & Fabric Layer）。本层全面采用嵌入式进程内存储引擎矩阵，杜绝额外启动独立驻留服务所带来的资源消耗与网络暴露面。关系主库采用 SQLite 配合预写式日志（WAL 模式），承担账号状态机、系统审计流与 P0–P4 权限契约的事务性落盘；时序与行为指标数仓选用嵌入式列式计算引擎 DuckDB，凭借其高效的向量化执行器承载海量消息时间戳、响应耗时、LSM 滚动指标与变点检测滑动特征的高速聚合计算；多维图拓扑存储采用专为属性图优化的嵌入式图引擎 Kùzu，用于高速存储与遍历实体身份图谱以及证据链引用网络；向量检索层则基于 Serverless 架构的 LanceDB 构建，依托磁盘索引格式在极小常驻内存下实现对事实摘要与典型案例的高性能语义召回。

第三层为算法与认知推理层（Intelligence Engine Layer）。此层划分为“本地高频轻量流处理”与“端云分级协同推理”两个计算子域。本地流处理器负责即时执行正则实体清洗、虚词统计、霍克斯参数滑动更新与 BOCPD 变点监控，所有敏感个人身份信息（PII）在此阶段完成不可逆的本地脱敏；深度语义推理子域则调度本地小模型（SLM）或在用户显式授权下调度云端大模型，执行 ERC 情感分类、四元组提取以及博弈对抗推演[^1]。

第四层为策略仲裁与应用呈现层（Presentation & Policy Layer）。主要由 macOS 后台守护治理中心与 Android 决策终端构成[^1]。系统依据底层算法输出的证据包，自动化生成推进结果、维护关系、防范设界三类具备显式代价值的策略草案，并在移动端 UI 上呈现差异比对（Semantic Diff），由用户完成最终的审查、编辑与签名确认[^1]。

| 基础设施类别 | 选型组件 | 部署与运行架构 | 系统核心承载职责 | 性能与资源消耗表现 |
| --- | --- | --- | --- | --- |
| **时序与行为数仓** | **DuckDB** | 进程内 C++ 动态链接库，零独立服务守护 | 承载交互时间戳时序流、点过程与 LSM 特征矩阵的高速流式滑动聚合计算 | 单核支持每秒千万行级列式矢量化过滤与聚合，内存按需动态释放 |
| **关系演化图谱** | **Kùzu** | 嵌入式原生图数据库引擎，紧凑二进制存储 | 存储 Person-Account-Identity 跨平台身份关联拓扑及带时效性的证据依赖网 | 万级节点子图跨多跳遍历延迟低于  $1ms$ ，内存占用比 Java 图数据库低  $80%$ |
| **语义记忆与索引** | **LanceDB** | 嵌入式 Serverless 向量库，基于 Apache Arrow | 管理提炼后事实摘要的密集向量嵌入，支持多模态案例库的混合近邻检索 | 原生支持磁盘向量索引无需全量载入内存，冷启动查询延迟在毫秒级 |
| **系统状态与事务** | **SQLite (WAL)** | 进程内嵌入式 SQL，单物理文件 | 存储连接器注册表、Schema 校验指纹、P0–P4 权限黑白名单与密码学审计日志 | 零外部依赖，极高的数据安全性与抗崩溃性，单进程写入吞吐  $>2000 writes/s$ |

## 前沿范式：端云分级推理、Agentic 策略编排与内存可信防御

为了在单机受限资源下实现工业级大模型的推理深度，同时在多平台外部接入环境下防范提示词注入与越权失控，系统需要融合端侧量化加速、自主智能体工作流与内存安全防护三大前沿理念。

### 端云协同多级推理与数据流态管控

系统在底层设计上彻底废除了将用户原始聊天记录整段直接转发至公有云大模型的朴素做法，构建起“端侧小模型清洗提纯—云端大模型无状态重度推理”的分级闭环[^1]。

在 macOS 宿主机本地，系统利用底层硬件加速框架（如基于 Apple Silicon 统一内存架构的 Metal / MLX 或 `llama.cpp`）常驻量化小语言模型（如 4-bit 量化的 Qwen2.5-7B-Instruct）[^31]。本地端侧 SLM 与规则引擎协同执行第一道工序：首先进行轻量级的实体识别与信息抽取，提取会话中的具体事件要素、约定时间与核心报价；随后实施确定性的可逆差分脱敏，将会话中出现的真实人名、手机号、地址、公司内部代号等 PII 字段，替换为标准化的占位符标识[^1]。

仅当遇到复杂的社交隐语、深层职场博弈对抗或高要求策略文本生成等本地小算力无法胜任的场景时，系统才依据任务需求组装脱敏后的“最小证据切片”[^1]。该切片在触发网络请求前，会在用户界面显式向用户透明展示即将外发的提供商名称、网络区域及字段详情，并在确认后通过受限安全通道发送至无状态云端模型[^1]。云端模型仅被视作算力推理节点，不具备数据持久化权限，严格遵循不保留日志与不参与模型二次训练的合规约束，计算完毕后立即销毁上下文[^1]。

### 基于 Agentic Workflow 的三策略生成与对抗反思

在回复策略的拟定上，系统摒弃了单一的线性 Prompt 补全模式，采用具备反思（Reflection）与对抗批判（Critique）机制的自主智能体工作流（Agentic Workflow）：

- 策略生成阶段：根据当前会话的目标实体特征与 Knapp 阶段状态，并行触发三组具有对抗性约束的生成 Prompt 链：

- 推进结果分支：以任务闭环为唯一函数导向，行文直接明确，压缩沟通周期，但提示其可能带来的施压感成本[^1]；
- 维护关系分支：以共情和消解冲突为优先导向，增加虚词呼应度与情绪抚慰用语，容忍推进进度的延宕[^1]；
- 设置边界分支：以风险隔离与免责为导向，严格模糊化处理承诺要约，阻断对方的不当索取[^1]。
- 批判与安全重构阶段：由独立的本地监督 Agent 对生成的草案执行事实一致性比对与语义漂移评估。核心规则包含：

- 严格检验草案中是否凭空引入了原始对话未曾约定的交割日期、赔付金额或排他性条款，杜绝模型幻觉承诺[^1]；
- 运行语义差异引擎（Diff Semantic Engine），对比用户原始草稿与模型润色稿在语气坚定度与责任承担度上的偏移距离[^1]；
- 激活反操纵过滤器，拦截任何包含 PUA 打压、蓄意欺瞒或利用他人弱点的策略输出，确保沟通辅助始终运行在建设性轨道上[^1]。

最终生成的三个候选版本携带明确的“收益—成本”评估矩阵，推送到 Android 客户端供用户最终裁决[^1]。

### 本地记忆防投毒与 MCP 连接器可信防御

当系统接入多个开放平台的第三方 MCP 插件时，系统面临严峻的安全威胁：外部恶意用户可能在聊天信息或平台页面中嵌入间接提示词注入（Indirect Prompt Injection）攻击代码，试图诱骗本地智能体利用 P4 权限向外泄露机密数据或覆盖核心记忆库。为了应对该威胁，系统融合了本地内存安全防御机制（借鉴 SuperLocalMemory 等规范）[^32]：

在记忆写入层面，系统确立了“来源不可篡改凭证（Provenance Tracking）”规范：长周期图谱中的任何实体状态更新，必须附带由本地系统签发的证据元组 `(Connector_ID, Timestamp, Message_Hash, Trace_Path)`[^1]。禁止大语言模型基于自身的归纳推理在没有真实证据支撑的情况下自主创造不可逆的事实节点[^1]。

在信任评估机制上，系统为每个通信管道与联系人建立基于 Beta-Binomial 分布的贝叶斯后验信任评分模型[^32]。当外部传入的文本流中高频包含试图绕过系统防护、违背既有事实或篡改系统设定的异常 Token 序列时，该信道的信任度积分呈指数级折损；一旦信任评分跌破安全阈值，系统自动熔断该连接器的上下文写入权能，将其降级为只读沙箱模式[^32]。

针对所有底层 MCP 连接器，系统执行严格的沙箱隔离策略：各平台连接器的认证凭证（如 Cookies、Token、Keychain）在物理上由宿主机独立密钥库保管，模型运行时仅能接触到经过安全代理处理后的抽象能力柄，绝对禁止模型上下文直接读取或拼接原始鉴权凭据[^1]。

## 系统评估指标体系与分阶段落地路线

为了保证系统能够从概念验证稳步走向工程可用，必须确立跨维度的客观量化评估标准，并规划循序渐进的系统演进节奏。

### 系统多维评测指标矩阵

系统的效能评估涵盖细粒度语义抽取、时间动力学拟合、变点预警时效、系统资源消耗以及安全合规水平五个核心维度。

| 评测维度 | 核心量化指标 | 基线目标阈值 | 评估计算方法与工业意义 | 异常响应与保护降级预案 |
| --- | --- | --- | --- | --- |
| **细粒度情感计算** | **Macro-F1 & 少数类召回率** [cite: 11] | 综合 Macro-F1  $\ge 0.72$ ；厌恶/恐惧类别召回率  $\ge 0.65$ | 衡量模型跨越严重类别不平衡时识别低频负面情绪的有效性[^11] | 置信度低于  $0.50$  时标记为“语义模糊”，抑制下游强断言[^1] |
| **时序行为拟合** | **事件流平均对数似然 (MLL)** [cite: 19] | 相比同阶平稳齐次泊松过程基线提升  $\ge 20\%$ | 评估 Hawkes 点过程模型对用户交互聚集与互惠行为预测的精准度[^19] | 自动退化为滑动经验均值估计，规避因局部样本稀疏引发的参数震荡 |
| **突变响应时效** | **检测时延步数 (Run-Length Delay)** [cite: 27] | 变点发生后平均判定时延  $\le 2$  轮交互；假阳性率  $\le 5\%$ | 评估 BOCPD 在线算法在关系模式突变时的捕获速度与虚警控制[^27] | 弹出非侵入式轻量确认通知，提示用户手动核验关系偏好[^1] |
| **端侧计算性能** | **端到端 P95 响应时延** | 本地规则与特征提取  $\le 10\text{ms}$ ；本地 SLM 推理  $\le 1200\text{ms}$ | 确保在本地设备低负载运行，峰值常驻物理内存占用  $\le 2.5\text{GB}$ | 启动队列背压机制，自动降低后台长程统计任务的执行优先级 |
| **数据安全边界** | **敏感信息泄露率 (PII Leakage)** [cite: 1] | 云端调用脱敏合规率  $100\%$ ；未确认 P4 拦截率  $100\%$ [cite: 1] | 验证系统针对真实身份信息与未授权副作用发信操作的刚性防护[^1] | 立即物理断开网络请求，回滚未确认事务，向系统日志记入安全告警[^1] |

### 阶梯式工程落地路线

系统构建应遵循“基础流水线稳固、统计物理层夯实、认知决策层升华”的演进节奏，分三个阶段逐步实现：

第一阶段为基础连接与持久化流水线工程（Core Plumbing & Data Fabric）。重点打通 MCP 标准连接器解耦层，优先实现主流通信平台本地数据库的只读解析，建立可靠的基于增量消息时间戳的水印同步机制[^1]。完成 SQLite 事务主库与 DuckDB 时序数仓的嵌入式初始化，建立标准化的 `Person-Account-Identity` 实体映射框架，实现消息元数据的高效清洗与结构化落盘[^1]。

第二阶段为统计动力学与端侧情感计算集成（Statistical Dynamics & Affective SLM）。在本地建立纯算法驱动的行为分析流水线，部署 9 类虚词的 LSM 动态匹配引擎与多元霍克斯过程在线参数估计器[^17]。上线 BOCPD 贝叶斯在线变点检测模块，实现基础沟通状态漂移的毫秒级捕捉[^29]。在端侧部署 4-bit 量化的小语言模型（如 Qwen2.5-7B），完成本地 PII 差分脱敏以及轻量级的 ERC 情绪识别与基础事实抽取[^1]。

第三阶段为 Agentic 决策闭环与人机协作自治（Cognitive Agent & Controlled UI）。引入 Kùzu 属性图引擎与 LanceDB 嵌入式向量索引，全面组装长期动态记忆与证据溯源网络。完成三策略编排工作流的端云分级协同部署，搭建“生成—反思—重构”的自动化对齐机制[^1]。全面联调 Android 决策交互终端，上线 P0–P4 权限状态机与单次发信密码学散列验权流程，最终交付兼具深层学术洞察力、严密工程自制力与绝对本地安全防御的下一代个人关系认知增强基础设施[^1]。

---

## 3. 报告中使用的来源

> 以下为正文中所有 `[^1]` ~ `[^32]` 引用角标对应的原始学术文献、技术论文与开源代码库：

[^1]: **[github.com]** [XRSec/Yance: Local-first AI brain for personal relationships ... - GitHub](https://github.com/XRSec/Yance)

[^2]: **[aclanthology.org]** [Multimodal Emotion Recognition in Conversations: A Survey of](https://aclanthology.org/2025.findings-emnlp.332.pdf)

[^3]: **[aclanthology.org]** [Task-aware Contrastive Mixture of Experts for Quadruple Extraction](https://aclanthology.org/2025.emnlp-main.207v1.pdf)

[^4]: **[arxiv.org]** [arXiv:2012.08695v1 [cs.CL] 16 Dec 2020](https://arxiv.org/pdf/2012.08695)

[^5]: **[computer.org]** [Semantic and Emotional Dual Channel for Emotion Recognition in](https://www.computer.org/csdl/journal/ta/2025/03/10900452/24AYC1lhExW)

[^6]: **[scispace.com]** [Directed Acyclic Graph Network for Conversational ... - SciSpace](https://scispace.com/pdf/directed-acyclic-graph-network-for-conversational-emotion-3w372cwzzl.pdf)

[^7]: **[ojs.aaai.org]** [SKIER: A Symbolic Knowledge Integrated Model for Conversational](https://ojs.aaai.org/index.php/AAAI/article/view/26541/26313)

[^8]: **[arxiv.org]** [AtmosERC: Modeling Dialogue-Level Affective Atmosphere ... - arXiv](https://arxiv.org/abs/2607.26726)

[^9]: **[researchgate.net]** [Comparison among IEMOCAP, SEMAINE, EmotionLines, MELD](https://www.researchgate.net/figure/Comparison-among-IEMOCAP-SEMAINE-EmotionLines-MELD-and-DailyDialog-datasets_tbl2_334498503)

[^10]: **[arxiv.org]** [arXiv:2403.07260v2 [cs.CL] 3 Mar 2025](https://arxiv.org/pdf/2403.07260)

[^11]: **[researchgate.net]** [Exposing Weaknesses in Emotion Recognition in Conversations](https://www.researchgate.net/publication/414117385_Exposing_Weaknesses_in_Emotion_Recognition_in_Conversations)

[^12]: **[openreview.net]** [Exposing Weaknesses of Large Language Models in Emotion](https://openreview.net/pdf?id=s1DsLik5hG)

[^13]: **[arxiv.org]** [Deep Emotion Recognition in Textual Conversations: A Survey - arXiv](https://arxiv.org/html/2211.09172v4)

[^14]: **[researchgate.net]** [SetFitQuad: A Few-Shot Framework for Aspect Sentiment Quad](https://www.researchgate.net/publication/394781307_SetFitQuad_A_Few-Shot_Framework_for_Aspect_Sentiment_Quad_Prediction_with_Sampling_Strategies)

[^15]: **[arxiv.org]** [Dialogues Aspect-based Sentiment Quadruple Extraction via ... - arXiv](https://arxiv.org/pdf/2508.05023)

[^16]: **[arxiv.org]** [arXiv:1411.2674v3 [stat.ML] 27 Jan 2015](https://arxiv.org/pdf/1411.2674)

[^17]: **[arxiv.org]** [arXiv:2205.09263v2 [cs.LG] 7 Jul 2022](https://arxiv.org/pdf/2205.09263)

[^18]: **[arxiv.org]** [CHIP: A Hawkes Process Model for Continuous-time Networks with](https://arxiv.org/html/1908.06940v3)

[^19]: **[arxiv.org]** [A Mutually Exciting Latent Space Hawkes Process Model for ... - arXiv](https://arxiv.org/html/2205.09263v2)

[^20]: **[proceedings.neurips.cc]** [CHIP: A Hawkes Process Model for Continuous-time Networks with](https://proceedings.neurips.cc/paper/2020/file/c5a0ac0e2f48af1a4e619e7036fe5977-Paper.pdf)

[^21]: **[scholarworks.waldenu.edu]** [Language Style Matching in Older Couples and Marital Satisfaction](https://scholarworks.waldenu.edu/cgi/viewcontent.cgi?article=1566&context=jsbhs)

[^22]: **[static1.squarespace.com]** [Language Style Matching in Writing: Synchrony in Essays](https://static1.squarespace.com/static/5c17d328372b964a03d16eca/t/5db4734a2ca7a63a6d43f473/1572107082329/ireland_pennebaker_2010.pdf)

[^23]: **[sites.socsci.uci.edu]** [Language Style Matching Predicts Relationship Initiation and Stability](https://sites.socsci.uci.edu/~lpearl/courses/readings/IrelandEtAl2011_RelationshipPrediction.pdf)

[^24]: **[researchgate.net]** [Language Style Matching Predicts Relationship Initiation and Stability](https://www.researchgate.net/publication/49675674_Language_Style_Matching_Predicts_Relationship_Initiation_and_Stability)

[^25]: **[aclanthology.org]** [Language Style Matching in Large Language Models - ACL Anthology](https://aclanthology.org/2025.sigdial-1.50.pdf)

[^26]: **[metricgate.com]** [Changepoint Detection: PELT, BinSeg, CUSUM - MetricGate](https://metricgate.com/blogs/changepoint-detection-methods/)

[^27]: **[nrc-publications.canada.ca]** [Real-time change point detection using on-line topic models](https://nrc-publications.canada.ca/eng/view/ft/?id=ae468b4e-c80f-4e4a-8546-8c92f9584cae)

[^28]: **[ricerca.sns.it]** [Online learning of order flow and market impact with Bayesian](https://ricerca.sns.it/retrieve/7bc5e659-ed02-4124-9739-c07e31aa06db/Online%20learning%20of%20order%20flow%20and%20market%20impact%20with%20Bayesian%20change-point%20detection%20methods.pdf)

[^29]: **[aclanthology.org]** [EuroGames16: Evaluating Change Detection in Online Conversation](https://aclanthology.org/L18-1277.pdf)

[^30]: **[arxiv.org]** [A Preliminary Mixed-Method Exploration of Human-AI Romantic](https://arxiv.org/html/2508.13655v1)

[^31]: **[github.com]** [skills - local-ai-agents - GitHub](https://github.com/microsoft/ai-agents-for-beginners/blob/main/.agents/skills/local-ai-agents/SKILL.md)

[^32]: **[arxiv.org]** [SuperLocalMemory: Privacy-Preserving Multi-Agent Memory ... - arXiv](https://arxiv.org/html/2603.02240v1)

---

## 4. 已查阅但未在报告中使用的来源

> 以下为 Deep Research 调研过程中全面检索并查阅、但未直接作为正文论断引用的拓展参考资源（共 51 项）：

1. **[github.com]** [Views · XRSec/Yance - GitHub](https://github.com/XRSec/Yance/issues/views)
2. **[github.com]** [Yance/docs/product/README.md at main - GitHub](https://github.com/XRSec/Yance/blob/main/docs/product/README.md)
3. **[github.com]** [Yance/CHANGELOG.md at main - GitHub](https://github.com/XRSec/Yance/blob/main/CHANGELOG.md)
4. **[github.com]** [Yance/docs/validation/test-plan.md at main - GitHub](https://github.com/XRSec/Yance/blob/main/docs/validation/test-plan.md)
5. **[github.com]** [Yance/docs/connectors/README.md at main - GitHub](https://github.com/XRSec/Yance/blob/main/docs/connectors/README.md)
6. **[github.com]** [Yance/docs/connectors/mcp-coupling-layer.md at main - GitHub](https://github.com/XRSec/Yance/blob/main/docs/connectors/mcp-coupling-layer.md)
7. **[github.com]** [07. 隐私、安全与合规边界 - GitHub](https://github.com/XRSec/Yance/blob/main/docs/reference/privacy-safety.md)
8. **[arxiv.org]** [arXiv:2203.02385v1 [cs.CL] 4 Mar 2022](https://arxiv.org/pdf/2203.02385)
9. **[arxiv.org]** [Emotion Recognition in Conversation: Research Challenges ... - arXiv](https://arxiv.org/abs/1905.02947)
10. **[opentrain.ai]** [Emotion Transcription in Conversation: A Benchmark for Capturing](https://www.opentrain.ai/papers/emotion-transcription-in-conversation-a-benchmark-for-capturing-subtle-and-compl--arxiv-2603.07138/)
11. **[arxiv.org]** [Deep Emotion Recognition in Textual Conversations: A Survey - arXiv](https://arxiv.org/abs/2211.09172)
12. **[arxiv.org]** [Emotion Transcription in Conversation: A Benchmark for Capturing](https://arxiv.org/abs/2603.07138)
13. **[arxiv.org]** [A Continuous-time Mutually-Exciting Point Process ... - arXiv](https://arxiv.org/pdf/1511.04145)
14. **[par.nsf.gov]** [CHIP: A Hawkes process model for continuous-time networks with](https://par.nsf.gov/servlets/purl/10250504)
15. **[arxiv.org]** [The Ancestor Hawkes Process with an Application to Group Chat Data](https://arxiv.org/html/2605.02613v1)
16. **[alphaxiv.org]** [Modeling User Satisfaction Dynamics in Dialogue via Hawkes Process](https://www.alphaxiv.org/abs/2305.12594)
17. **[arxiv.org]** [Conversation Persistence in an Artificial Intelligence Agent Social](https://arxiv.org/html/2602.07667v2)
18. **[sentic.net]** [Dialogue emotion model based on local–global context encoder](https://www.sentic.net/dialogue-emotion-model-based-on-commonsense-knowledge-fusion-attention.pdf)
19. **[aclanthology.org]** [Mitigating Linguistic Artifacts in Emotion Recognition for](https://aclanthology.org/2024.lrec-main.989.pdf)
20. **[oaktrust.library.tamu.edu]** [ENHANCING EMOTION RECOGNITION IN TEXTUAL ... - OAKTrust](https://oaktrust.library.tamu.edu/server/api/core/bitstreams/0db73e68-91d2-428b-8299-56490f6c09b8/content)
21. **[arxiv.org]** [Emotion Transcription in Conversation: A Benchmark for Capturing](https://arxiv.org/html/2603.07138)
22. **[github.com]** [Yance/docs/intelligence/README.md at main · XRSec/Yance · GitHub](https://github.com/XRSec/Yance/blob/main/docs/intelligence/README.md)
23. **[techscience.com]** [Improve Chinese Aspect Sentiment Quadruplet Prediction via](https://www.techscience.com/cmc/v78n3/55910/html)
24. **[scilit.com]** [Zengzhi Wang from Nanjing University of Science and Technology](https://www.scilit.com/scholars/019f2980d82172f2a485ef76ffac6102)
25. **[aclanthology.org]** [Adding Flexibility to Aspect-Based Sentiment Analysis Evaluation](https://aclanthology.org/2025.naacl-long.603.pdf)
26. **[aclanthology.org]** [Sentimental Image Generation for Aspect-based Sentiment Analysis](https://aclanthology.org/2025.findings-acl.210.pdf)
27. **[ojs.aaai.org]** [DanceHA: A Multi-Agent Framework for Document-Level Aspect](https://ojs.aaai.org/index.php/AAAI/article/view/40216/44177)
28. **[blog.logrocket.com]** [Designing a fully local RAG with small language models setup](https://blog.logrocket.com/local-rag-with-small-language-models/)
29. **[medium.com]** [Privacy-Preserving AI: My Journey to a Self-Hosted RAG Pipeline](https://medium.com/dkatalis/privacy-preserving-ai-my-journey-to-a-self-hosted-rag-pipeline-085a1e1f5d7a)
30. **[dr.lib.iastate.edu]** [PARROT: Privacy-focused agentic retrieval-augmented generation](https://dr.lib.iastate.edu/bitstreams/3f4aff1f-349d-4c52-98e8-66afb855b17d/download)
31. **[huggingface.co]** [Daily Papers - Hugging Face](https://huggingface.co/papers?q=RAG)
32. **[appliedaihub.org]** [The Complete Guide to Local-First AI & Data Privacy - Applied AI Hub](https://appliedaihub.org/blog/local-first-privacy-guide/)
33. **[dev.to]** [VaultGuard-AI: Building a Local-First Hybrid Search RAG for Private](https://dev.to/exploredataaiml/vaultguard-ai-building-a-local-first-hybrid-search-rag-for-private-equity-intelligence-7k7)
34. **[local-llm.net]** [What Is Local AI? A Complete Guide](https://www.local-llm.net/learn/what-is-local-ai/)
35. **[wjarr.com]** [a privacy preserving personal ai assistant and the cost of cloud](https://wjarr.com/sites/default/files/fulltext_pdf/WJARR-2026-2606.pdf)
36. **[researchgate.net]** [Relationship Management System: A Data-Driven Framework for](https://www.researchgate.net/publication/399362438_Relationship_Management_System_A_Data-Driven_Framework_for_Modeling_Monitoring_and_Restoring_Human-AI_Relationships)
37. **[scribd.com]** [Key Elements of Effective Communication | PDF - Scribd](https://www.scribd.com/document/469678679/CHAPTER-TWO-COMMUNICATION-PROCESS-pdf)
38. **[ai4robot.github.io]** [Developing Artificial Social Intelligence for Human-Care Robots](https://ai4robot.github.io/resources/minsujang_hri2018workshop.pdf)
39. **[ibm.com]** [IBM Design for AI](https://www.ibm.com/design/ai/)
40. **[researchgate.net]** [An Integrative Process Model of Romantic Human-Chatbot](https://www.researchgate.net/publication/412348857_Love_in_the_Age_of_AI_An_Integrative_Process_Model_of_Romantic_Human-Chatbot_Relationships)
41. **[pubhtml5.com]** [ICOMM_ Interpersonal Concepts and Competencies_ Foundations](https://pubhtml5.com/kuly/zmuh/ICOMM__Interpersonal_Concepts_and_Competencies__Foundations_of_Interpersonal_Communication/)
42. **[pmc.ncbi.nlm.nih.gov]** [Connectome-based prediction of marital quality in husbands ... - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9714425/)
43. **[spiedigitallibrary.org]** [Performance measurement of Bayesian online changepoint](https://www.spiedigitallibrary.org/conference-proceedings-of-spie/13815/138150B/Performance-measurement-of-Bayesian-online-changepoint-detection-and-its-application/10.1117/12.3083595.full)
44. **[researchgate.net]** [Bayesian Online Changepoint Detection | Request PDF](https://www.researchgate.net/publication/1771282_Bayesian_Online_Changepoint_Detection)
45. **[arxiv.org]** [[2307.02375] Online Learning of Order Flow and Market Impact with](https://arxiv.org/abs/2307.02375)
46. **[mql5.com]** [Bayesian Online Change-Point Detection (BOCPD) in MQL5](https://www.mql5.com/en/articles/23482)
47. **[ovid.com]** [Language Style Matching and Police Interrogation... : Law & Human](https://www.ovid.com/00011272-201408000-00006)
48. **[exprea.io]** [Language Style Matching: How the Smallest Words Predict ... - Exprea](https://exprea.io/blog/ireland-2011-language-style-matching-predicts-relationship-initiation-and-stability)
49. **[arxiv.org]** [A new approach to understanding coordination of linguistic style in](https://arxiv.org/html/1106.3077v1)
50. **[languagelog.ldc.upenn.edu]** [Little words - Language Log](https://languagelog.ldc.upenn.edu/nll/?p=3164)
51. **[faculty.wcas.northwestern.edu]** [For Review Only - Northwestern University](https://faculty.wcas.northwestern.edu/eli-finkel/documents/InPress_IrelandSlatcherEastwickScissorsFinkelPennebaker_PSci.pdf)
