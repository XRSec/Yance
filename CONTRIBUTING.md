# 贡献指南

当前仓库只接受规划文档、契约草案、匿名测试材料和文档治理改进；没有可构建或安装的现行产品。

## 提交内容

1. 从[文档首页](docs/README.md)确认唯一事实源，避免复制正文。
2. 区分事实、提案与 **UNSPECIFIED** 决策；不得把规划写成已实现能力。
3. 对安全、平台、法律、人格与准确率主张提供官方或原始来源，并记录复核日期。
4. 遵循[文档风格](docs/contributing/docs-style.md)、[来源政策](docs/contributing/source-policy.md)和[本地化政策](docs/contributing/localization-policy.md)。
5. 运行 `python3 scripts/docs_qa.py`；可用时再运行 markdownlint 和 lychee。

`old/` 是只读语义的历史归档。仅可为修正文档中可证明的错误、危险指引或失效跳转做最小改动，不得把归档内容重新描述成现行实现。

不要在公开 Issue 中披露漏洞；请遵循[安全政策](SECURITY.md)。贡献不代表任何 License、维护者、响应 SLA 或发布承诺；这些事项均为 **UNSPECIFIED**。
