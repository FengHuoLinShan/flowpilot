# 验证记录 / Verification record

**商业交付默认 `qwen2.5:1.5b` 已通过真实 HTTP 链路的全部 16 项断言：实际 n8n 编排调用实际 Ollama 模型，完成结构化提取、CRM 写入、人工审批、测试发件箱和拒绝分支。`qwen2.5:3b` 的独立技术评估也通过同一套 16 项断言，但不作为客户默认。** 这是同一套验收在两个模型上的结果，不是 32 个不同用例。最终 Python 回归为 **56 通过、0 失败、0 错误、0 跳过**。这些结论分别对应下列报告；它们没有覆盖所有部署组合，也不能代替客户环境验收。

浏览器公开表单的 **6 项实际操作检查通过**，前端修复后的生产构建、**4 项 UUID 回归**和 **5 项 Webhook 节点测试**也已通过。登录后的管理台浏览器操作与 Playwright 用例执行仍不在已验证范围内。

验证日期：**2026-11-05**。机器报告使用 UTC；本文同时给出北京时间（UTC+8）。本文件只采用最终报告，不用较早的失败尝试代替最终结果。

**默认模型的交付决策：** 1.5B 的官方许可为 [Apache 2.0](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/blob/main/LICENSE)，而 3B 的 [Research License 第 2 条](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/blob/main/LICENSE) 要求商业用途另行取得许可。最终默认据此设为已实测的 1.5B；3B 仅保留研究/评估技术证据，不把运行成功当作商业授权。两个模型的原始机器报告及其 runtime 字段均保持真实原值。

## 1. 最终运行矩阵

