# FlowPilot 产品演示脚本 / Demonstration script

## 演示前准备

演示公司是 **星舟数智 · Starbridge Automation**，一家虚构的 B2B AI 自动化服务公司。演示输入都使用保留域名 `example.com`，明确标为测试事件。先确认界面显示的模型 provider、执行 engine 与实际环境一致，SMTP 保持关闭。

真实 AI 演示使用配置好的 Ollama 或 OpenAI 兼容模型。回归测试模式可以展示事务与审批机制，但应开场说明“模型响应为测试替身”。不要把 fixture 或静态加载状态当作真实模型效果。

## 12 分钟中文演示

### 0:00–1:00：说明价值和边界

话术：“这次演示只做一件事：把客户询价变成结构化线索，完成 CRM 录入并准备跟进邮件。模型处理理解和起草，优先级和发送权由业务规则与人工审批控制。今天的邮件只进入测试发件箱。”

打开 Dashboard，展示真实待审批、错误和处理量。空库应如实为空，不提前填写虚假成功数量。指出当前模型和 n8n 状态。

### 1:00–3:30：提交一条线索

可以先打开客户公开表单 `/intake` 展示真实提交入口，再登录控制台查看处理。要保证本次演示保持测试数据，使用独立测试部署，或在 Inbox 的管理员新增表单中显式选择测试事件。填写：

- 姓名：陈时雨。
- 公司：远岚制造（虚构）。
- 邮箱：chen.yuanlan@example.com。
- 预算：260000 CNY。
- 消息：需要 AI Agent 自动整理询价邮件、同步 CRM 并生成销售跟进任务。集团有 120 人，计划下个月上线。
- 标记：测试事件。

提交后打开事件详情。逐项展示接收 ID、原始输入、模型提取、业务依据和节点耗时。观察真实 API 请求完成后状态推进；本地模型较慢时说明实际延迟，等待真实结果，不用动画假装完成。

### 3:30–5:00：解释 CRM 和规则

打开 CRM，找到同一事件生成的联系人、公司、线索和任务。展示高优先级来自 CNY 100000 的固定阈值，而非模型自行宣布客户重要。展示分配到重点客户队列的理由。

再使用同一联系人的另一条需求提交：增加企业微信接入，预算提高到 300000。说明“联系人复用”和“同一事件去重”是两个问题；新的需求保留为新线索。精确重发第一次输入时，展示重复识别而不是第二次创建全部数据。

### 5:00–7:30：展示人类控制

打开 Approvals，修改主题中的一个词和正文的一句跟进建议，保存。再次查看版本变化，再批准到测试发件箱。

打开 Outbox，确认收件人、主题和正文是刚才批准的版本，且只有一条。重复点击同一决策或重试已经完成的执行时，不应产生第二封邮件。说明这个默认动作没有任何外部 SMTP 发送。

### 7:30–9:00：展示信息不足与纠正

提交一条缺失邮箱或公司名称的事件。观察 `needs_review`。打开提取字段编辑器，补充正确字段并填写修正理由。继续执行后产生新的草稿版本。展示历史审计能够解释是谁修正了什么以及何时重新执行。

### 9:00–10:30：展示失败恢复

使用独立测试环境，在“运行测试”结果中找到 `crm_failure_once` 和 `crm_failure_always`。解释前者临时失败可恢复，后者有限重试后保留失败。

打开 Executions，展示错误码、节点与尝试次数。若要演示人工恢复，先消除故障原因，再点击重新执行。不要声称“持续失败”样本无需修复也能恢复；它就是为了证明系统不会把错误变成成功。

### 10:30–12:00：说明可定制和验收范围

展示 n8n 的真实工作流和实际 execution ID。指出管线已经结束但业务在等人工审批时，两层状态不同。介绍当前内置 CRM；如果客户需要 HubSpot、GoHighLevel 或 ERP，需要单独开发 Adapter 并验收。

结束话术：“交付包含源码、可部署环境、工作流、测试和使用说明。报价按客户具体入口、CRM 字段、审批人和异常恢复要求拆分。正式上线以客户环境的验收结果为准。”

## 演示中必须能回答的问题

| 客户问题 | 可核对的回答 |
| --- | --- |
| AI 会不会自己发邮件？ | 不能。后端必须读到当前草稿版本的人类批准与投递授权 |
| 同一条线索来了两次？ | 幂等键/内容指纹复用事件；数据库唯一约束阻止重复副作用 |
| 同一个客户提出新需求？ | 匹配已有 Contact，保留新的 Event / Lead |
| 模型抽错信息怎么办？ | 人工修正字段、写理由，重新执行后续规则与草稿 |
| 服务器重启怎么办？ | 事件、节点和审批在数据库中；worker 从持久化租约恢复 |
| CRM/API 失败是否悄悄跳过？ | 不跳过。有限重试、错误码与恢复入口可见 |
| 是否已经同步 HubSpot？ | 首版只有内置 CRM；没接入就明确说没接入 |
| 测试发件箱是否证明真实送达？ | 不证明。SMTP 是单独配置、授权和验收的外部动作 |
| 能否保证每次模型判断正确？ | 不能。结构校验和规则限制失败范围，业务准确率仍需标注集验证 |

## English demonstration — 10–12 minutes

1. **Scope.** “We turn an enquiry into a CRM lead and an approved follow-up. The model extracts and drafts; code enforces business rules; a human authorizes delivery. Today's mail stays in the test outbox.” State the actual model and engine, including any fixture mode.
2. **Submit.** Enter a fictional B2B enquiry with an explicit contact, company, email, currency and budget. Open its event detail and follow real node completion, not a scripted animation.
3. **Inspect.** Show extracted fields, the deterministic budget threshold, the resulting owner, and the contact/company/lead/task records. Submit a different enquiry from the same contact and distinguish contact matching from exact event deduplication.
4. **Approve.** Edit the draft, save the new version and approve to the test outbox. Confirm that the saved mail is the approved version. Repeat the action to demonstrate that a second delivery is not created.
5. **Correct.** Submit an enquiry with a missing email. Show the review pause, correct the extraction with a reason, and resume downstream processing.
6. **Recover.** In the explicit test deployment, inspect transient and persistent failure scenarios. Show bounded retries, the actual error and the recovery action. Fix a persistent cause before retrying.
7. **Close.** Open the real n8n workflow/execution. Explain native versus business status and identify the currently implemented built-in CRM. Scope external connectors, multi-user approvals and deployment work as separate customization, with the acceptance report as evidence.
