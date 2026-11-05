# 商业化交付范围与报价测算

## 推荐先销售的产品

“客户线索接收 + AI 结构化 + 内置 CRM + 邮件草稿审批”是第一份可固定边界的订单。以客户自有服务器/云账号部署，按客户资料调整业务规则，再用验收脚本交付。客户买的是一个明确业务流程、可追踪的执行结果与后续维护，不需要先购买一个泛用 Agent 平台。

当前适合展示的能力是：三种入口、信息提取、联系人去重、CRM 记录和跟进任务、人工修正、版本化审批、测试发件箱、可选 SMTP、失败记录与恢复。正式报价前应让客户提供至少 30–100 条脱敏历史线索和预期处理结果，用来确定字段与规则；这是一项建议的验收样本规模，不是已完成的准确率测评。

## 模型默认与授权范围

客户交付默认 `qwen2.5:1.5b`：已通过真实链路 16 项断言，使用 [Apache 2.0](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/blob/main/LICENSE)。3B 的报告保留为研究/评估记录；其 [Research License](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/blob/main/LICENSE) 要求商业用途另行取得许可，不纳入默认客户方案。合同应列明实际使用的模型/服务版本与授权来源；可以替换其他已获授权模型，许可和版权告知随实际依赖保留。

## 可选合同包

以下金额是**按工作量推导的报价建议**，不是市场平台统计或已成交行情。假设独立开发者的计价基准约为人民币 1000–1500 元/人日，另加范围和验收风险余量。根据真实需求、客户响应速度和合同责任重新核算。

| 交付包 | 明确包含 | 估算工作量 | 建议报价范围 |
| --- | --- | --- | --- |
| 基线部署与品牌定制 | 一个客户自有实例；Logo/名称；一个表单和 CSV；内置 CRM；规则调整；一次培训与验收 | 5–8 人日 + 小额风险余量 | ¥6,000–15,000 |
| 单个外部 CRM Adapter | 一个已授权的 HubSpot / GoHighLevel 等系统；约定字段；去重、重试、日志和端到端验收 | 4–8 人日，取决于 API 权限和现有数据 | 在基线上增加 ¥5,000–15,000 |
| 企业邮件入口与分类 | 一个邮箱/邮件 API；指定分类；草稿审批；失败恢复；专门测试集 | 4–8 人日 | 增加 ¥5,000–15,000 |
| 多人角色与审批 | 登录身份、销售/审批/管理员权限、审批分配和审计 | 7–12 人日 | 增加 ¥9,000–22,000 |
| 运维服务 | 每月约定 2–4 小时巡检/备份核查/小修；工作时段响应 | 按实际工时与服务约定 | 参考 ¥1,000–3,000/月 |

模型 API、需要另购的模型商业许可、SMTP 服务、域名、服务器、对象存储、n8n 商业许可和税费单列；不要承诺这些第三方费用由固定开发报价无限承担。GPU、本地模型硬件评测、客户历史数据清理和迁移也不自动包含。

## 第一单建议的范围控制

优先交付固定公司、一个审批人、一个流程、一种 CRM、一种邮件通道。把“能处理什么、遇到什么要人工确认、哪些动作永远不能自动执行”写入合同。下面这些需求会显著改变价格或风险，应另签变更：

- 复杂 Excel、PDF、发票/OCR 或多语言扫描件。
- 每个客户可以自行搭建工作流的 SaaS 平台。
- 多企业租户、SSO、细粒度 RBAC、跨区域部署。
- 大规模历史 CRM 合并、跨系统身份冲突清理。
- 高频并发、容量保证、24×7 SLA 和事故赔付。
- 自动外发销售邮件、触达合规、退信与信誉运营。

## 建议验收条款

1. 在客户实际环境提交约定测试集；逐条对照字段、分类和需要人工复核的结果。
2. 同一幂等键重发、同一客户新需求、重复批准都不产生重复业务动作。
3. 缺失信息与不合法模型 JSON 不被伪装为成功。
4. 只在指定人工批准之后产生投递动作；拒绝或仅保存不发送。
5. 故障与重启后，任务状态能解释，恢复操作有记录。
6. CRM 连接失败不会报告同步成功；未实现的系统不计入交付。
7. 客户使用的真实模型、PostgreSQL、n8n 和 SMTP 分别有环境化验收记录。
8. 准确率目标、人工复核率、响应时延和吞吐量用合同定义的样本与测量方法计算，不用未经测量的宣传数字。

## 付款与移交建议

可以使用“范围确认/启动、可操作联调、客户环境验收”三个里程碑，例如 40% / 40% / 20%。这是合同结构建议，不是必须条款。移交包含源码版本、配置清单、密钥归属说明、备份恢复步骤、已知限制和缺陷处理窗口。账号和正式服务密钥由客户持有，演示凭据不能进入生产。

## n8n 许可边界

n8n 不是可以随意按普通 MIT 软件转售的依赖。官方 2026-10-06 更新的 [许可 FAQ](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case) 说明：服务商可在客户自己的服务器安装管理；在自己实例上为客户运行固定流程、客户只收取结果的安排也有允许情形。让组织外的人创建或配置工作流，包括通过自建界面、API 或 Agent，会进入商业许可范围；托管 n8n 服务或白标也需要相应许可。

本交付选择客户自有实例、固定业务流程的定制路线。将它改成多客户自助编排平台前，应核实 n8n 当时条款并向其许可团队确认具体方案。FlowPilot 自编代码的商业授权由项目所有者在客户合同中约定，本仓库不能替第三方授予额外权利。

## English commercial summary

Sell a bounded customer-owned deployment first: one company, one workflow, one approver, built-in CRM and a defined email channel. The CNY ranges above are workload-based estimates, not observed market prices. Quote external adapters, multi-user identity, document processing and high-availability operations separately. Acceptance should verify actual customer infrastructure and a labelled test set. n8n retains its own license; a self-service workflow-authoring SaaS needs an explicit commercial licensing assessment.

The customer default is the validated Apache-2.0 `qwen2.5:1.5b` model. The 3B report is technical evaluation evidence; its Research License does not itself grant commercial use. Record the specific model and authorization in each deployment rather than assuming a license covers the whole family.