| 验证项 | 最终结果 | 实际环境和范围 | 证据 |
| --- | --- | --- | --- |
| 业务、权限、恢复、并发回归 | **56/56 通过，21.977 秒** | 每个测试使用独立 SQLite 文件；业务执行器为 `local`，模型为显式 fixture。模型协议测试访问真实本地 HTTP 服务，但返回内容是合成样本 | [最终汇总](../artifacts/final-unit-summary.json)、[JUnit 明细](../artifacts/pytest.xml) |
| 默认 1.5B 模型与真实 n8n 的完整 HTTP 验收 | **16/16 通过** | FastAPI、后台 worker、n8n **2.46.6**、Ollama **0.40.14**、商业交付默认模型 **`qwen2.5:1.5b`**；业务数据库为 **PGlite 0.5.15 / PostgreSQL 18.6 WASM 内核，通过 PostgreSQL wire 协议连接** | [1.5B 主验收报告](../artifacts/http-e2e-live-postgres.json) |
| 3B 模型的额外技术评估 | **同一套 16/16 通过** | 同一实际服务栈和脚本，模型为 **`qwen2.5:3b`**；保留为研究/评估结果，不增加不同用例数，也不作为默认商业配置。商业使用须另行取得许可 | [3B 技术评估报告](../artifacts/http-e2e-live-postgres-3b.json) |
| 原生失败分支及入口鉴权 | **两次模型配置运行均通过** | 受控非法 JSON 故障；n8n 最终 `error`，保留 `MODEL_INVALID_JSON`，下游副作用数为 0；未认证 Webhook 返回 401。非法 JSON 来自故障注入，不是模型自然错误率测试 | [3B 配置下失败报告](../artifacts/failure-live-postgres-3b.json)、[1.5B 配置下失败报告](../artifacts/failure-live-postgres.json) |
| n8n 原生终态和内部认证密钥留存检查 | **两次最终业务执行成功；密钥未在执行数据中发现** | 默认 1.5B 正向执行 2、3、4 为 `success`，故障例 5 为预期 `error`；3B 技术评估正向执行 6、7、8 为 `success`，故障例 9 为预期 `error`。保留原生执行历史 | [1.5B 主验收原生快照](../artifacts/native-live-postgres.json)、[3B 技术评估原生快照](../artifacts/native-live-postgres-3b.json) |
| 自定义 Webhook 节点回归 | **5/5 通过，0 失败、0 跳过** | 对交付的 JavaScript 节点执行测试；隔离的 n8n 接口验证字段白名单、认证、非法输入及阶段校验。真实引擎加载与执行证据仍以上面的原生运行报告为准 | [最终节点测试](../artifacts/webhook-node-tests.json) |
| n8n 导入和激活辅助脚本 | **6/6 受控检查通过，语法检查通过** | 受控 Docker CLI 与 JavaScript fetch harness；验证凭据清理后重启、有限等待、失败退出与恢复提示、无密钥探测精确响应。核对实际 n8n 2.46.6 发布命令的重启要求；未启动 Docker 容器 | [导入脚本报告](../artifacts/n8n-import-verification.json) |
| 前端生产构建与浏览器用例类型检查 | **通过** | UUID 兼容性修复后重新执行 `npm run build`，即 `tsc -b && vite build`，退出码为 0；Playwright 配置和用例严格 TypeScript 检查通过 | [前端报告 v2](../artifacts/frontend-verification.json) |
| HTTP 场景的 UUID 兼容性回归 | **4/4 通过，0 失败、0 跳过** | Node 单元测试验证原生随机 UUID、安全随机数回退、版本/变体位及缺少安全随机源时的显式错误；未启动浏览器 | [前端报告 v2](../artifacts/frontend-verification.json) |
| Chrome 公开表单实际操作 | **6/6 通过** | CUA 操作 `http://terminal.local:4173`；真实 FastAPI + 预览专用 SQLite，`local` 执行器、fixture 模型和测试事件。验证接收回执与交互，不作为 n8n/模型或下游完成证据 | [浏览器最终报告](../artifacts/browser-verification.json) |
| Docker Compose 配置 | **生产和测试两套配置均通过原生解析** | 使用校验过官方 SHA256 的 Compose CLI **v5.7.0**；检查变量传递、0600 私有配置权限、回环端口、项目隔离及 8 组特殊字符 | [Compose 配置报告](../artifacts/compose-config-verification.json) |
| 标准 PostgreSQL 17 容器与整套 Compose 启动 | **未执行** | 当前环境没有可用 Docker daemon。交付配置为 `postgres:17-bookworm`；上面的 PGlite 测试不等同于该标准容器验证 | 同一 Compose 报告中 `containers_started=false`、`postgres_runtime_verified=false` |
| OpenAI 兼容服务的真实远程模型 | **未执行** | 已测试请求协议、JSON Schema 和错误处理；使用合成 HTTP 响应，未使用第三方真实账号或付费模型 | [协议测试源码](../tests/test_model_contract.py) |
| SMTP 外部发送 | **未执行** | 本次只写测试发件箱；所有验收事件为测试事件，禁止 SMTP 外发 | [1.5B 主验收报告](../artifacts/http-e2e-live-postgres.json)、[邮件边界](BOUNDARIES.md) |
| 登录后管理台浏览器操作 | **未执行** | 所用浏览器的安全认证流程要求用户安全接管输入凭据；没有自动输入密码或绕过登录。审批/CRM/投递行为的已通过证据来自独立的认证 HTTP 验收 | [浏览器最终报告](../artifacts/browser-verification.json) |
| Playwright 浏览器自动化 | **3 个用例已编写并发现，未执行** | Chromium 用例覆盖主业务链、公开表单入口可见性与访问隔离、英文界面/配置脱敏；用例发现和类型检查不算浏览器执行通过 | [用例源码](../frontend/e2e/flowpilot.spec.ts)、[发现和类型检查报告](../artifacts/frontend-verification.json) |

PGlite 具有实际 PostgreSQL 内核；本次连接与持久化不是 SQLite 替代或内存里的 CRM 假响应。但其 WASM 运行方式、并发能力、存储和部署特性不同于标准 PostgreSQL 服务。**不能据此宣称 `postgres:17-bookworm`、容器网络、卷恢复或生产数据库并发已经通过。** n8n 本次通过原生 CLI 启动，并使用自身 SQLite 数据库；交付 Compose 则将 n8n 历史放入独立 PostgreSQL 数据库。这一 n8n 数据库部署差异也需要在目标环境复验。

## 2. 真实 HTTP 链路的 16 项断言

同一验收脚本分别使用两个真实模型完成运行。最终商业默认 1.5B 的报告是主验收证据，3B 只作为额外技术评估。脚本向正在运行的 API 发送 HTTP 请求，实际后台任务由 n8n 和模型完成，不是在浏览器中播放状态动画。

