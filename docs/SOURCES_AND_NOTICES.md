# 官方依据与第三方说明

检索日期：2026-11-05。以下链接用于版本、接口和许可核对；FlowPilot 的具体业务设计与报价测算属于本项目方案。

| 主题 | 官方来源 | 本项目采用的内容 |
| --- | --- | --- |
| n8n 版本和容器 | [官方 Docker 文档](https://docs.n8n.io/deploy/host-n8n/install-options/install-with-docker.md)；[npm n8n](https://www.npmjs.com/package/n8n) | 文档与 npm 查询均报告 stable 2.46.6，作为交付固定基线 |
| n8n Compose | [官方 Compose 文档](https://docs.n8n.io/deploy/host-n8n/install-options/install-using-docker-compose.md) | PostgreSQL 配置、持久化与 Compose 运行约定；本项目不启用其 AI sandbox 功能 |
| n8n CLI | [原生服务端 CLI](https://docs.n8n.io/deploy/host-n8n/configure-n8n/use-the-command-line.md) | import:credentials、import:workflow、publish:workflow。当前在线文档的热加载说明取决于 publication service；本次实际 2.46.6 命令实现要求重启，交付脚本按此执行并检查入口，见 [验证记录](VERIFICATION.md) |
| n8n 安全配置 | [安全环境变量](https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/security.md) | 禁止节点读取 env、配置文件权限、secure cookie |
| Webhook 认证 | [官方节点认证实现](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Webhook/utils.ts) | 使用 Header Auth 凭据，避免在 IF 中比较明文密钥 |
| n8n 许可 | [2026-10-06 更新 FAQ](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case)；[许可文本](https://github.com/n8n-io/n8n/blob/master/LICENSE.md) | 客户部署/咨询与自助工作流托管产品的许可边界 |
| Ollama 容器基线 | [v0.40.14 发布记录](https://github.com/ollama/ollama/releases/tag/v0.40.14) | 一个明确存在的可配置版本；不是“最新版本”宣传 |
| 商业交付默认模型 | [Ollama 的 qwen2.5:1.5b 页面](https://ollama.com/library/qwen2.5:1.5b)；[Qwen2.5-1.5B-Instruct 官方 LICENSE](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/blob/main/LICENSE) | 默认 `qwen2.5:1.5b`；两个来源均标示 Apache 2.0，真实业务链路已验收 |
| 3B 技术评估模型 | [Qwen2.5-3B-Instruct 官方 LICENSE](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/blob/main/LICENSE) | Research License：第 2.a 条限非商业研究/评估，第 2.b 条要求商业用途另行申请许可；不作为客户默认 |

## 模型默认值的交付决策

最终默认选择已通过 16 项实际链路断言的 `qwen2.5:1.5b`。选择依据同时包含执行证据与具体模型的许可；3B 的技术测试报告保持原样，不能据此推导其商业授权。客户可配置其他经授权模型，按实际版本保留对应许可和版权告知，不把 Qwen 整个系列视为统一许可证。模型权重不包含在源码交付包中。

## 依赖与交付权利

React、TypeScript、Tailwind、FastAPI、Pydantic、SQLAlchemy、PostgreSQL、n8n、Ollama、模型权重和所选容器镜像各自保留原有许可证。工作流 JSON 引用 n8n 的内置 HTTP/条件/错误节点以及随包自编的 FlowPilot 安全 Webhook 触发器，不包含 n8n 引擎源码或第三方商业许可。分发产品时应保留依赖要求的版权和许可告知；模型权重的使用条件需按实际所选模型核对。

n8n 的 Sustainable Use License 与普通宽松开源许可证不同。FlowPilot 自编代码和合同交付范围由项目所有者决定，不能替第三方授予更广的商业权利。文件中的报价是基于人日的方案估算，没有声称引用实际外包订单或市场成交价格。
