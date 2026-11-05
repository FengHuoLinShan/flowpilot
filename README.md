# FlowPilot

**客户线索处理、内置 CRM 与人工审批自动化。** 默认中文，可切换英文。第一版围绕一条可执行的业务链路：接收线索 → 模型提取 → 业务规则 → CRM 去重/更新 → 跟进草稿 → 人工审批 → 测试发件箱或显式授权的 SMTP 发送。

前端 React + TypeScript + Tailwind；后端 FastAPI + Pydantic + SQLAlchemy；交付数据库 PostgreSQL；可视编排 n8n 2.46.6；模型支持 OpenAI 兼容接口和 Ollama。每个业务节点在服务端执行并持久化；界面轮询真实状态。

## 交付和验证边界

完整源码、Docker Compose、可导入 n8n JSON、30 条虚构测试输入、中文/英文说明、自动化测试与真实 HTTP 验收脚本在本目录。**当前交付实际跑过哪些环境和断言，以 [验证记录](docs/VERIFICATION.md) 为准。** `fixture` 是显式测试替身，不能证明真实 LLM 效果；本地执行器也不能证明 n8n 已运行。

首版是单企业部署、一名管理员审批的演示和定制基线。内置 CRM 可实际读写；HubSpot、GoHighLevel、ERP 和多租户能力没有被宣称为已实现。正式客户验收应在客户将使用的 PostgreSQL、n8n、模型和邮件环境执行同样的验收脚本。

## 一、在本机启动完整栈

准备 Docker Engine / Docker Desktop 和 Compose v2，以及 Python 3.10+（仅运行初始化脚本）。需要正常访问镜像仓库；使用本地模型时还需要下载模型权重。为本地模型预留额外内存和磁盘。此配置默认仅绑定本机回环地址。

```bash
python3 scripts/bootstrap.py
docker compose --profile ollama up -d --build
docker compose --profile ollama exec ollama ollama pull qwen2.5:1.5b
```

Compose 自动加载随包的安全 n8n Webhook 触发器；它在认证后丢弃请求头，保留真实执行历史而不记录内部密钥。手工将 JSON 导入另一台 n8n 时，先按 [工作流说明](n8n/README.md) 安装这一自定义节点。

初始化脚本要求设置 FlowPilot 管理员密码，并生成独立的数据库、Webhook、内部通信、会话与加密密钥，写入被忽略的 `.env`。不会打印密钥，也不会覆盖已有文件。

**商业交付默认模型 `qwen2.5:1.5b` 已完成真实 n8n + Ollama 业务链路验收，16/16 断言通过。** 它采用 [Apache 2.0 许可证](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/blob/main/LICENSE)。`qwen2.5:3b` 也完成了同一套技术评估，但其 [Research License](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/blob/main/LICENSE) 要求商业用途另行取得许可，因此不作为客户默认；不同尺寸不能按同一许可证处理。

可以配置其他已获授权且通过验收的模型。首次启动前修改私有 `.env` 的 `LLM_MODEL` 并拉取同名模型；已经在 Settings 保存过模型配置时，应在 Settings 更新，因为数据库配置优先于环境变量。实际数据库、Docker 和浏览器验证范围见 [验证记录](docs/VERIFICATION.md)。

1. 打开 **http://localhost:5678**，完成 n8n 首次本地管理员设置。这与 FlowPilot 管理员密码是两个独立账户。
2. 在维护窗口导入凭据、发布并激活工作流。脚本会重启本项目专用的 n8n 容器，在途执行可能中断：

```bash
python3 scripts/import-n8n.py
```

3. 在 n8n 的 Settings → n8n API 创建允许读取执行记录的 API Key；用下面的本地隐藏输入工具保存它，启用原生 n8n 终态同步：

```bash
python3 scripts/configure-n8n-status.py
docker compose up -d api worker
```

