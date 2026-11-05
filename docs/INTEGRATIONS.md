# 外部系统配置 / Integration guide

## 模型

模型必须产生通过 Pydantic 校验的 JSON。系统不执行模型给出的工具命令，不接受模型批准邮件，也不把模型输出直接写入最终业务分类字段。

### Ollama

默认 `LLM_PROVIDER=ollama`、`LLM_BASE_URL=http://ollama:11434`、`LLM_MODEL=qwen2.5:1.5b`。使用 Compose 的 `ollama` profile 启动服务后，显式运行 `ollama pull` 拉取模型。API 使用 Ollama 的真实接口与结构化输出能力。模型名称必须与已安装的名称一致。

Ollama 默认线程数 `OLLAMA_NUM_THREAD=4`、上下文 `OLLAMA_NUM_CTX=16384`。这些配置可按客户机器调整；超过保守上下文预算的输入会报告 `MODEL_CONTEXT_LIMIT`，不会静默截断后继续。

商业交付默认 `qwen2.5:1.5b` 采用 [Apache 2.0](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/blob/main/LICENSE)，已通过真实 Ollama + n8n 链路的 16 项验收断言。3B 的同套通过结果只保留为技术评估；其 [Research License 第 2 条](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/blob/main/LICENSE) 要求商业使用另行取得许可。客户可换用其他经授权模型，须逐个核对实际版本的许可，详见 [官方来源](SOURCES_AND_NOTICES.md)。

验证结果见 [验证记录](VERIFICATION.md)，不构成生产准确率承诺。中文抽取、预算/币种、意图歧义和邮件事实应使用实际业务标注集验证；小模型可能需要更多人工复核。Mac 原生 Ollama 可使用宿主机硬件能力，Docker 内的此配置默认 CPU。

### OpenAI 兼容服务

在 Settings 配置以下字段，或用服务进程环境注入：

| 字段 | 内容 |
| --- | --- |
| `LLM_PROVIDER` | `openai_compatible` |
| `LLM_BASE_URL` | 服务商兼容 API 的根地址，通常以 `/v1` 结尾 |
| `LLM_MODEL` | 服务商实际支持的模型 ID |
| `LLM_API_KEY` | 该服务的 Key，不能放入前端构建环境变量 |
| `LLM_TIMEOUT_SECONDS` | 每次请求超时；部署时结合真实延迟设置 |
| `LLM_MAX_RETRIES` | 有限重试次数；需考虑服务商限流和调用成本 |

“OpenAI 兼容”不保证所有服务实现相同的严格 JSON Schema 功能。后端最终仍校验模型结果；不支持所需请求格式的服务会显式失败。请执行 Settings 的模型连接检查和严格 live-model 验收，不能仅靠 HTTP 200 判断兼容。

应用保存的模型 Key 和 SMTP 密码用 `FLOWPILOT_ENCRYPTION_KEY` 加密。备份数据库时同时备份该密钥到受控秘密管理位置；丢失密钥后，原有加密配置不能解密。环境变量也属于部署秘密，不能提交到源码。

## n8n

### 导入与认证

工作流文件是 `n8n/lead-pipeline.json`，依赖随包提供的 `CUSTOM.flowPilotWebhook` 安全触发器。Compose 用 `N8N_CUSTOM_EXTENSIONS=/opt/flowpilot/nodes` 自动挂载；原生进程部署需将该变量指向项目的绝对 `n8n/custom-nodes` 目录，重启 n8n 后导入。触发器只返回白名单 dispatch 字段，不把认证头写进原生执行历史；没有修改 n8n 引擎，也不依赖企业版脱敏特性。默认后端地址 `http://api:8000`，Webhook 路径 `/webhook/flowpilot`。凭据类型为 `httpHeaderAuth`，名字 `FlowPilot internal API`，ID `flowpilotInternalHeader1`；header 为小写 `x-flowpilot-internal`，值为部署独有的 `FLOWPILOT_INTERNAL_KEY`。

`python3 scripts/import-n8n.py` 将凭据通过 stdin 写入容器内临时 0600 文件，导入并执行原生 `publish:workflow`，再确认临时文件已删除。针对固定的 n8n 2.46.6，它会重启本项目专用 n8n 容器，并有界检查生产 Webhook 的预期未认证 401 响应，才报告激活成功；请在维护窗口运行。探测不携带密钥或有效业务事件，失败返回非零及恢复命令。Key 不进入导出的 Workflow JSON，节点也不需要读取环境变量。

如果不使用 Compose，通过生成器改后端 URL，再在 n8n 手工创建相同 Header Auth 凭据并重新绑定节点：

```bash
python3 scripts/generate-workflow.py --api-base http://127.0.0.1:8000 --output /tmp/flowpilot-local-workflow.json
```

### 原生执行状态同步

完成 n8n owner 设置后，在 Settings → n8n API 创建 Public API Key，允许读取 execution。若版本/许可允许细分 scopes，仅授予需要的读取权限。然后运行：

```bash
python3 scripts/configure-n8n-status.py
docker compose up -d api worker
```

测试环境给两个命令都添加 `.env.test` 对应选项。隐藏输入工具先请求 `/api/v1/executions?limit=1&includeData=false` 验证，再保存 Key。后台通过 `X-N8N-API-KEY` 调用原生 API，对账 n8n 的最终状态。没有 Key 时，节点回调仍执行真实业务，但原生终态不能完整确认；这属于尚未完成的部署配置。

