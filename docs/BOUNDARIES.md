# 功能边界 / Product boundaries

## 第一版的实现范围

代码围绕线索处理提供网页表单、CSV、鉴权 Webhook、严格输入/模型输出校验、确定性业务规则、内置 CRM、跟进任务、字段修正、持久化节点记录、版本化审批、默认测试发件箱、显式启用的 SMTP Adapter、有限重试和人工恢复。前端状态来自服务端 API。n8n JSON 是实际 HTTP 编排，模型调用由 FastAPI 服务模块完成。

**实现范围不等于全部环境均已验证。** 验证矩阵和未解决问题见 `VERIFICATION.md`；任何未运行的 PostgreSQL、Docker、模型或外发测试不能被宣称通过。

## 不包含的能力

| 项目 | 当前边界 |
| --- | --- |
| 第三方 CRM | 只有 Adapter 扩展位置；没有 HubSpot、GoHighLevel、Salesforce 成功同步的声明 |
| 任意 Agent 编排 | 一个固定、可审核的线索流程；没有可让模型随意调用任意工具的平台 |
| 文档和票据 | CSV 线索可导入；没有 Excel、PDF、发票 OCR、订单文档提取 |
| 企业邮箱收件 | 不主动读取邮箱；邮件入口需要后续连接器开发 |
| ERP / 电商订单 | 未实现远端对接 |
| 多租户和多角色 | 单企业、单管理员；没有租户隔离、SSO 或销售/审批员 RBAC |
| 公开表单防滥用 | 已实现 `/intake`、蜜罐和每进程/IP 10 次/分钟限制；没有 CAPTCHA、分布式限流或营销反垃圾系统 |
| 完整 CRM 套件 | 联系人、公司、线索、任务和状态；没有商机预测、合同/账单、复杂销售漏斗 |
| 模型质量承诺 | 没有宣称固定准确率；结构合法不等于事实正确 |
| 模型商业授权 | 默认已实测的 `qwen2.5:1.5b` 使用 Apache 2.0；3B 仅有技术评估记录，商业用途需另行许可。具体来源见 [许可证依据](SOURCES_AND_NOTICES.md)；不宣称整系列统一授权 |
| 邮件送达承诺 | 测试箱成功不代表 SMTP 接收或收件箱送达；没有退信/信誉运营 |
| Exactly-once SMTP | 通用 SMTP 不提供该保证；不确定状态需人工核对 |
| 生产升级迁移 | 当前首次建表；没有承诺跨历史版本自动数据迁移 |
| 性能和 SLA | 未承诺并发规模、响应时延、容量或 24×7 SLA |
| 全量审计合规 | 有业务操作记录；没有防篡改审计存储或第三方合规认证 |
| 无人值守持续运营 | 提供后台 worker 和恢复机制；业务规则、模型质量和疑难投递仍需人员负责 |

## 必须如实展示的状态

- 配置缺失：显示缺失，不能用测试模板补上成功。
- 模型 API 错误：显示错误与恢复动作，不能假装已分析。
- `fixture` provider：只表示确定性测试。
- `local` engine：只表示真实后端步骤在本地执行器运行，没有证明 n8n。
- n8n API Key 未配置或历史被清理：原生终态 unknown，而不是推测为 success。
- 审批被拒绝：业务 rejected，不能转成已发送。
- 未配置外部 CRM：external configured false，不显示虚假同步。
- SMTP 结果不确定：需要核对，不能自动再次发送。

## 上线前由客户环境决定的工作

正式访问域名/HTTPS、身份和角色、数据留存、备份恢复、模型密钥与成本限额、标注集验收、实际 CRM 权限与字段、SMTP 认证/送达、运行告警和容量压测，均应成为客户合同的部署与验收项。它们不会因为本地演示通过而自动成立。

## English summary

The implemented scope is a fixed lead workflow with a real built-in CRM, durable execution and mandatory human approval. This release does not claim third-party CRM integrations, email ingestion, document OCR, ERP sync, multi-tenancy, RBAC, a general agent builder or production SLA. Test fixtures, a local engine and test outbox are explicitly different from a real model, n8n execution and SMTP delivery. The verification report, not the feature list, determines what was actually validated.

The commercial-delivery default is Apache-2.0 `qwen2.5:1.5b`. Passing a technical test does not grant commercial model rights: the evaluated 3B model requires separate permission for commercial use. Customers may configure other authorized models; licenses must be checked per specific version.