4. 打开 **http://localhost:3000**，用初始化时设置的 FlowPilot 密码登录。
5. 进入 Settings，确认模型是 `ollama`、地址 `http://ollama:11434`，模型名称与刚才拉取的名称一致（默认 `qwen2.5:1.5b`），执行模型连接检查。
6. 打开 **http://localhost:3000/intake** 使用客户公开表单，或在登录后的 Inbox 新建测试线索；观察执行至 Approvals，编辑草稿并批准到测试发件箱，最后在 Outbox 查看持久化邮件。

导入脚本在清理临时凭据文件后重启 n8n，并在默认 120 秒内确认生产 Webhook 对无凭据探测返回预期的 401；该探测不发送密钥或有效业务事件。只有入口确认启用才返回成功。清理、重启或就绪检查失败时，脚本返回非零并打印恢复命令；不要仅等待约 15 秒便认定发布生效。已记录的派发失败可在配置修复后通过 Executions 的“重新执行”恢复。

### 使用已经部署的模型

不使用本项目的 Ollama 容器时，省略 `--profile ollama`，在 `.env` 或登录后的 Settings 设置真实服务：

| 模式 | `LLM_PROVIDER` | Base URL 示例 | 说明 |
| --- | --- | --- | --- |
| Docker 内 Ollama | `ollama` | `http://ollama:11434` | 先拉取模型；不会自动下载 |
| Mac/Windows 宿主机 Ollama | `ollama` | `http://host.docker.internal:11434` | 宿主机服务需允许容器连接 |
| OpenAI 兼容服务 | `openai_compatible` | 服务商实际 `/v1` 地址 | 配置模型 ID 和该服务的 API Key |

Settings 中的 Key 是只写字段，保存后只返回“已配置”状态。服务不存在、模型未下载、Key 缺失或 JSON 校验不通过时，执行会失败或进入复核，不会自动改用测试替身。兼容接口细节见 [集成说明](docs/INTEGRATIONS.md)。

## 二、无需真实模型的确定性回归环境

这条路线运行真实 PostgreSQL、n8n、FastAPI、CRM 和审批/发件箱代码，**仅模型响应使用显式 fixture 替身**。适合检查数据流、权限和错误恢复，不应作为真实 AI 演示。

```bash
python3 scripts/bootstrap.py --test
docker compose --env-file .env.test up -d --build
```

完成 http://localhost:5679 的 n8n 首次管理员设置，然后：

```bash
python3 scripts/import-n8n.py --env-file .env.test
python3 scripts/configure-n8n-status.py --env-file .env.test
docker compose --env-file .env.test up -d api worker
```

打开 **http://localhost:3001**。界面会标出测试模式与 fixture 模型。“运行测试”会将 `data/leads.json` 逐条交给真实接收接口；包含的非法输入被拒绝，重复输入被识别，故障样本触发受控错误，不要求所有样本最终显示成功。

测试环境使用独立 Compose 项目、数据库卷和端口。不要将 `.env.test` 用于接收真实客户数据。测试事件永远不能通过 SMTP 外发。

## 三、验收与开发

### 自动化业务与安全测试

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r backend/requirements.txt pytest httpx
python3 -m pytest -q
node --test n8n/custom-nodes/FlowPilotWebhook.test.cjs
```

测试会覆盖事件幂等、联系人复用、审批版本、拒绝分支、发件箱唯一性、输入校验、故障处理和权限边界。用例与已运行结果以源码及 [验证记录](docs/VERIFICATION.md) 为准。

### 已启动服务的真实 HTTP 验收

```bash
python3 scripts/verify-live.py --env-file .env.test --require-n8n --report artifacts/http-e2e-fixture.json
```

对配置好的真实模型与 n8n 执行严格验收：

```bash
python3 scripts/verify-live.py --env-file .env --require-n8n --require-live-model --report artifacts/http-e2e-live.json
```

包装脚本从本地私有配置读取管理员密码，不把密码放进命令参数。`scripts/e2e.py` 还可以直接调用，要求通过进程环境提供 `FLOWPILOT_ADMIN_PASSWORD`。报告记录实际 engine/provider；严格选项不满足时返回失败，不能用 fixture 结果代替。

### 前端开发

```bash
cd frontend
npm ci
npm run dev
```

Vite 默认端口 5173，将 `/api` 代理到 `http://127.0.0.1:8000`；可设置 `API_PROXY_TARGET`。开发时后端 `PUBLIC_BASE_URL` 应与浏览器访问的来源一致，以通过 CSRF 检查。生产构建使用 `npm run build`。