| 实际模型 | 开始 → 结束（UTC） | 开始 → 结束（北京时间） | 整组验收耗时 | 报告 |
| --- | --- | --- | --- | --- |
| 商业默认 `qwen2.5:1.5b` | 10:33:42 → 10:34:38 | 18:33:42 → 18:34:38 | 约 55.48 秒 | [1.5B 主验收](../artifacts/http-e2e-live-postgres.json) |
| 技术评估 `qwen2.5:3b` | 10:50:04 → 10:51:46 | 18:50:04 → 18:51:46 | 约 101.96 秒 | [3B 评估记录](../artifacts/http-e2e-live-postgres-3b.json) |

每次运行包含多个事件和审批操作；这些耗时不代表单条线索延迟，也不是模型性能基准。下表的 **16 项断言在两次运行中分别全部通过**，不合并计为 32 个不同用例。

| 报告断言 | 检查的具体行为 | 1.5B / 3B 结果 |
| --- | --- | --- |
| `live_model_required` | 配置的模型提供方是实际 Ollama，而不是 fixture/mock/disabled | 通过 |
| `n8n_required` | 工作流引擎为 n8n | 通过 |
| `same_event_deduplicated` | 同一幂等键和相同输入重复提交，复用同一事件 | 通过 |
| `crm_persisted` | 业务步骤产生持久化 CRM 变更 | 通过 |
| `structured_extraction` | 结果包含经过服务端 schema 校验的结构化提取 | 通过 |
| `rule_reasons_recorded` | 明确的业务规则判断依据被记录 | 通过 |
| `node_history_persisted` | 多个实际执行节点的记录被保存 | 通过 |
| `real_n8n_execution_id` | 业务记录包含真实 n8n 执行编号 | 通过 |
| `nothing_sent_before_approval` | 审批前测试发件箱没有该事件的邮件 | 通过 |
| `repeat_approval_safe` | 重复批准被安全处理，不导致第二次投递 | 通过 |
| `exactly_one_test_message` | 审批后只有一条该事件的持久化测试邮件 | 通过 |
| `edited_draft_delivered` | 发件箱保存了人类编辑后批准的草稿版本 | 通过 |
| `native_n8n_success_observed` | 通过原生执行状态对账确认 n8n `success` | 通过 |
| `same_contact_matched` | 相同联系方式的新需求匹配已有联系人 | 通过 |
| `rejection_recorded` | 第二条需求的拒绝审批决策被持久化 | 通过 |
| `rejection_sends_nothing` | 被拒绝的需求没有测试邮件 | 通过 |

两份报告中 `test_mode=true` 用来隔离虚构验收事件和禁止真实邮件外发，**并不意味着模型为替身**；报告都明确记录 `llm_provider=ollama`，模型分别为 `qwen2.5:3b` 和 `qwen2.5:1.5b`。脚本以管理员 API 提交和审批，因此这些证据证明真实 HTTP 业务闭环，网页交互证据单独记录在第 6 节。

源码入口：[HTTP 验收脚本](../scripts/e2e.py)。验收中对真实模型和真实 n8n 都启用了严格要求，不满足条件会报告失败。

## 3. 失败路径、恢复和并发的证据边界

实际失败测试通过显式测试故障触发非法 JSON 校验，不是声称真实模型自然产生了这一故障。默认 1.5B 配置和 3B 技术评估配置下的结果相同：提取失败保留 `MODEL_INVALID_JSON`，n8n 自身执行标记 `error`，CRM/邮件下游副作用为 0；缺少内部认证头的 Webhook 请求返回 401。对应 [1.5B 主验收失败报告](../artifacts/failure-live-postgres.json) 和 [3B 技术评估失败报告](../artifacts/failure-live-postgres-3b.json)。

原生快照中，商业默认 1.5B 的正向执行为 2、3、4，故障例为 5；3B 技术评估的正向执行为 6、7、8，故障例为 9。正向执行均为 `success`，故障例的 `error` 是预期断言。快照还保留更早中断的 `id=1, status=crashed`，没有将它删除或包装成成功。**因此准确表述是“两次实际链路检查通过”，而不是“整个执行历史没有失败”。** 对应 [1.5B 主验收快照](../artifacts/native-live-postgres.json) 和保留全部上述历史的 [3B 评估后快照](../artifacts/native-live-postgres-3b.json)。

