import { useEffect, useState } from "react";
import {
  Check,
  ChevronRight,
  Copy,
  Database,
  GitBranch,
  KeyRound,
  Link2,
  LockKeyhole,
  Mail,
  Network,
  Save,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  TestTube2,
  TriangleAlert,
  Webhook,
  XCircle,
} from "lucide-react";
import { useConsole } from "../lib/context";
import { patch, post } from "../lib/api";
import { useApiData } from "../lib/useApiData";
import { cn } from "../lib/utils";
import type { Settings } from "../lib/types";
import { Badge, Button, Field, Input, Select, Spinner } from "../components/ui";
import { InlineError, PageHeader } from "../components/shared";

type Section = "model" | "connections" | "email" | "deployment";
export function SettingsPage() {
  const { t, nonce, refresh, notify } = useConsole();
  const query = useApiData<Settings>("/settings", nonce, false);
  const [section, setSection] = useState<Section>("model");
  const [form, setForm] = useState<Settings | null>(null);
  const [key, setKey] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    provider?: string;
    model?: string;
  } | null>(null);
  useEffect(() => {
    if (query.data) {
      setForm(query.data);
      setKey("");
      setSmtpPassword("");
    }
  }, [query.data]);
  function update<K extends keyof Settings>(name: K, value: Settings[K]) {
    setForm((previous) =>
      previous ? { ...previous, [name]: value } : previous,
    );
    setTestResult(null);
  }
  async function save(test = false) {
    if (!form) return;
    setBusy(test ? "test" : "save");
    setError("");
    setTestResult(null);
    const payload: Record<string, unknown> =
      section === "email"
        ? {
            smtp_enabled: form.smtp_enabled,
            smtp_host: form.smtp_host,
            smtp_port: form.smtp_port,
            smtp_username: form.smtp_username,
            smtp_from: form.smtp_from,
            smtp_starttls: form.smtp_starttls,
          }
        : section === "model"
          ? {
              llm_provider: form.llm_provider,
              llm_base_url: form.llm_base_url,
              llm_model: form.llm_model,
              llm_timeout_seconds: form.llm_timeout_seconds,
              llm_max_retries: form.llm_max_retries,
            }
          : { company_name: form.company_name };
    if (key && section === "model") payload.llm_api_key = key;
    if (smtpPassword && section === "email")
      payload.smtp_password = smtpPassword;
    try {
      await patch("/settings", payload);
      setKey("");
      setSmtpPassword("");
      refresh();
      if (test) {
        const result = await post<{
          ok: boolean;
          message: string;
          provider?: string;
          model?: string;
        }>("/settings/model/test");
        setTestResult(result);
        notify(
          result.ok ? "success" : "error",
          result.ok
            ? result.provider === "fixture"
              ? t("测试替身已就绪", "Test fixture ready")
              : t("模型连接已验证", "Model connection verified")
            : t("模型连接未通过", "Model connection failed"),
          result.message,
        );
      } else notify("success", t("配置已保存", "Settings saved"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify("success", t("已复制", "Copied"));
    } catch {
      notify(
        "error",
        t(
          "无法自动复制，请手动选择文本",
          "Could not copy. Select the text manually.",
        ),
      );
    }
  }
  const nav: { id: Section; zh: string; en: string; icon: typeof Sparkles }[] =
    [
      { id: "model", zh: "AI 模型", en: "AI model", icon: Sparkles },
      {
        id: "connections",
        zh: "Webhook 与 CRM",
        en: "Webhook & CRM",
        icon: Link2,
      },
      { id: "email", zh: "邮件交付", en: "Email delivery", icon: Mail },
      { id: "deployment", zh: "工作空间", en: "Workspace", icon: Settings2 },
    ];
  return (
    <>
      <PageHeader
        eyebrow="WORKSPACE SETTINGS"
        title={t(
          "连接你的工具，保留你的控制权。",
          "Connect your tools. Keep your control.",
        )}
        description={t(
          "模型、业务入口与邮件服务的实际配置。凭据只写入服务端，不在页面返回。",
          "Real model, intake, and email settings. Credentials are write-only and never returned to the browser.",
        )}
      />
      {query.error && (
        <InlineError
          message={query.error}
          onRetry={() => void query.refresh()}
        />
      )}
      {query.loading || !form ? (
        <section className="panel">
          <Spinner />
        </section>
      ) : (
        <div className="settings-layout">
          <aside className="settings-nav-list">
            {nav.map((item) => (
              <button
                key={item.id}
                className={section === item.id ? "active" : ""}
                onClick={() => {
                  setSection(item.id);
                  setError("");
                }}
              >
                <item.icon size={18} />
                {t(item.zh, item.en)}
                <ChevronRight size={14} />
              </button>
            ))}
            <div className="settings-security-note">
              <LockKeyhole size={20} />
              <b>{t("凭据留在服务端", "Secrets stay on the server")}</b>
              <p>
                {t(
                  "页面只展示是否已配置，留空表示保留现有凭据。",
                  "Only configuration status is visible. Leave a field blank to keep its current secret.",
                )}
              </p>
            </div>
          </aside>
          <section className="panel settings-panel">
            {section === "model" && (
              <>
                <div className="settings-section-heading">
                  <div className="settings-section-icon">
                    <Sparkles size={22} />
                  </div>
                  <div>
                    <h2>{t("AI 业务理解", "AI business understanding")}</h2>
                    <p>
                      {t(
                        "接入真实模型，提取客户需求并起草跟进邮件。",
                        "Connect a real model to extract lead information and draft follow-ups.",
                      )}
                    </p>
                  </div>
                  <Badge
                    tone={
                      form.llm_provider === "fixture"
                        ? "amber"
                        : form.llm_api_key_configured ||
                            form.llm_provider === "ollama"
                          ? "green"
                          : "neutral"
                    }
                  >
                    {form.llm_provider === "fixture"
                      ? t("测试替身", "Test fixture")
                      : form.llm_provider === "ollama"
                        ? "Ollama"
                        : form.llm_api_key_configured
                          ? t("密钥已配置", "Key configured")
                          : t("待配置", "Not configured")}
                  </Badge>
                </div>
                <div className="settings-body">
                  <Field
                    label={t("模型服务", "Model provider")}
                    id="model-provider"
                  >
                    <Select
                      id="model-provider"
                      value={form.llm_provider}
                      onChange={(e) => update("llm_provider", e.target.value)}
                    >
                      <option value="openai_compatible">
                        {t("OpenAI 兼容接口", "OpenAI-compatible API")}
                      </option>
                      <option value="ollama">
                        {t("Ollama 本地模型", "Ollama local model")}
                      </option>
                      {form.test_mode && (
                        <option value="fixture">
                          {t(
                            "测试替身（不是真实 LLM）",
                            "Test fixture (not a real LLM)",
                          )}
                        </option>
                      )}
                    </Select>
                  </Field>
                  {form.llm_provider === "fixture" && (
                    <div className="inline-warning">
                      <TriangleAlert size={19} />
                      <span>
                        {t(
                          "这是确定性的测试替身，仅用于业务自动化测试。它不验证真实模型效果。",
                          "This deterministic fixture is for workflow contract tests. It does not validate real model quality.",
                        )}
                      </span>
                    </div>
                  )}
                  <div className="form-grid">
                    <Field
                      label={t("服务地址", "Base URL")}
                      id="model-url"
                      hint={t(
                        "由服务端访问，Ollama 示例：http://ollama:11434",
                        "Accessed by the server. Ollama example: http://ollama:11434",
                      )}
                    >
                      <Input
                        id="model-url"
                        type="url"
                        value={form.llm_base_url || ""}
                        onChange={(e) => update("llm_base_url", e.target.value)}
                        placeholder={
                          form.llm_provider === "ollama"
                            ? "http://ollama:11434"
                            : "https://api.example.com/v1"
                        }
                      />
                    </Field>
                    <Field
                      label={t("模型名称", "Model name")}
                      id="model-name"
                      hint={t(
                        "填写服务商支持或本机已拉取的准确模型名称。",
                        "Use the exact model ID supported by your provider or installed locally.",
                      )}
                    >
                      <Input
                        id="model-name"
                        value={form.llm_model || ""}
                        onChange={(e) => update("llm_model", e.target.value)}
                        placeholder={t("准确的模型 ID", "Exact model ID")}
                      />
                    </Field>
                  </div>
                  {form.llm_provider !== "ollama" &&
                    form.llm_provider !== "fixture" && (
                      <Field
                        label={t("API 密钥", "API key")}
                        id="model-key"
                        hint={
                          form.llm_api_key_configured
                            ? t(
                                "已配置。留空保留现有密钥，输入新值替换。",
                                "Configured. Leave blank to keep it, or enter a new value to replace it.",
                              )
                            : t(
                                "输入服务商提供的密钥。此值不会从服务端返回。",
                                "Enter the provider credential. It will never be returned by the server.",
                              )
                        }
                      >
                        <div className="secret-field">
                          <KeyRound size={16} />
                          <Input
                            id="model-key"
                            type="password"
                            autoComplete="new-password"
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            placeholder={
                              form.llm_api_key_configured
                                ? "••••••••  " + t("已配置", "Configured")
                                : t("输入 API 密钥", "Enter API key")
                            }
                          />
                        </div>
                      </Field>
                    )}
                  <div className="form-grid">
                    <Field
                      label={t("单次超时（秒）", "Request timeout (seconds)")}
                      id="model-timeout"
                    >
                      <Input
                        id="model-timeout"
                        type="number"
                        min={5}
                        max={120}
                        value={form.llm_timeout_seconds}
                        onChange={(e) =>
                          update("llm_timeout_seconds", Number(e.target.value))
                        }
                      />
                    </Field>
                    <Field
                      label={t("模型最大重试次数", "Maximum model retries")}
                      id="model-retries"
                    >
                      <Input
                        id="model-retries"
                        type="number"
                        min={0}
                        max={3}
                        value={form.llm_max_retries}
                        onChange={(e) =>
                          update("llm_max_retries", Number(e.target.value))
                        }
                      />
                    </Field>
                  </div>
                  <div className="info-panel">
                    <ShieldCheck size={19} />
                    <p>
                      {t(
                        "模型输出必须通过结构化校验。优先级、分类、是否需要人工审核由服务端业务规则决定。",
                        "Model output must pass schema validation. Server-side business rules decide priority, classification, and manual review.",
                      )}
                    </p>
                  </div>
                  {testResult && (
                    <div
                      className={cn(
                        "model-test-result",
                        testResult.ok
                          ? "model-test-success"
                          : "model-test-error",
                      )}
                    >
                      {testResult.ok ? (
                        <Check size={19} />
                      ) : (
                        <XCircle size={19} />
                      )}
                      <div>
                        <b>
                          {testResult.ok
                            ? testResult.provider === "fixture"
                              ? t("测试替身已就绪", "Test fixture ready")
                              : t(
                                  "真实连接测试通过",
                                  "Live connection test passed",
                                )
                            : t("连接测试失败", "Connection test failed")}
                        </b>
                        <p>{testResult.message}</p>
                        <small>
                          {testResult.provider} · {testResult.model}
                        </small>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            {section === "connections" && (
              <>
                <div className="settings-section-heading">
                  <div className="settings-section-icon">
                    <Network size={22} />
                  </div>
                  <div>
                    <h2>{t("业务系统连接", "Business connections")}</h2>
                    <p>
                      {t(
                        "接收客户事件，执行真实 CRM 操作。",
                        "Receive customer events and execute real CRM actions.",
                      )}
                    </p>
                  </div>
                </div>
                <div className="settings-body">
                  <div className="integration-card">
                    <div className="integration-title">
                      <Webhook size={23} />
                      <div>
                        <h3>Webhook</h3>
                        <p>
                          {t(
                            "服务端接收事件的鉴权入口",
                            "Authenticated event intake endpoint",
                          )}
                        </p>
                      </div>
                      <Badge
                        tone={form.webhook_key_configured ? "green" : "amber"}
                      >
                        {form.webhook_key_configured
                          ? t("鉴权已配置", "Authentication configured")
                          : t("未配置密钥", "Key missing")}
                      </Badge>
                    </div>
                    <Field label={t("Webhook 地址", "Webhook endpoint")}>
                      <div className="copy-field">
                        <code>
                          {form.webhook_url ||
                            `${form.public_base_url}/api/webhooks/leads`}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            void copy(
                              form.webhook_url ||
                                `${form.public_base_url}/api/webhooks/leads`,
                            )
                          }
                          aria-label={t(
                            "复制 Webhook 地址",
                            "Copy webhook URL",
                          )}
                        >
                          <Copy size={15} />
                        </Button>
                      </div>
                    </Field>
                    <div className="code-example">
                      <span>POST · Content-Type: application/json</span>
                      <pre>{`X-Webhook-Key: <YOUR_WEBHOOK_KEY>\nIdempotency-Key: <UNIQUE_EVENT_KEY>\n\n{\n  "name": "Alex Chen",\n  "company": "Example Company",\n  "email": "alex@example.com",\n  "message": "We need a warehouse automation proposal",\n  "is_test": true\n}`}</pre>
                    </div>
                    <p className="field-hint">
                      {t(
                        "Webhook 密钥在部署环境中管理。相同幂等键不能用于不同内容。",
                        "Webhook keys are managed in deployment configuration. A key cannot be reused for different content.",
                      )}
                    </p>
                  </div>
                  <div className="integration-card">
                    <div className="integration-title">
                      <Database size={23} />
                      <div>
                        <h3>{t("内置 CRM", "Built-in CRM")}</h3>
                        <p>
                          {t(
                            "联系人、公司、线索、任务与操作日志",
                            "Contacts, companies, leads, tasks, and audit records",
                          )}
                        </p>
                      </div>
                      <Badge tone="green">{t("已启用", "Enabled")}</Badge>
                    </div>
                    <p>
                      {t(
                        "默认使用真实内置数据模块。外部 CRM Adapter 已预留，未配置时不会声称同步成功。",
                        "The built-in data module is active. External CRM adapters are reserved; no external sync is claimed without an implementation and configuration.",
                      )}
                    </p>
                    <div className="future-integrations">
                      <span>
                        HubSpot <Badge>{t("未接入", "Not connected")}</Badge>
                      </span>
                      <span>
                        GoHighLevel{" "}
                        <Badge>{t("未接入", "Not connected")}</Badge>
                      </span>
                    </div>
                  </div>
                  <div className="integration-card">
                    <div className="integration-title">
                      <GitBranch size={23} />
                      <div>
                        <h3>{t("工作流执行引擎", "Workflow engine")}</h3>
                        <p>
                          {form.engine === "n8n"
                            ? t(
                                "由 n8n 调用真实业务 API，回传执行标识。",
                                "n8n calls real business APIs and reports execution identifiers.",
                              )
                            : t(
                                "当前使用本地持久化执行器；这不代表 n8n 集成已验证。",
                                "Currently using the local durable executor. This does not validate the n8n integration.",
                              )}
                        </p>
                      </div>
                      <Badge tone="blue">{form.engine}</Badge>
                    </div>
                    <div className="settings-readonly">
                      <span>{t("编排服务", "Orchestration service")}</span>
                      <code>{form.n8n_base_url || "—"}</code>
                    </div>
                    <p className="field-hint">
                      {t(
                        "执行引擎和内部鉴权在部署环境中配置；页面不返回内部密钥。",
                        "Engine and internal authentication are configured during deployment. Internal keys are never returned here.",
                      )}
                    </p>
                  </div>
                </div>
              </>
            )}
            {section === "email" && (
              <>
                <div className="settings-section-heading">
                  <div className="settings-section-icon">
                    <Mail size={22} />
                  </div>
                  <div>
                    <h2>
                      {t("邮件与人工授权", "Email and human authorization")}
                    </h2>
                    <p>
                      {t(
                        "默认测试发件箱；真实外发需要多重明确授权。",
                        "Test outbox by default. Real delivery requires explicit authorization.",
                      )}
                    </p>
                  </div>
                </div>
                <div className="settings-body">
                  <div className="outbox-settings-card">
                    <span>
                      <InboxIcon />
                    </span>
                    <div>
                      <h3>{t("内置测试发件箱", "Built-in test outbox")}</h3>
                      <p>
                        {t(
                          "始终可用，不依赖 SMTP，不对外发送。",
                          "Always available. No SMTP required, no external delivery.",
                        )}
                      </p>
                    </div>
                    <Badge tone="green">{t("默认", "Default")}</Badge>
                  </div>
                  <label className="check-row smtp-toggle">
                    <input
                      type="checkbox"
                      checked={form.smtp_enabled}
                      onChange={(e) => update("smtp_enabled", e.target.checked)}
                    />
                    <span>
                      <b>
                        {t(
                          "启用 SMTP 外部发送能力",
                          "Enable external SMTP delivery",
                        )}
                      </b>
                      <small>
                        {t(
                          "启用后仍须在每条审批中明确选择并授权外发；测试事件永不外发。",
                          "Each approval still requires explicit external-send authorization. Test events can never be sent externally.",
                        )}
                      </small>
                    </span>
                  </label>
                  <div className="form-grid">
                    <Field label={t("SMTP 主机", "SMTP host")} id="smtp-host">
                      <Input
                        id="smtp-host"
                        value={form.smtp_host || ""}
                        onChange={(e) => update("smtp_host", e.target.value)}
                        placeholder="smtp.example.com"
                      />
                    </Field>
                    <Field label={t("端口", "Port")} id="smtp-port">
                      <Input
                        id="smtp-port"
                        type="number"
                        min={1}
                        max={65535}
                        value={form.smtp_port || 587}
                        onChange={(e) =>
                          update("smtp_port", Number(e.target.value))
                        }
                      />
                    </Field>
                    <Field label={t("用户名", "Username")} id="smtp-user">
                      <Input
                        id="smtp-user"
                        autoComplete="off"
                        value={form.smtp_username || ""}
                        onChange={(e) =>
                          update("smtp_username", e.target.value)
                        }
                      />
                    </Field>
                    <Field
                      label={t("密码 / 授权码", "Password / app password")}
                      id="smtp-password"
                      hint={
                        form.smtp_password_configured
                          ? t(
                              "已配置。留空保留。",
                              "Configured. Leave blank to keep.",
                            )
                          : t(
                              "凭据只写入服务端。",
                              "Write-only server credential.",
                            )
                      }
                    >
                      <Input
                        id="smtp-password"
                        type="password"
                        autoComplete="new-password"
                        value={smtpPassword}
                        onChange={(e) => setSmtpPassword(e.target.value)}
                        placeholder={
                          form.smtp_password_configured ? "••••••••" : ""
                        }
                      />
                    </Field>
                  </div>
                  <Field label={t("发件人邮箱", "Sender email")} id="smtp-from">
                    <Input
                      id="smtp-from"
                      type="email"
                      value={form.smtp_from || ""}
                      onChange={(e) => update("smtp_from", e.target.value)}
                      placeholder="sales@example.com"
                    />
                  </Field>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={form.smtp_starttls}
                      onChange={(e) =>
                        update("smtp_starttls", e.target.checked)
                      }
                    />
                    <span>
                      <b>STARTTLS</b>
                      <small>
                        {t(
                          "通过受验证的加密连接发送 SMTP 邮件。",
                          "Use a verified encrypted connection for SMTP.",
                        )}
                      </small>
                    </span>
                  </label>
                  <div className="info-panel">
                    <ShieldCheck size={19} />
                    <p>
                      {t(
                        "FlowPilot 不承诺 SMTP 网络层的 exactly-once。若外部投递结果不确定，系统停止自动重发并要求人工核对。",
                        "SMTP cannot guarantee exactly-once delivery. If delivery is ambiguous, FlowPilot stops automatic resend and requires human reconciliation.",
                      )}
                    </p>
                  </div>
                </div>
              </>
            )}
            {section === "deployment" && (
              <>
                <div className="settings-section-heading">
                  <div className="settings-section-icon">
                    <Server size={22} />
                  </div>
                  <div>
                    <h2>
                      {t(
                        "工作空间与运行边界",
                        "Workspace and runtime boundaries",
                      )}
                    </h2>
                    <p>
                      {t(
                        "一个公司、一个独立部署，配置与执行状态透明可查。",
                        "One company, one deployment, with transparent runtime boundaries.",
                      )}
                    </p>
                  </div>
                </div>
                <div className="settings-body">
                  <Field
                    label={t("公司名称", "Company name")}
                    id="workspace-name"
                  >
                    <Input
                      id="workspace-name"
                      value={form.company_name}
                      onChange={(e) => update("company_name", e.target.value)}
                      maxLength={200}
                    />
                  </Field>
                  <div className="settings-readonly">
                    <span>{t("公开服务地址", "Public service URL")}</span>
                    <code>{form.public_base_url}</code>
                  </div>
                  <div className="settings-readonly">
                    <span>{t("工作流引擎", "Workflow engine")}</span>
                    <Badge tone="blue">{form.engine}</Badge>
                  </div>
                  <div className="settings-readonly">
                    <span>{t("测试模式", "Test mode")}</span>
                    <Badge tone={form.test_mode ? "amber" : "neutral"}>
                      {form.test_mode
                        ? t("已启用", "Enabled")
                        : t("未启用", "Disabled")}
                    </Badge>
                  </div>
                  <div className="settings-readonly">
                    <span>{t("故障注入", "Fault injection")}</span>
                    <Badge
                      tone={form.fault_injection_enabled ? "amber" : "neutral"}
                    >
                      {form.fault_injection_enabled
                        ? t("仅测试事件可用", "Test events only")
                        : t("未启用", "Disabled")}
                    </Badge>
                  </div>
                  <div className="boundary-list">
                    <h3>{t("当前版本边界", "Current release scope")}</h3>
                    <p>
                      <Check size={15} />
                      {t(
                        "已实现：线索入口、业务理解、内置 CRM、审批与发件箱。",
                        "Implemented: intake, AI understanding, built-in CRM, approvals, and outbox.",
                      )}
                    </p>
                    <p>
                      <Check size={15} />
                      {t(
                        "一个公司工作空间，管理员登录与受鉴权 API。",
                        "Single-company workspace with administrator login and authenticated APIs.",
                      )}
                    </p>
                    <p>
                      <TriangleAlert size={15} />
                      {t(
                        "尚未实现：多租户、外部 CRM 同步、通用流程编辑器。",
                        "Not implemented: multi-tenancy, external CRM sync, or a generic workflow editor.",
                      )}
                    </p>
                    <p>
                      <TriangleAlert size={15} />
                      {t(
                        "文档、订单、ERP 等仅预留扩展接口。",
                        "Document, order, and ERP scenarios are extension points only.",
                      )}
                    </p>
                  </div>
                </div>
              </>
            )}
            {error && (
              <div className="settings-error">
                <InlineError message={error} />
              </div>
            )}
            {section !== "connections" && (
              <div className="settings-actions">
                <span>
                  <LockKeyhole size={13} />
                  {t(
                    "密钥不会出现在响应或日志中",
                    "Secrets are never returned or logged",
                  )}
                </span>
                <div>
                  {section === "model" && (
                    <Button
                      variant="outline"
                      disabled={!!busy}
                      loading={busy === "test"}
                      onClick={() => void save(true)}
                    >
                      <TestTube2 size={15} />
                      {t("保存并测试连接", "Save & test connection")}
                    </Button>
                  )}
                  <Button
                    loading={busy === "save"}
                    disabled={!!busy}
                    onClick={() => void save()}
                  >
                    <Save size={15} />
                    {t("保存配置", "Save settings")}
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function InboxIcon() {
  return <Mail size={23} />;
}