### 后端开发

```bash
cd backend
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

先通过可信进程环境注入配置（应用不会把 `.env` 自动当成可执行 shell 脚本）。另一个进程运行 `python -m app.worker`。默认工作流引擎是 n8n；开发替代引擎 `WORKFLOW_ENGINE=local` 会明确显示在执行记录中。

## 四、主要页面

| 页面 | 可以完成的操作 |
| --- | --- |
| Dashboard | 查看当天处理量、失败、待复核、待审批和实际服务配置状态 |
| 客户表单 `/intake` | 无需控制台登录提交询价；只返回接收编号，不暴露 CRM 或执行详情 |
| Inbox | 管理员提交线索、CSV 导入、运行虚构样本、按状态查找事件 |
| 事件详情 | 查看原始输入、提取结果、规则依据、CRM 变化、草稿和节点记录；人工修正字段 |
| CRM | 查看联系人、公司、线索和跟进任务；修改线索状态/负责人 |
| Workflow | 查看工作流阶段与业务执行状态，区分 n8n 原生状态 |
| Approvals | 修改草稿、批准到测试箱、拒绝、仅保存；每次决策校验版本 |
| Executions | 查看真实节点错误、尝试次数与 n8n 执行 ID；手工恢复失败执行 |
| Outbox | 查看实际持久化的测试邮件及启用后的 SMTP 投递结果 |
| Settings | 配置真实模型、查看受保护 Webhook、确认 CRM 和 SMTP 边界 |

## 五、重要行为

- 同一幂等键对应不同内容返回冲突；相同内容重复接收复用原事件。相同联系人新的需求可以成为新的线索。
- 模型负责结构化理解和起草；优先级、分配、信息完整性和发送许可由服务端规则决定。
- 只有持久化的人类审批决策才能生成投递任务。修改已审批草稿或重复批准不会创建第二次动作。
- 审批默认只写测试发件箱。SMTP 需要服务端启用、有效配置和审批请求明确授权；测试事件被永久禁止外发。
- SMTP 具有“服务器已经接受、客户端尚未记账”的不确定窗口。此类结果保留为待核对/失败，不能声称跨 SMTP 实现了数学意义上的 exactly-once。
- `waiting_approval` 是业务状态。n8n 的管线执行可以已经结束；后续审批会触发新的投递执行。没有原生状态证据时显示 `unknown`，不制造 n8n Wait 动画。

## 六、文档导航

- [English guide](README.en.md)
- [架构、业务规则和恢复机制](docs/ARCHITECTURE.md)
- [模型、Webhook、CRM 与 SMTP 配置](docs/INTEGRATIONS.md)
- [中文/英文演示脚本](docs/DEMO_SCRIPT.md)
- [商业化范围与报价测算](docs/COMMERCIAL.md)
- [运行、备份与恢复](docs/OPERATIONS.md)
- [功能边界](docs/BOUNDARIES.md)
- [验证记录与未解决问题](docs/VERIFICATION.md)
- [30 个测试情景](docs/SCENARIOS.md)
- [n8n 工作流说明](n8n/README.md)
- [外部依赖与官方依据](docs/SOURCES_AND_NOTICES.md)

客户交付建议按“客户自有实例部署 + 业务规则定制 + 验收与维护”签约。n8n 有独立的 Sustainable Use License；让外部客户自行配置或编排工作流的托管产品，需要核实其商业许可条件。
