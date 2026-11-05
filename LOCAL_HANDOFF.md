# FlowPilot 本地开发接手

接手日期：2026-11-05。本仓库为公开发布副本，日常开发和推送使用 `flowpilot-public` 目录的 `main` 分支，远程目标为 `FengHuoLinShan/flowpilot`。原私有仓库与完整 Git bundle 备份单独保留，不含在此仓库；原仓库没有 remote，且禁止默认推送。私有备份实际位置仅保存在本机交接记录。未部署或外发邮件。

## 来源与完整性

- 用户 Downloads 原件：`Downloads/FlowPilot-v1.0.0-source.zip`，未移动或删除。
- 版本：`DELIVERY.json` 与前端 package.json 均为 1.0.0；297825 字节。
- SHA-256：`b4ad6f4c79400078851415b8c803db7a88a8977f06d796849829a2692279fec0`。
- 此哈希是本次本地基准，没有取得权威云端哈希，不能声称二者相等。文件大小、包结构、DELIVERY、README、来源上下文及包内校验共同核对。
- ZIP CRC 通过；112 项归档条目没有绝对路径、路径穿越、符号链接、特殊文件或嵌套 .git；原始 MANIFEST.sha256 的 111 项全部匹配。
- 来源与标识见 `SOURCE_IMPORT.json`。来源基线提交：`faab6ab488194283ded4d8d0459881803bece845`。
- 原 `MANIFEST.sha256` 保留为原始交付清单，后续本地修改通过 Git 跟踪，不能要求该清单覆盖新增接手文件。

## 本机实际验收

Python 3.12.7 隔离于 `.venv`，Node 22.22.3；前端按 package-lock 执行 npm ci，未运行安装脚本。未读取既有账户密钥。

| 项目 | 本机结果与范围 |
| --- | --- |
| Python 业务/安全/并发/恢复测试，SQLite | 56 passed；`artifacts/local-pytest-sqlite.xml` |
| 相同测试，真实 PostgreSQL 17 | 56 passed；`artifacts/local-pytest-postgres.xml`；独立临时容器、随机端口/密码、无数据卷，结束后移除 |
| n8n 导入脚本受控 CLI 测试 | 6 passed；不等于真实 n8n 导入 |
| Webhook 节点测试 | 5 passed |
| 前端 UUID 单测 | 4 passed |
| TypeScript 类型检查 | npm run typecheck 通过 |
| 生产构建 | npm run build 通过 |
| 真实本机 HTTP 核心流程 | 12/12；`artifacts/local-http-fixture.json` |
| 原有三项 Chromium Playwright 流程 | 3 passed；线索→CRM→编辑审批→唯一测试发件箱、公开入口隔离、英文设置及密钥不回显 |
| npm ci 安装时安全审计 | 0 vulnerabilities（安装时快照） |

HTTP 与浏览器使用真实 API、worker、SQLite、CRM、审批和测试发件箱，但模型为显式 fixture，工作流引擎为 local，SMTP 禁用。不能推导真实模型效果、n8n 编排、PostgreSQL HTTP 部署或外部邮件投递通过。PostgreSQL 项对应测试套件，不是完整 Compose 栈。

后端套件有 1 条上游 Starlette TestClient 对 httpx 的弃用警告；未为消除警告擅自更换 HTTP 客户端。项目没有配置独立后端静态类型门禁。浏览器完整报告和测试数据库留在被忽略的 `frontend/playwright-report`、`frontend/test-results`、`.runtime`，没有提交环境产物或会话数据。本次测试 API、worker、Vite 在验收后停止，未安装系统服务。

## 本地运行（显式测试环境）

原本机验收工作区已经安装依赖；本发布副本需独立安装。在项目根目录执行（先安装 Python 3.12、uv 与 Node 22+）：

```bash
uv venv --python python3.12 .venv
uv pip install --python .venv/bin/python -r backend/requirements-dev.txt
(cd frontend && npm ci --ignore-scripts --cache .npm-cache)
```

在 API 和 worker 的两个终端中，各自先执行以下公共配置。仅用于本机虚构样例，不能接收真实客户数据；密码是测试模式内置值 `FlowPilot-test-only-2026`。

```bash
cd flowpilot-public
mkdir -p .runtime
export FLOWPILOT_TEST_MODE=true WORKFLOW_ENGINE=local LLM_PROVIDER=fixture SMTP_ENABLED=false
export DATABASE_URL="sqlite:///$PWD/.runtime/local-test.db"
export PUBLIC_BASE_URL=http://127.0.0.1:15173
export DEMO_DATA_PATH="$PWD/data/leads.json"
```

终端 1 启动 API：

```bash
.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 18080
```

终端 2 启动 worker：