恢复与并发测试在 56 项最终 Python 回归中覆盖了下列情况，但运行环境是本地执行器、SQLite 和受控模型响应，不能提升成 n8n/标准 PostgreSQL 的负载或高可用证明：

- 瞬时模型超时、429 和 CRM 故障的有限重试；永久 CRM 错误停止并允许人工恢复。
- 非法模型 JSON 被拒绝，人工修正字段后重新执行后续步骤。
- CRM 提交后中断、已批准投递完成后中断，重新创建服务实例恢复工作且不重复副作用。
- 两个工作进程的并发重复事件、联系人复用；草稿版本冲突；修正字段与审批同时提交。
- 已批准草稿不可悄悄修改，旧草稿版本不能批准；拒绝和仅保存不产生发送动作。
- 30 行演示样本的真实接收逻辑、非法行拒绝及批次再次导入的幂等行为。这里验证的是批次入口和后续受控业务逻辑，不声称 30 行都经过了真实模型推理。
- 公开表单、Webhook、管理员会话、CSRF、内部派发令牌以及配置脱敏。

详见 [最终 56 项汇总](../artifacts/final-unit-summary.json)、[完整测试断言](../artifacts/pytest.xml) 和 [测试源码](../tests)。最终回归在严格模型提示词、上下文配置、中间件和并发修复之后重新执行，无跳过项。

## 4. 验收中实际发现并修复的问题

### 4.1 小模型给出超出范围的置信度

真实小模型曾给出 `confidence=100`，不满足 schema 要求的 `0..1`。服务端保留严格校验，没有把不合法输出默默变成成功，也没有悄悄换成 fixture。修复明确了置信度小数范围、歧义字段语义，使用确定性生成参数，并提供 Ollama 上下文/线程配置；超过保守上下文预算的输入显式失败，不截断客户事实。修复后的默认 1.5B 验收和 3B 技术评估分别通过同一套 16 项断言，见 [1.5B 报告](../artifacts/http-e2e-live-postgres.json) 与 [3B 评估报告](../artifacts/http-e2e-live-postgres-3b.json)。这只能说明本次样例通过，不能推导任意输入的准确率。

### 4.2 通用 Webhook 将内部认证头留在 n8n 历史

原通用触发器把完整请求头写入执行数据，导致内部密钥留存。交付版本改为随包的 `CUSTOM.flowPilotWebhook` 触发器：使用 n8n 加密凭据认证，只向后续节点输出受限的事件字段，不输出 headers/cookies/query；没有修改 n8n 引擎，也没有关闭原生执行历史。两次最终运行后的实际 n8n `execution_data` 扫描均为 `internal_auth_secret_found_in_execution_data=false`。这一结论针对本次内部认证密钥及保存的执行数据，不是对所有未来日志、插件和输入的无条件安全认证。见 [3B 最终原生检查](../artifacts/native-live-postgres-3b.json)、[1.5B 原生检查](../artifacts/native-live-postgres.json) 与 [节点安装要求](../n8n/README.md)。

### 4.3 初始化密码中的反斜杠被重复转义

原配置写入器在 Compose 的单引号规则下重复保留反斜杠。已改为与原生 Compose 一致的双引号转义，8 组包含美元符号、反斜杠、引号、空格和 Unicode 的合成值全部原样传递。报告只记录布尔结果和合成情景，不包含真实密码。见 [最终 Compose 检查](../artifacts/compose-config-verification.json)。

### 4.4 非 localhost 的普通 HTTP 表单白屏

实际 Chrome 操作发现，在 `http://terminal.local:4173/intake` 中直接调用不可用的 `crypto.randomUUID()` 会使表单白屏。修复后的幂等键生成优先使用原生 UUID API，否则通过 `crypto.getRandomValues()` 生成 UUID；不使用 `Math.random()`。生成动作移到首次提交时，同一提交的重试复用幂等键，开始新询价才重置。如果环境没有安全随机数能力，显示可操作的表单错误，不再于渲染时崩溃。

