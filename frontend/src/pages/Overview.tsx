import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  GitBranch,
  Inbox,
  Layers3,
  Mail,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Upload,
  UsersRound,
  Workflow,
} from "lucide-react";
import { useConsole } from "../lib/context";
import { post } from "../lib/api";
import { useApiData } from "../lib/useApiData";
import type { EventRecord, Execution } from "../lib/types";
import { asList, cn, dateTime, shortId } from "../lib/utils";
import { Badge, Button, Input, Select, Spinner } from "../components/ui";
import {
  Empty,
  EventsTable,
  InlineError,
  Metric,
  NativeStatus,
  PageHeader,
  Pipeline,
  RetryButton,
  StatusBadge,
} from "../components/shared";

export function DashboardPage({
  actions,
  onNewLead,
  onTest,
  testBusy,
}: {
  actions: ReactNode;
  onNewLead: () => void;
  onTest: () => void;
  testBusy: boolean;
}) {
  const { t, dashboard: data, navigate, openEvent, lang } = useConsole();
  const attention =
    (data?.pending_approvals || 0) +
    (data?.needs_review || 0) +
    (data?.failed_executions || 0);
  const statuses = [
    { key: "succeeded", label: t("已完成", "Completed"), color: "green" },
    {
      key: "waiting_approval",
      label: t("待审批", "Approval"),
      color: "purple",
    },
    { key: "needs_review", label: t("待确认", "Review"), color: "amber" },
    { key: "running", label: t("执行中", "Running"), color: "blue" },
    { key: "failed", label: t("异常", "Failed"), color: "red" },
    { key: "queued", label: t("等待执行", "Queued"), color: "neutral" },
  ];
  const statusTotal = Object.values(data?.status_counts || {}).reduce(
    (a, b) => a + b,
    0,
  );
  return (
    <>
      <PageHeader
        eyebrow="OPERATIONS OVERVIEW"
        title={t(
          "让每一条线索，走到下一步。",
          "Every lead deserves a next step.",
        )}
        description={t(
          "AI 整理需求，流程执行任务，关键决定留给你。",
          "AI understands the inquiry. Workflows do the work. You make the decisions.",
        )}
        actions={actions}
      />
      <div className="overview-status">
        <span>
          <i
            className={cn("live-dot", !data?.model_configured && "dot-amber")}
          />
          {data
            ? data.model_configured
              ? t("业务流程已配置", "Workflow configured")
              : t("连接模型后即可开始", "Connect a model to get started")
            : t("正在读取运行状态…", "Reading workflow status…")}
        </span>
        <span className="overview-status-right">
          <ShieldCheck size={13} />
          {t("默认测试发件箱", "Test outbox by default")}
          <span className="status-divider" />
          {data?.service_time ? dateTime(data.service_time, lang, true) : "—"}
        </span>
      </div>
      <div className="metrics-grid">
        <Metric
          label={t("今日接收线索", "Leads received today")}
          value={data?.today_received ?? "—"}
          icon={Inbox}
          detail={t("表单、CSV 与 Webhook", "Forms, CSV & webhooks")}
        />
        <Metric
          label={t("今日完成处理", "Completed today")}
          value={data?.today_processed ?? "—"}
          icon={CheckCheck}
          detail={t("以服务端完成记录为准", "Verified server completions")}
          tone="green"
        />
        <Metric
          label={t("等待你的审批", "Awaiting your approval")}
          value={data?.pending_approvals ?? "—"}
          icon={FileCheck2}
          detail={t("邮件已起草，尚未发送", "Drafts ready, not yet sent")}
          tone="purple"
        />
        <Metric
          label={t("需要关注", "Needs attention")}
          value={data ? attention - data.pending_approvals : "—"}
          icon={TriangleAlert}
          detail={t("执行异常与信息待确认", "Errors & missing information")}
          tone="amber"
        />
      </div>
      {!data?.model_configured && data && (
        <button className="setup-banner" onClick={() => navigate("settings")}>
          <div className="setup-icon">
            <Sparkles size={20} />
          </div>
          <div>
            <b>
              {t(
                "接入你的模型，激活业务理解",
                "Connect your model to enable AI understanding",
              )}
            </b>
            <span>
              {t(
                "支持 OpenAI 兼容服务与 Ollama。缺少配置时会保留事件并显示错误，供修复后重试。",
                "Supports OpenAI-compatible services and Ollama. Events are retained for retry when configuration is missing.",
              )}
            </span>
          </div>
          <ArrowRight size={19} />
        </button>
      )}
      <div className="overview-main-grid">
        <section className="panel process-overview">
          <div className="panel-header">
            <div>
              <div className="section-eyebrow">LEAD-TO-FOLLOW-UP</div>
              <h2>{t("一条线索的完整旅程", "From inquiry to follow-up")}</h2>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("workflow")}
            >
              {t("查看流程", "View workflow")}
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="journey-overview">
            <div className="journey-route">
              <div className="journey-item">
                <span className="journey-icon journey-blue">
                  <Inbox size={21} />
                </span>
                <b>{t("接收", "Receive")}</b>
                <small>{t("校验与去重", "Validate & deduplicate")}</small>
              </div>
              <div className="journey-dash">
                <ChevronRight size={14} />
              </div>
              <div className="journey-item">
                <span className="journey-icon journey-coral">
                  <Sparkles size={21} />
                </span>
                <b>{t("理解", "Understand")}</b>
                <small>{t("提取与分类", "Extract & classify")}</small>
              </div>
              <div className="journey-dash">
                <ChevronRight size={14} />
              </div>
              <div className="journey-item">
                <span className="journey-icon journey-sage">
                  <UsersRound size={21} />
                </span>
                <b>CRM</b>
                <small>{t("匹配与更新", "Match & update")}</small>
              </div>
              <div className="journey-dash">
                <ChevronRight size={14} />
              </div>
              <div className="journey-item">
                <span className="journey-icon journey-purple">
                  <ShieldCheck size={21} />
                </span>
                <b>{t("审批", "Approve")}</b>
                <small>{t("编辑与授权", "Edit & authorize")}</small>
              </div>
              <div className="journey-dash">
                <ChevronRight size={14} />
              </div>
              <div className="journey-item">
                <span className="journey-icon journey-sand">
                  <Mail size={21} />
                </span>
                <b>{t("交付", "Deliver")}</b>
                <small>{t("发送或保存", "Send or save")}</small>
              </div>
            </div>
            <div className="journey-note">
              <span>
                <Layers3 size={14} />
                {t("内置 CRM", "Built-in CRM")}
              </span>
              <span>
                <GitBranch size={14} />
                {data?.engine === "n8n"
                  ? t("n8n 编排", "n8n orchestration")
                  : data?.engine === "local"
                    ? t("本地引擎 · 非 n8n", "Local engine · not n8n")
                    : t("读取执行引擎…", "Loading engine…")}
              </span>
              <span>
                <ShieldCheck size={14} />
                {t("审批后交付", "Approval required")}
              </span>
            </div>
          </div>
          <div className="process-stats">
            <div>
              <b>{data?.contacts ?? "—"}</b>
              <span>{t("客户联系人", "CRM contacts")}</span>
            </div>
            <div>
              <b>{data?.total_leads ?? "—"}</b>
              <span>{t("业务线索", "CRM leads")}</span>
            </div>
            <div>
              <b>{data?.test_messages ?? "—"}</b>
              <span>{t("测试发件箱记录", "Test outbox records")}</span>
            </div>
          </div>
        </section>
        <section className="panel attention-panel">
          <div className="panel-header">
            <div>
              <div className="section-eyebrow">YOUR NEXT ACTION</div>
              <h2>{t("需要你的一步", "Your next move")}</h2>
            </div>
            <span className="attention-count">{attention}</span>
          </div>
          <button
            className="attention-item"
            onClick={() => navigate("approvals")}
          >
            <span className="attention-icon attention-purple">
              <FileCheck2 size={19} />
            </span>
            <div>
              <b>{t("确认跟进邮件", "Review follow-up drafts")}</b>
              <p>
                {t(
                  "查看 AI 草稿，批准后进入发件箱",
                  "Review drafts before outbox delivery",
                )}
              </p>
            </div>
            <strong>{data?.pending_approvals ?? "—"}</strong>
            <ChevronRight size={16} />
          </button>
          <button className="attention-item" onClick={() => navigate("inbox")}>
            <span className="attention-icon attention-amber">
              <UsersRound size={19} />
            </span>
            <div>
              <b>{t("补充客户信息", "Complete lead details")}</b>
              <p>
                {t(
                  "确认缺失或不确定的字段",
                  "Resolve missing or uncertain fields",
                )}
              </p>
            </div>
            <strong>{data?.needs_review ?? "—"}</strong>
            <ChevronRight size={16} />
          </button>
          <button
            className="attention-item"
            onClick={() => navigate("executions")}
          >
            <span className="attention-icon attention-red">
              <RefreshCw size={18} />
            </span>
            <div>
              <b>{t("处理执行异常", "Resolve execution issues")}</b>
              <p>
                {t("检查错误并安全重新执行", "Inspect errors and retry safely")}
              </p>
            </div>
            <strong>{data?.failed_executions ?? "—"}</strong>
            <ChevronRight size={16} />
          </button>
          <div className="attention-footnote">
            <CheckCircle2 size={15} />
            {t("每一次决定都会保留操作记录", "Every decision is recorded")}
          </div>
        </section>
      </div>
      <div className="overview-bottom-grid">
        <section className="panel recent-panel">
          <div className="panel-header">
            <div className="heading-with-count">
              <h2>{t("最近收到的线索", "Recent leads")}</h2>
              {data && <Badge>{data.recent_events?.length || 0}</Badge>}
            </div>
            <button className="text-button" onClick={() => navigate("inbox")}>
              {t("查看全部", "View all")}
              <ArrowRight size={15} />
            </button>
          </div>
          <EventsTable
            events={(data?.recent_events || []).slice(0, 6)}
            loading={!data}
            compact
          />
          {data && !data.recent_events?.length && (
            <div className="empty-inline-actions">
              <Button variant="outline" size="sm" onClick={onNewLead}>
                <Plus size={14} />
                {t("提交第一条线索", "Submit your first lead")}
              </Button>
              <Button size="sm" onClick={onTest} loading={testBusy}>
                <Play size={13} />
                {t("运行示例", "Run samples")}
              </Button>
            </div>
          )}
        </section>
        <section className="panel activity-panel">
          <div className="panel-header">
            <h2>{t("运行脉搏", "Execution pulse")}</h2>
            <Radio size={18} className="muted" />
          </div>
          <div className="status-overview">
            <div className="status-overview-number">
              <strong>{statusTotal}</strong>
              <span>{t("当前事件", "current events")}</span>
            </div>
            <div className="status-bar">
              {statusTotal > 0 ? (
                statuses.map(
                  (status) =>
                    (data?.status_counts?.[status.key] || 0) > 0 && (
                      <span
                        key={status.key}
                        className={`segment-${status.color}`}
                        style={{ flex: data!.status_counts[status.key] }}
                        title={`${status.label}: ${data!.status_counts[status.key]}`}
                      />
                    ),
                )
              ) : (
                <span className="segment-empty" />
              )}
            </div>
            <div className="status-legend">
              {statuses.map((status) => (
                <div key={status.key}>
                  <span>
                    <i className={`segment-${status.color}`} />
                    {status.label}
                  </span>
                  <b>{data?.status_counts?.[status.key] || 0}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="last-execution">
            <span className="small-label">
              {t("最近执行", "LATEST EXECUTION")}
            </span>
            {data?.recent_executions?.[0] ? (
              <button
                onClick={() => openEvent(data.recent_executions[0].event_id)}
              >
                <span className="mono">
                  #{shortId(data.recent_executions[0].id)}
                </span>
                <StatusBadge status={data.recent_executions[0].status} />
                <ArrowRight size={14} />
              </button>
            ) : (
              <p>
                {t(
                  "提交线索后显示真实执行状态",
                  "Submit a lead to view execution status",
                )}
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

export function InboxPage({
  search,
  setSearch,
  onNewLead,
  onImport,
}: {
  search: string;
  setSearch: (value: string) => void;
  onNewLead: () => void;
  onImport: () => void;
}) {
  const { t, nonce, dashboard } = useConsole();
  const [status, setStatus] = useState("");
  const [testFilter, setTestFilter] = useState("");
  const [queryText, setQueryText] = useState(search);
  useEffect(() => {
    const timer = window.setTimeout(() => setQueryText(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const params = new URLSearchParams({ limit: "100" });
  if (queryText) params.set("q", queryText);
  if (status) params.set("status", status);
  if (testFilter) params.set("is_test", testFilter);
  const result = useApiData<{ items: EventRecord[]; total: number }>(
    `/events?${params}`,
    nonce,
  );
  const events = asList<EventRecord>(result.data);
  return (
    <>
      <PageHeader
        eyebrow="LEAD INBOX"
        title={t("每一次咨询，都在这里。", "A home for every inquiry.")}
        description={t(
          "统一接收表单、导入与 API 线索，沿着实际执行记录追踪进展。",
          "Forms, imports, and API leads in one place, with their actual processing history.",
        )}
        actions={
          <>
            <Button variant="outline" onClick={onImport}>
              <Upload size={16} />
              {t("导入 CSV", "Import CSV")}
            </Button>
            <Button onClick={onNewLead}>
              <Plus size={16} />
              {t("提交线索", "New lead")}
            </Button>
          </>
        }
      />
      <div className="section-tabs">
        <button
          className={!status ? "active" : ""}
          onClick={() => setStatus("")}
        >
          {t("全部线索", "All leads")}
        </button>
        <button
          className={status === "needs_review" ? "active" : ""}
          onClick={() => setStatus("needs_review")}
        >
          {t("待人工确认", "Needs review")}
          {Boolean(dashboard?.needs_review) && (
            <span>{dashboard!.needs_review}</span>
          )}
        </button>
        <button
          className={status === "waiting_approval" ? "active" : ""}
          onClick={() => setStatus("waiting_approval")}
        >
          {t("待审批", "Awaiting approval")}
        </button>
        <button
          className={status === "failed" ? "active" : ""}
          onClick={() => setStatus("failed")}
        >
          {t("执行异常", "Failed")}
        </button>
        <button
          className={status === "succeeded" ? "active" : ""}
          onClick={() => setStatus("succeeded")}
        >
          {t("已完成", "Completed")}
        </button>
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <div className="table-search">
            <Search size={16} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(
                "搜索姓名、公司、邮箱或需求…",
                "Search name, company, email, or inquiry…",
              )}
              aria-label={t("搜索线索", "Search leads")}
            />
          </div>
          <div className="toolbar-right">
            <Select
              aria-label={t("数据类型", "Data type")}
              value={testFilter}
              onChange={(e) => setTestFilter(e.target.value)}
            >
              <option value="">{t("全部数据", "All data")}</option>
              <option value="true">{t("测试数据", "Test data")}</option>
              <option value="false">{t("真实业务", "Real business")}</option>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void result.refresh()}
              title={t("刷新", "Refresh")}
              aria-label={t("刷新", "Refresh")}
            >
              <RefreshCw size={16} />
            </Button>
          </div>
        </div>
        {result.error && (
          <InlineError
            message={result.error}
            onRetry={() => void result.refresh()}
          />
        )}
        <EventsTable events={events} loading={result.loading} />
        <div className="table-footer">
          <span>
            {t(
              `显示 ${events.length} 条，共 ${result.data?.total || 0} 条线索`,
              `Showing ${events.length} of ${result.data?.total || 0} leads`,
            )}
          </span>
          <span>
            <Activity size={13} />
            {t(
              "状态每 2.5 秒从服务端刷新",
              "Server status refreshes every 2.5s",
            )}
          </span>
        </div>
      </section>
      <div className="helper-note">
        <ShieldCheck size={15} />
        {t(
          "同一事件重复触发会自动去重；同一客户的新需求会关联现有联系人。",
          "Repeated event submissions are deduplicated; new inquiries from an existing customer are linked to their contact.",
        )}
      </div>
    </>
  );
}

export function WorkflowPage({
  onTest,
  testBusy,
}: {
  onTest: () => void;
  testBusy: boolean;
}) {
  const { t, nonce, dashboard, lang, openEvent, notify, refresh } =
    useConsole();
  const executionsQuery = useApiData<{ items: Execution[] }>(
    "/executions?limit=30",
    nonce,
  );
  const executions = asList<Execution>(executionsQuery.data);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    selectedId ||
    executions.find((x) =>
      ["running", "retrying", "queued", "waiting_approval"].includes(x.status),
    )?.id ||
    executions[0]?.id ||
    null;
  const detailQuery = useApiData<Execution>(
    selected ? `/executions/${selected}` : null,
    nonce,
  );
  const execution = detailQuery.data;
  const [retrying, setRetrying] = useState(false);
  async function retry() {
    if (!execution) return;
    setRetrying(true);
    try {
      await post(`/executions/${execution.id}/retry`);
      refresh();
      notify("success", t("已排入重试队列", "Queued for retry"));
    } catch (e) {
      notify("error", t("无法重试", "Retry failed"), (e as Error).message);
    } finally {
      setRetrying(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="AUTOMATION WORKFLOW"
        title={t(
          "自动化有序进行，决策始终可见。",
          "Clear steps. Visible decisions.",
        )}
        description={t(
          "首个完整流程：客户线索理解、CRM 更新与审批后跟进。",
          "One complete workflow: understand leads, update CRM, and follow up after approval.",
        )}
        actions={
          <Button onClick={onTest} loading={testBusy}>
            <Play size={14} />
            {t("运行测试", "Run test")}
          </Button>
        }
      />
      <div className="workflow-summary">
        <div>
          <span className="workflow-summary-icon">
            <Workflow size={23} />
          </span>
          <div>
            <h2>
              {t(
                "客户线索 → CRM → 跟进审批",
                "Customer lead → CRM → Follow-up",
              )}
            </h2>
            <p>
              {t(
                "持久化步骤 · 业务规则校验 · 安全重试",
                "Persistent steps · Business rules · Safe retries",
              )}
            </p>
          </div>
        </div>
        <Badge tone="blue">
          {dashboard?.engine === "n8n"
            ? "n8n"
            : dashboard?.engine === "local"
              ? t("本地引擎 · 未使用 n8n", "Local engine · not n8n")
              : t("读取引擎…", "Loading engine…")}
        </Badge>
      </div>
      <div className="workflow-grid">
        <section className="panel workflow-canvas">
          <div className="panel-header">
            <div className="heading-with-count">
              <h2>{t("执行路径", "Execution path")}</h2>
              <Badge>{t("7 个持久化步骤", "7 persistent steps")}</Badge>
            </div>
            <span className="small-label">
              {execution
                ? `#${shortId(execution.id)}`
                : t("尚无执行", "NO EXECUTION")}
            </span>
          </div>
          {execution ? (
            <div className="selected-execution">
              <span className="mono">
                {t("事件", "Event")} #{shortId(execution.event_id)}
              </span>
              <StatusBadge status={execution.status} />
              <span>
                {execution.n8n_execution_id
                  ? `n8n #${execution.n8n_execution_id}`
                  : t("未收到 n8n 执行 ID", "No n8n execution ID received")}
              </span>
              <NativeStatus execution={execution} />
            </div>
          ) : (
            <div className="workflow-empty-hint">
              {t(
                "下方展示流程定义；选择一条执行后，节点颜色才代表实际状态。",
                "This is the workflow definition. Node colors reflect actual state only after selecting an execution.",
              )}
            </div>
          )}
          <div className="workflow-stage-area">
            <div className="workflow-intake">
              <div>
                <Inbox size={18} />
                <b>{t("事件入口", "Event intake")}</b>
              </div>
              <span>Form / CSV / Webhook</span>
              <small>
                {t(
                  "鉴权 · 格式校验 · 幂等键",
                  "Authentication · Validation · Idempotency",
                )}
              </small>
            </div>
            <div className="workflow-vertical-line" />
            <Pipeline execution={execution} nodes={execution?.nodes || []} />
            <div className="workflow-branch-lines">
              <div>
                <ShieldCheck size={17} />
                <b>{t("信息不足 → 人工确认", "Incomplete → Manual review")}</b>
                <span>
                  {t(
                    "修正字段后，从业务判断继续",
                    "Correct fields and resume classification",
                  )}
                </span>
              </div>
              <div>
                <RefreshCw size={17} />
                <b>
                  {t("执行异常 → 重试或恢复", "Failure → Retry or recover")}
                </b>
                <span>
                  {t(
                    "复用已成功步骤，避免重复副作用",
                    "Reuse completed steps to prevent duplication",
                  )}
                </span>
              </div>
            </div>
          </div>
          {detailQuery.error && (
            <InlineError
              message={detailQuery.error}
              onRetry={() => void detailQuery.refresh()}
            />
          )}
          <div className="workflow-run-footer">
            <span>
              <Radio size={14} />
              {t(
                "节点状态来自服务端执行记录",
                "Node states come from server execution records",
              )}
            </span>
            {execution && (
              <div>
                <RetryButton
                  execution={execution}
                  loading={retrying}
                  onClick={retry}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEvent(execution.event_id)}
                >
                  {t("查看完整事件", "View event")}
                  <ArrowUpRight size={14} />
                </Button>
              </div>
            )}
          </div>
        </section>
        <section className="panel workflow-runs">
          <div className="panel-header">
            <h2>{t("最近执行", "Recent executions")}</h2>
            <Badge>{executions.length}</Badge>
          </div>
          {executionsQuery.loading ? (
            <Spinner />
          ) : executions.length ? (
            <div className="workflow-run-list">
              {executions.slice(0, 14).map((run) => (
                <button
                  key={run.id}
                  className={cn(
                    "workflow-run",
                    run.id === selected && "workflow-run-selected",
                  )}
                  onClick={() => setSelectedId(run.id)}
                >
                  <div>
                    <b className="mono">#{shortId(run.id)}</b>
                    <StatusBadge status={run.status} />
                  </div>
                  <span>
                    {dateTime(run.created_at, lang, true)}
                    <small>
                      {t("第", "Attempt")} {run.attempt || 1} {t("次", "")}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              icon={Workflow}
              title={t("等待第一条执行", "Waiting for the first run")}
              description={t(
                "提交线索后，在这里查看每一步。",
                "Submit a lead to inspect every step here.",
              )}
            />
          )}
        </section>
      </div>
      <div className="workflow-rules">
        {[
          {
            icon: ShieldCheck,
            title: t("规则拥有最终决定权", "Business rules decide"),
            text: t(
              "模型提取事实，业务规则决定优先级、分类和人工审核。",
              "Models extract facts; rules decide priority, classification, and review.",
            ),
          },
          {
            icon: Clock3,
            title: t("审批等待会持久化", "Approvals persist"),
            text: t(
              "关闭浏览器或重启服务，不会替你批准或丢失审批。",
              "Closing the browser or restarting a service never approves a draft.",
            ),
          },
          {
            icon: CheckCheck,
            title: t("副作用有幂等保护", "Effects are idempotent"),
            text: t(
              "重复事件、CRM 更新和测试发件箱写入各自具有保护。",
              "Events, CRM changes, and test outbox writes have separate guards.",
            ),
          },
        ].map((item) => (
          <div key={item.title}>
            <item.icon size={20} />
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </div>
        ))}
      </div>
    </>
  );
}