```bash
PYTHONPATH=backend .venv/bin/python -m app.worker
```

终端 3 启动前端（端口冲突会失败，不会切到其他端口）：

```bash
cd flowpilot-public/frontend
API_PROXY_TARGET=http://127.0.0.1:18080 npm run dev -- --host 127.0.0.1 --port 15173 --strictPort
```

访问 http://127.0.0.1:15173 。各终端 Ctrl-C 停止。数据保存在 `.runtime/local-test.db`，重复启动会保留本机测试进度。

重新验证：

```bash
cd flowpilot-public
.venv/bin/python -m pytest -q
.venv/bin/python -m unittest discover -s scripts/tests -p test_import_n8n.py -v
node --test n8n/custom-nodes/FlowPilotWebhook.test.cjs
(cd frontend && npm run typecheck && npm run build && npm run test:unit)
FLOWPILOT_ADMIN_PASSWORD=FlowPilot-test-only-2026 .venv/bin/python scripts/e2e.py --base-url http://127.0.0.1:18080 --report artifacts/private/local-http-fixture.json
(cd frontend && FLOWPILOT_ADMIN_PASSWORD=FlowPilot-test-only-2026 FLOWPILOT_BASE_URL=http://127.0.0.1:15173 npm run test:e2e)
```

后两个命令要求测试服务已启动。真实模型/完整 Compose 仍按 README 的独立初始化流程执行，不使用上述测试凭据。

## 实际修改

没有复现启动或核心业务代码故障，不做无依据业务改写。仅补齐 `.npm-cache/` 与 `*.tsbuildinfo` 忽略项，避免本地依赖缓存和 TypeScript 状态进入 Git；增加来源记录、接手说明、许可元数据和本机验收证据。原始导入与接手变更分开提交。公开历史只对本次新增溯源记录定点脱敏个人路径、私有聊天链接和 Library 标识，并对齐来源提交引用；代码、原许可证、原包清单和验收结果不变。完整私有历史保留在本机，不推送私有 refs、tags 或备份。

## 许可证与商业演示边界

原项目 LICENSE 为 MIT，原件保留；未自行选择或变更项目许可。默认 `qwen2.5:1.5b` 在 config、环境示例、Compose 和交付记录中已落实，模型权重未下载。官方模型 LICENSE 为 Apache-2.0：https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/raw/main/LICENSE 。这支持保留必要告知条件下的商业演示；3B 历史评估报告不代表 3B 商业授权，本次没有切换到 3B。

n8n 是 Sustainable Use License，不由项目 MIT 覆盖。官方 2026-10-06 FAQ 允许由组织内部创建/编辑工作流、客户仅接收输出的咨询场景；对外开放工作流配置、托管 n8n 服务或白标仍需相应商业许可，不能仅凭本次本地演示视为已授权：https://support.n8n.io/article/can-i-use-your-license-for-my-use-case 。许可正文：https://raw.githubusercontent.com/n8n-io/n8n/master/LICENSE.md 。本次未启动或分发 n8n。

33 项实际 Python 依赖的安装元数据见 `artifacts/local-python-dependencies.json`，193 项 npm 锁文件条目（含其他平台可选包，不代表全部已安装）见 `artifacts/local-node-dependencies.json`。大部分为 MIT/BSD/Apache/ISC 等；另有 psycopg 与 psycopg-binary 的 LGPL-3.0-only、certifi/Lightning CSS 的 MPL-2.0、caniuse-lite 的 CC-BY-4.0。保留原 `docs/SOURCES_AND_NOTICES.md`；依赖安装目录中的许可证未删改。当前记录属于元数据清点，尚不是面向二进制/容器再分发的逐文件 NOTICE 包或完整法务审核；对外打包前应按实际分发依赖整理告知及对应源码/替换要求。

## 下一步（按优先级）

1. P1：在本项目专用 Compose 栈验收真实 PostgreSQL+n8n 的启动、工作流导入/发布、持久化卷备份恢复；不要复用其他业务数据库或中断其服务。
2. P1：另行确认模型下载资源与凭据后，复跑 1.5B 真实模型严格 HTTP 验收；本次 fixture 不替代它。
3. P1：商业交付前按最终产品开放范围确认 n8n 授权，并补可分发第三方 NOTICE/许可文本与 LGPL/MPL 对应要求。
4. P2：移动视口、完整管理台交互与异常恢复浏览器回归；本次只执行原有 3 个测试体。
5. P2：外部 SMTP 需要单独授权和隔离收件目标；继续维持默认禁用，不能把测试箱通过等同邮件外发通过。
6. P3：评估上游 httpx/TestClient 弃用迁移与后端静态类型门禁；不因警告扩大本轮改造。