修复后重新完成生产构建和 4 项单元回归，随后在相同 HTTP 来源重新进行真实浏览器提交，获得 API 回执；重复内容返回同一事件编号。见 [前端报告 v2](../artifacts/frontend-verification.json) 与 [浏览器最终报告](../artifacts/browser-verification.json)。这项兼容性修复不改变正式部署仍需 HTTPS 的要求，也没有弱化管理员认证。

### 4.5 CLI 发布后未重启运行中的 n8n

核对实际安装的 n8n 2.46.6 `dist/commands/publish/workflow.js`，该命令更新数据库后明确要求重启正在运行的实例。导入脚本原先只提示等待注册，不能据此确认生产入口可用。现改为导入/发布成功、临时凭据清理确认后，重启专用 Compose n8n 服务，再在默认 120 秒内检查生产 Webhook；仅 HTTP 401 且 `error=UNAUTHORIZED` 才认定安全触发器已注册。探测不带密钥，正文为空对象，不能启动业务处理。

清理失败不重启；重启、超时或就绪失败均返回非零并提供恢复命令。脚本和说明明确要求维护窗口，因为重启可能中断在途执行。6 项受控 CLI/JavaScript 检查和 Python 语法检查通过，见 [独立报告](../artifacts/n8n-import-verification.json)。此前真实 n8n 原生进程在发布并重启后完成了上面的实际链路验收；**本次脚本的 Docker 容器启动流程仍未在无 daemon 环境中执行**，不把受控 harness 当作容器验收。

## 5. 在交付环境复验

按照 [中文启动说明](../README.md) 或 [English guide](../README.en.md) 完成配置、模型下载、n8n 自定义节点/工作流导入和原生状态 API Key 设置，再执行：

```bash
python3 scripts/verify-live.py --env-file .env --require-n8n --require-live-model --report artifacts/customer-http-e2e-live.json
```

该脚本始终提交显式测试事件并写测试箱，不进行真实 SMTP 发送。商业默认 `qwen2.5:1.5b` 与主验收报告一致。需要更换模型时，选择已获相应用途授权的具体版本，在私有 `.env` 设置 `LLM_MODEL` 并下载同名模型；已在 Settings 保存配置的，应在 Settings 修改，因为数据库配置优先于环境变量。3B 的技术通过结果不授予商业使用权。客户部署后，须对实际选用的授权模型和基础设施重新执行验收。

标准 PostgreSQL 的回归可以使用独立、可丢弃的测试数据库，在进程环境设置 `FLOWPILOT_TEST_DATABASE_URL` 后运行 `python3 -m pytest -q`。测试为每个用例创建并删除独立 schema；不要给它客户生产数据库地址。**本次未执行这一标准 PostgreSQL 回归命令。**

浏览器自动化命令为在 `frontend/` 执行 `npm run test:e2e`，需先安装所选浏览器并通过私有进程环境提供 `FLOWPILOT_ADMIN_PASSWORD`、`FLOWPILOT_BASE_URL`。默认目标是 `http://localhost:3001`。交付的 3 个用例在本次尚未执行，不能将 `--list` 的发现结果填成通过。

前端构建和 UUID 回归可在 `frontend/` 分别运行 `npm run build`、`npm run test:unit`；自定义触发器回归在项目根目录运行 `node --test n8n/custom-nodes/FlowPilotWebhook.test.cjs`。这些检查已经完成，但不能替代完整浏览器回归。

客户上线还需完成：目标 Docker/数据库栈启动和重启恢复、经过授权的受控 SMTP 收件测试、真实业务标注集评估、浏览器回归、域名 HTTPS、备份还原及容量验证。当前没有外部 CRM、生产 SLA 或邮箱送达率的验收声明。

## 6. 浏览器人工操作记录

**公开表单的 6 项检查通过；登录后管理台浏览器流程未执行。** 这是对 Chrome 的实际 CUA 操作，与 Playwright 自动化执行分开记录。报告记录于 **10:49:25 UTC / 18:49:25 北京时间**，访问来源为 `http://terminal.local:4173`。

浏览器预览连接真实 FastAPI 应用和专用持久化 SQLite 文件，配置为 `WORKFLOW_ENGINE=local`、`LLM_PROVIDER=fixture`、测试模式。该环境用于检查界面、兼容性和真实接收回执；真实 Ollama/n8n 闭环使用第 2 节的独立环境及报告。