### 日志与保留

n8n 只收到执行 ID、阶段和派发 fence；不会收到原始线索、模型 Key 或邮件正文。HTTP 节点使用原生 Credentials，入口使用随包的认证后净化触发器。不要替换成会把请求头一并输出的通用 Webhook 节点。不要打开会输出请求认证头的调试日志。默认原生执行记录保留 7 天或最多 10,000 条；业务审计独立持久化。此保留值是本项目配置，不是法定期限。调整保存/清理设置后，原生历史可能不可再查询，UI 必须如实显示 unknown。

## 表单、CSV 与 API / Webhook

客户公开表单位于 `/intake`。`GET /api/public/form` 只提供公司名、启用状态和测试模式；`POST /api/public/leads` 接收询价，返回接收编号、重复标记和测试标记，不暴露提取结果、CRM 或审批详情。服务端强制来源和测试范围，不接受客户端的 `fault`、`is_test` 或 `source`。`website` 为留空的蜜罐字段；当前限流为每 API 进程、每 IP 每分钟 10 次，尚未实现 CAPTCHA 或分布式限流。`PUBLIC_FORM_ENABLED=false` 可关闭公开入口。

控制台新增线索和 CSV 导入仍需管理员登录。集成客户外部网站时，可使用其服务器转发到鉴权 Webhook；不能把 Webhook Key 放进网页 JavaScript。公开表单与系统集成的鉴权 Webhook 是两个不同入口。

外部接口 `POST /api/webhooks/leads` 要求 `X-Webhook-Key`，可带 `Idempotency-Key`。最小 body 包含 `message`。姓名、公司、邮箱、电话、预算和币种建议以结构化字段提交；缺失字段会保留并复核。

示例 JSON（保留测试标记）：

```json
{
  "name": "演示联系人",
  "company": "演示企业（虚构）",
  "email": "demo.customer@example.com",
  "message": "需要 AI 线索分类、CRM 录入与邮件审批，预算 80000 元。",
  "budget": 80000,
  "currency": "CNY",
  "source": "api",
  "is_test": true
}
```

支持的 CSV 列为 `name, company, email, phone, message, requirement, budget, currency, source, is_test, fault`。UTF-8（含 BOM）文件由标准 CSV 解析器处理；每行独立返回接收、重复或拒绝结果。`data/leads.csv` 包含故意非法行，不应把整份文件都通过作为正确目标。

`fault` 仅在 `FLOWPILOT_TEST_MODE=true` 且 `FLOWPILOT_ALLOW_FAULTS=true` 时启用，并只允许测试事件；线上正常请求不能通过 JSON 开关自行开启故障注入。

## CRM

首版只能执行 `builtin` Adapter，实际保存联系人、公司、线索、状态、负责人和任务。没有第三方账号时，不会显示 HubSpot/GoHighLevel 同步成功。扩展接口在 `backend/app/crm.py`。

外部接入必须补齐：OAuth 或安全 token、客户租户配置、字段映射、远端资源 ID、联系人冲突策略、幂等/重试策略、API 限流、权限范围和专门的端到端验收。只有这些实现并验证后，才能把集成加入商业合同的已交付范围。

## 邮件与 SMTP

默认测试发件箱是真实持久化记录，不与外部邮箱建立投递连接。管理员可以编辑草稿，拒绝或仅保存，不必发送。

真实 SMTP 发信需要全部条件：

1. 已配置并启用 SMTP，包含服务器、端口、用户名/密码、合法发件地址。
2. 事件不是测试事件。
3. 人工对当前草稿版本作出批准，选择 `delivery_mode=smtp`，明确设置 `authorize_external_send=true`。
4. 该审批尚未形成已发送或结果不确定的动作。

推荐使用服务商提供的 STARTTLS 配置（通常端口 587）。此实现不是 OAuth 邮件连接器，没有 Gmail/Outlook API 集成；`SMTP_STARTTLS=true` 使用系统信任链，不禁用证书校验。服务商未开通 SMTP、发件域未配置、认证或网络失败会明确记录。项目未代表用户发送任何真实客户邮件。

SMTP 交付、退信、域名信誉、SPF/DKIM/DMARC 和邮箱落箱率是不同问题。首次客户交付应在受控收件地址上做明确授权的发送验证，不把测试发件箱成功解释为 SMTP 送达成功。

## 公网部署

本 Compose 只对 127.0.0.1 开放 FlowPilot 和 n8n 端口。公开访问需要客户自己的 HTTPS 反向代理、域名和访问策略。将 `PUBLIC_BASE_URL` 设为真实 HTTPS 来源后，FlowPilot 使用 secure cookie；同时正确配置 n8n 的编辑器 URL、Webhook URL、代理 hops 和 secure cookie。不要只把端口改为 0.0.0.0 然后把本地演示当作完整生产安全配置。

## English setup summary

Use the authenticated Settings page for real model configuration. n8n needs an imported Header Auth credential, a published workflow, and a Public API key for native final-state reconciliation. A public `/intake` form is included with a honeypot and a per-process/IP rate limit; it exposes no CRM data. External website integrations can forward through a trusted server; never embed the webhook secret in browser code. The only implemented CRM is the built-in database adapter. Test mail persists locally. SMTP additionally requires valid configuration, a non-test event and explicit authorization for the approved draft version. HTTPS and customer-specific identity/operations remain deployment work.
