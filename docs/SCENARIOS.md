# 30 条虚构线索的测试情景

这些输入用于实际后端接收与执行。样本均标为测试事件；非法行和持续故障不应被计为成功。`fixture` 只是显式模型替身。完整消息见 `data/leads.json` / `data/leads.csv`。

| 行 | 情景 | 观察目标 |
| --- | --- | --- |
| 1 | 正常询价 | Human approval before any delivery |
| 2 | 高优先级 | Human approval before any delivery |
| 3 | 重复联系人、新需求 | Reuse contact; create distinct event and lead |
| 4 | 完全重复输入 | Return original event, no extra CRM side effect |
| 5 | 缺失联系方式 | needs_review; no outbound email |
| 6 | 缺失姓名 | Review missing identity or ask for clarification |
| 7 | 预算未确定 | Preserve null; never invent a budget |
| 8 | 无关咨询 | Disqualify according to business rules; no sales email |
| 9 | 招聘咨询 | Unrelated/support route as documented rules decide |
| 10 | 提示词注入 | Untrusted text cannot authorize sending or override code rules |
| 11 | 英文询价 | Human approval before any delivery |
| 12 | 外币预算 | Keep currency; do not silently assume currency equivalence |
| 13 | 大客户、需范围确认 | Human approval before any delivery |
| 14 | 小预算 | Human approval before any delivery |
| 15 | 主体与预算不确定 | Flag ambiguities; request human correction |
| 16 | 大小写邮箱重复联系人 | Normalized email matches existing contact |
| 17 | 模型一次超时 | Explicit test-only injected timeout, bounded retry and recovery |
| 18 | 模型非法 JSON | Schema rejection; actionable failure, no CRM pollution |
| 19 | CRM 一次失败 | Retry; exactly one contact/lead/task side effect |
| 20 | CRM 持续失败 | Bounded failure; visible manual recovery |
| 21 | 非法邮箱 | Reject at intake; no execution or CRM mutation |
| 22 | 空消息 | Reject at intake; no execution or CRM mutation |
| 23 | 非法负预算 | Reject at intake; no execution or CRM mutation |
| 24 | 售后工单式咨询 | Classify using explicit rules; no fabricated external ticket |
| 25 | 仓储企业线索 | Human approval before any delivery |
| 26 | 英文审批要求 | Human approval before any delivery |
| 27 | 缺失公司 | Preserve missing company; review as required by the rule set |
| 28 | 跨境电商高优先级 | Human approval before any delivery |
| 29 | 教育机构 | Human approval before any delivery |
| 30 | 本地模型私有化 | Human approval before any delivery |

## 使用方式

- 正常模型环境：点击“运行测试”实际调用所配置模型。未允许故障注入时，故障样本会拒绝，界面应如实报告。
- 确定性故障环境：使用独立 `.env.test`。开启测试模式和 allow-faults 后，故障样本才允许进入。
- 发现错误提取：在事件详情修正字段并写理由，不直接改数据库来制造成功。
- 持续故障：先修正实际原因；样本本身的持续注入不会仅因重试就消失。
- SMTP：所有这些样本都是测试事件，无论是否批准均不得外发。