| 实际检查 | 观察结果 |
| --- | --- |
| 普通 HTTP、非 localhost 的 `/intake` 页面 | UUID 修复后正常渲染，没有白屏 |
| 填写虚构询价并提交 | 服务端返回真实接收回执和事件编号 `2d06de58-f889-49db-b73a-1d9846f953e8` |
| 再次提交相同内容 | 返回同一事件编号，未产生第二个事件 |
| 测试事件标识 | 页面明确显示演示/测试提示及不会外发邮件的说明 |
| 英文切换与偏好保存 | 英文界面切换成功，语言偏好持续生效 |
| 匿名访问控制台 | 显示登录要求，不能直接进入管理工作区 |

证据：[浏览器最终报告](../artifacts/browser-verification.json)。实际提交后的回执页面及截图已经查看，显示上述事件编号和测试模式提示。截图仅用于内部验收，不在交付包中。页面呈现和回执证明服务端收到业务事件，**不证明预览环境下游步骤已经完成**。

本次没有在浏览器中登录管理员账户。所用浏览器的安全认证规则要求通过用户安全接管输入凭据，因此没有自动填入密码、绕过登录或为 QA 放宽生产认证。为了不要求用户中断任务进行凭据接管，登录后的 Dashboard、Approvals、CRM、Settings 交互未执行；这些行为中的业务审批和投递逻辑已由认证 HTTP 验收独立验证。也没有进行移动端视口测试，3 个 Playwright 用例的测试体仍未执行。

## English verification summary

The commercial-delivery default **`qwen2.5:1.5b` passed all 16 live HTTP acceptance checks** using actual **n8n 2.46.6** and **Ollama 0.40.14**. The separate **`qwen2.5:3b` technical evaluation passed the same 16-check suite**; these are two model runs, not 32 distinct test cases. The 1.5B model uses Apache 2.0. The 3B Research License requires separate permission for commercial use, so 3B remains evaluation evidence and is not the customer default. The actual machine reports were not rewritten to change either runtime model.

Both runs exercised durable CRM changes, structured extraction, real native execution IDs and final status, mandatory approval, edited-draft delivery exactly once into the test outbox, contact reuse, and rejection without sending. Controlled invalid-JSON faults under each configuration reached native n8n `error`, retained the application error code, and produced no downstream side effects. The saved native execution data did not contain the internal authentication secret. See the [default 1.5B report](../artifacts/http-e2e-live-postgres.json), [3B evaluation report](../artifacts/http-e2e-live-postgres-3b.json) and [official license references](SOURCES_AND_NOTICES.md).

The application database for both live runs was **PGlite 0.5.15 with the PostgreSQL 18.6 WASM engine exposed over the PostgreSQL wire protocol**. The n8n CLI instance used its own SQLite database. This is real execution evidence, but it is **not** a successful deployment of the supplied PostgreSQL 17 Docker stack. Docker Compose configuration was validated using the official CLI; containers were not started because no Docker daemon was available.

The final Python suite passed **56 tests with no failures, errors or skips** in 21.977 seconds. It used SQLite test files, the local workflow engine, fixture model responses and synthetic local HTTP protocol responses. Those tests cover application reliability and security behavior; they do not establish real-model accuracy or production database concurrency.

After fixing a real public-form blank page caused by `crypto.randomUUID` being unavailable on a non-localhost HTTP origin, the frontend production build and **four secure UUID compatibility tests passed**. The packaged custom Webhook node also passed **five unit tests**. Actual Chrome interaction through CUA passed **six public-form checks**, including a real submission receipt, duplicate-content reuse of the same event ID, test-event disclosure, English preference persistence and anonymous-console login protection. This browser preview used SQLite, the local engine and a fixture model; it does not add live-model or native n8n evidence.

External SMTP sending, a remote OpenAI-compatible model, the standard PostgreSQL container deployment and the authored **three Playwright tests** were not executed. Authenticated console browser interaction was also not executed: the browser's secure authentication flow requires user credential entry through a secure handoff, and no automated credential entry or login bypass was performed. No mobile viewport was tested. Evidence is limited to the linked final reports; an earlier interrupted native execution remains visible in the final native snapshot.
