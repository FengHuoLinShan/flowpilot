# 运行、恢复与客户移交 / Operations

## 启动和检查

```bash
docker compose up -d --build
docker compose ps
```

本地模型部署带 `--profile ollama`。测试部署给每条 Compose 命令加 `--env-file .env.test`。不要把两个环境的配置文件或密钥混用。服务列表包括 PostgreSQL、API、worker、n8n、frontend；Ollama 是可选 profile。

`/healthz` 检查 API 的服务和数据库可达性，模型的实际可用性通过 Settings 中的连接测试和 live-model 验收确认。API 健康不代表模型、SMTP 或外部网络均可用。

## 遇到失败时

| 观察到的现象 | 确认和处理 |
| --- | --- |
| 新事件一直 queued/retrying | 检查 worker、n8n 健康、Workflow 是否已发布，以及内部 key 是否一致 |
| 模型不存在/未配置 | 核对 provider、base URL、model；Ollama 先拉取对应权重 |
| 模型超时/限流 | 确认提供方可用性、配额和请求时延；调整有界超时/重试，不无限循环 |
| `MODEL_CONTEXT_LIMIT` | 精简当前输入或按实际模型扩大受支持上下文；不能靠静默截断继续 |
| 模型 JSON 不合法 | 检查模型能力和提示词；保留失败证据，人工校正或更换经过验收的模型 |
| `needs_review` | 查看缺失/歧义依据，在界面修正字段并记录理由 |
| n8n 原生状态 unknown | 配置 Public API Key，确认 execution 读取权限、URL 和历史保留策略 |
| CRM 节点失败 | 确认数据库可达性/约束或测试故障；修复后手动重试 |
| 审批 409 冲突 | 重新加载最新草稿/版本；不要强制覆盖他人的更新 |
| SMTP 不确定结果 | 查看发送服务器记录；核对后再决定下一次授权动作，不盲目重放 |

修复环境原因后，使用 FlowPilot Executions 的恢复入口。直接在 n8n 重放旧请求可能携带已经失效的派发 fence，因此被后端拒绝。不要通过改数据库状态来制造成功。

## 重启恢复的真实含义

事件、节点、草稿、决策和发件动作都在数据库中。worker 重启后重新扫描可执行任务；在途租约要到期才能安全重派。模型调用较慢时租约会适配调用预算，因此不是“重启后下一秒必定恢复”。n8n 自身中断后，也由业务租约和步骤幂等处理重放。已批准的投递不能因进程重启获得新的授权。

正常停止服务不应删除卷：

```bash
docker compose stop
```

不要把删除 volumes 作为故障恢复步骤。它会丢失业务记录、审批历史和 n8n 数据。`bootstrap.py` 不覆盖已有 env；重启时必须保留原有数据库和加密密钥。

## 备份和恢复演练

客户部署应把备份存到与主机独立的受控位置。业务库和 n8n 库分别备份；私有 `.env` 和 n8n 加密 key 由秘密管理方案保管。只备份数据库、不保留解密密钥，无法恢复其中的加密配置。

以下命令将数据库导出到操作者指定的本地文件；文件含业务数据，应存入受控目录：

```bash
docker compose exec -T postgres pg_dump -U postgres -Fc flowpilot > flowpilot-backup.dump
docker compose exec -T postgres pg_dump -U postgres -Fc n8n > n8n-backup.dump
```

在独立、空的恢复环境中使用 `pg_restore`，再运行真实 HTTP 验收。不要先在客户现有数据库上试恢复。PostgreSQL 主版本升级需要按 PostgreSQL 的迁移方法执行；当前 `create_all()` 只负责首次建表，不会升级已有表结构。

## 日志与凭据

业务界面显示受控错误码和节点记录；不打印完整认证头或密钥。n8n 使用随包的安全 Webhook 触发器，避免普通 Webhook 把内部认证头写进历史。API 和 nginx 默认关闭访问日志；不要把请求/响应全量转储作为常规诊断步骤。

n8n 原生执行保留策略与业务审计分开。删除或清理原生历史后，业务事件仍存在，但对应原生状态可能只能显示 unknown。需要更长审计保留时，明确备份、容量和数据访问范围。

## 本地反向代理

Compose API 不发布宿主机端口，仅在内部服务网络可达。nginx 覆写 `X-Forwarded-For` 为实际连接来源；API 信任此私有代理来获得客户 IP，使公开表单限流可工作。不要把 API 另行暴露到公网而仍保留无边界的转发头信任。客户增加外层 HTTPS 代理时，应重新定义可信代理和真实 IP 规则。

## English summary

Check real dependency health, fix the underlying error, and retry through FlowPilot. In-flight leases may need to expire before safe recovery. Preserve database volumes and encryption keys across restarts. Back up both databases and test restoration in a separate environment. Native n8n execution retention is separate from business audit retention. The private API trusts the bundled proxy only because the API has no published host port and nginx overwrites forwarding headers; reassess that trust when changing deployment topology.
