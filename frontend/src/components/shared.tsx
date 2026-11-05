import type { ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Check,
  Circle,
  Clock3,
  Inbox,
  LoaderCircle,
  MailCheck,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Workflow,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge, Button } from "./ui";
import { useConsole } from "../lib/context";
import { cn, dateTime, display, shortId } from "../lib/utils";
import type { EventRecord, Execution, NodeRun } from "../lib/types";

const statusNames: Record<string, [string, string, string]> = {
  unknown: ["结果待确认", "Outcome unknown", "amber"],
  queued: ["等待执行", "Queued", "neutral"],
  running: ["执行中", "Running", "blue"],
  retrying: ["自动重试", "Retrying", "amber"],
  needs_review: ["待人工确认", "Needs review", "amber"],
  waiting_approval: ["等待审批", "Awaiting approval", "purple"],
  succeeded: ["已完成", "Completed", "green"],
  rejected: ["已拒绝", "Rejected", "neutral"],
  failed: ["执行异常", "Failed", "red"],
  pending: ["待审批", "Pending", "purple"],
  approved: ["已批准", "Approved", "green"],
  saved: ["已保存草稿", "Draft saved", "blue"],
  invalidated: ["已失效", "Superseded", "neutral"],
  sent: ["已发送", "Sent", "green"],
  stored: ["已存入发件箱", "Stored in outbox", "green"],
  captured: ["已存入发件箱", "Stored in outbox", "green"],
  sending: ["发送中", "Sending", "blue"],
  uncertain: ["发送结果待确认", "Delivery uncertain", "amber"],
  new: ["新线索", "New", "blue"],
  qualified: ["已确认需求", "Qualified", "purple"],
  contacted: ["已跟进", "Contacted", "amber"],
  won: ["已成交", "Won", "green"],
  lost: ["已流失", "Lost", "neutral"],
  disqualified: ["无关线索", "Disqualified", "neutral"],
  open: ["待跟进", "Open", "amber"],
  done: ["已完成", "Done", "green"],
  skipped: ["已跳过", "Skipped", "neutral"],
  rejected_input: ["校验未通过", "Invalid input", "red"],
  review: ["待人工确认", "Needs review", "amber"],
  completed: ["已完成", "Completed", "green"],
  test: ["测试发件箱", "Test outbox", "blue"],
  test_saved: ["已存入测试发件箱", "Stored in test outbox", "green"],
  smtp: ["SMTP 外部发送", "External SMTP", "amber"],
  cancelled: ["已取消", "Cancelled", "neutral"],
  ambiguous: ["结果待确认", "Result uncertain", "amber"],
  delivered: ["已投递", "Delivered", "green"],
  received: ["已接收", "Received", "blue"],
  accepted: ["已接收", "Accepted", "green"],
  duplicate: ["重复提交", "Duplicate", "neutral"],
  error: ["失败", "Error", "red"],
  quarantined: ["人工确认", "Review", "amber"],
  blocked: ["已阻止", "Blocked", "red"],
  scheduled: ["已排队", "Scheduled", "blue"],
  processed: ["已处理", "Processed", "green"],
  refused: ["拒绝发送", "Refused", "red"],
  saved_draft: ["已保存草稿", "Draft saved", "blue"],
  test_sent: ["已存入发件箱", "Stored in outbox", "green"],
  test_delivered: ["已存入发件箱", "Stored in outbox", "green"],
  stale: ["执行已中断", "Interrupted", "amber"],
  superseded: ["已替换", "Superseded", "neutral"],
  rejected_by_user: ["审批已拒绝", "Approval rejected", "neutral"],
  pending_send: ["等待发送", "Awaiting delivery", "blue"],
  processed_duplicate: ["重复联系人", "Existing contact", "neutral"],
  delivery_unknown: ["投递待确认", "Delivery uncertain", "amber"],
  draft: ["草稿", "Draft", "blue"],
  awaiting_approval: ["等待审批", "Awaiting approval", "purple"],
  delivered_test: ["已存入发件箱", "Stored in outbox", "green"],
  intake: ["已接收", "Received", "blue"],
  reviewing: ["复核中", "In review", "amber"],
  waiting: ["等待", "Waiting", "neutral"],
  error_review: ["异常待确认", "Error review", "red"],
  authorized: ["已授权", "Authorized", "green"],
  rejected_duplicate: ["已去重", "Deduplicated", "neutral"],
  not_started: ["未开始", "Not started", "neutral"],
  ready: ["就绪", "Ready", "green"],
  inactive: ["未启用", "Inactive", "neutral"],
};
export function StatusBadge({ status }: { status?: string | null }) {
  const { t } = useConsole();
  const value = statusNames[status || ""] || [
    status || "—",
    status || "—",
    "neutral",
  ];
  return (
    <Badge tone={value[2]}>
      <span
        className={cn(
          "status-dot",
          ["running", "retrying", "sending"].includes(status || "") &&
            "status-active",
        )}
      />
      {t(value[0], value[1])}
    </Badge>
  );
}
export function NativeStatus({
  execution,
  history = false,
}: {
  execution: Execution;
  history?: boolean;
}) {
  const { t, lang } = useConsole();
  if (execution.engine !== "n8n")
    return (
      <span className="native-not-applicable">
        {t("本地引擎 · 不适用 n8n", "Local engine · n8n not applicable")}
      </span>
    );
  const labels: Record<string, [string, string, string]> = {
    unknown: ["未知", "Unknown", "neutral"],
    running: ["执行中", "Running", "blue"],
    success: ["成功", "Success", "green"],
    error: ["失败", "Error", "red"],
    error_reported: ["已回报错误", "Error reported", "red"],
    new: ["等待执行", "New", "neutral"],
    waiting: ["等待", "Waiting", "amber"],
    canceled: ["已取消", "Canceled", "neutral"],
    crashed: ["中断", "Crashed", "red"],
  };
  const status = labels[execution.n8n_status || "unknown"] || labels.unknown;
  return (
    <div className="native-status">
      <span className="native-status-label">n8n</span>
      <Badge tone={status[2]}>{t(status[0], status[1])}</Badge>
      {!execution.n8n_execution_id && (
        <small>{t("未收到执行编号", "No execution ID received")}</small>
      )}
      {history && (
        <div className="native-history">
          <p>
            {t(
              "编排状态与业务状态分开记录；等待审批时，前一段 n8n 执行可能已经成功结束。未配置状态同步密钥或未收到查询结果时，不推定原生执行已成功。",
              "Orchestration state is separate from business state. A pipeline run can finish while business approval is still pending. Native success is not inferred without a status response.",
            )}
          </p>
          {(execution.n8n_runs || []).map((run) => {
            const value =
              labels[run.observed_status || "unknown"] || labels.unknown;
            return (
              <div key={run.id}>
                <code>n8n #{run.id}</code>
                <span>
                  {run.phase === "delivery"
                    ? t("交付阶段", "Delivery")
                    : t("处理阶段", "Pipeline")}
                </span>
                <Badge tone={value[2]}>{t(value[0], value[1])}</Badge>
                <span>
                  {dateTime(run.checked_at || run.started_at, lang, true)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
export function PriorityBadge({ priority }: { priority?: string | null }) {
  const { t } = useConsole();
  const key = String(priority || "normal").toLowerCase();
  const priorityValues: Record<string, [string, string, string]> = {
    high: ["高优先级", "High priority", "red"],
    urgent: ["紧急", "Urgent", "red"],
    medium: ["中优先级", "Medium", "amber"],
    normal: ["标准", "Standard", "neutral"],
    low: ["低优先级", "Low", "neutral"],
    p0: ["紧急", "Urgent", "red"],
    p1: ["高优先级", "High priority", "red"],
    p2: ["标准", "Standard", "neutral"],
    p3: ["低优先级", "Low", "neutral"],
  };
  const value = priorityValues[key] || [
    display(priority),
    display(priority),
    "neutral",
  ];
  return (
    <Badge tone={value[2]}>
      {["high", "urgent", "p0", "p1"].includes(key) && (
        <span className="priority-bars">
          <i />
          <i />
          <i />
        </span>
      )}
      {t(value[0], value[1])}
    </Badge>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
export function Empty({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={25} strokeWidth={1.5} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function InlineError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const { t } = useConsole();
  return (
    <div className="inline-error" role="alert">
      <AlertCircle size={17} />
      <span>{message}</span>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          {t("重试", "Retry")}
        </Button>
      )}
    </div>
  );
}
export function TestBadge({ fixture = false }: { fixture?: boolean }) {
  const { t } = useConsole();
  return (
    <Badge tone={fixture ? "amber" : "neutral"}>
      {fixture
        ? t("测试替身 · 非真实模型", "Fixture · not a live model")
        : t("测试数据", "Test data")}
    </Badge>
  );
}
export function Avatar({
  name = "?",
  small = false,
}: {
  name?: string;
  small?: boolean;
}) {
  let hash = 0;
  for (const c of name) hash = (hash << 5) - hash + c.charCodeAt(0);
  const colors = ["sage", "lavender", "sand", "rose", "sky"];
  return (
    <span
      className={cn(
        "avatar",
        `avatar-${colors[Math.abs(hash) % colors.length]}`,
        small && "avatar-small",
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
export const pipelineSteps: {
  key: string;
  zh: string;
  en: string;
  icon: LucideIcon;
}[] = [
  { key: "extract", zh: "AI 理解", en: "Understand", icon: Sparkles },
  { key: "classify", zh: "业务判断", en: "Qualify", icon: Workflow },
  { key: "crm", zh: "更新 CRM", en: "Update CRM", icon: UserRound },
  { key: "draft", zh: "起草跟进", en: "Draft email", icon: MailCheck },
  { key: "await_approval", zh: "人工审批", en: "Approval", icon: ShieldCheck },
  { key: "deliver", zh: "确认交付", en: "Delivery", icon: Check },
];
export function stepLabel(step: string, t: (zh: string, en: string) => string) {
  const found = pipelineSteps.find((x) => x.key === step);
  return found
    ? t(found.zh, found.en)
    : step === "finish"
      ? t("记录结果", "Record result")
      : step;
}
export function Pipeline({
  execution,
  nodes = [],
  compact = false,
}: {
  execution?: Execution | null;
  nodes?: NodeRun[];
  compact?: boolean;
}) {
  const { t } = useConsole();
  return (
    <div className={cn("pipeline", compact && "pipeline-compact")}>
      {pipelineSteps.map((step, index) => {
        const node = [...nodes].reverse().find((n) => n.step === step.key);
        const status =
          node?.status ||
          (step.key === "await_approval" &&
          execution?.status === "waiting_approval"
            ? "waiting"
            : "idle");
        const Icon =
          status === "succeeded"
            ? Check
            : status === "failed"
              ? XCircle
              : status === "running"
                ? LoaderCircle
                : status === "waiting"
                  ? Clock3
                  : step.icon;
        return (
          <div
            className={cn("pipeline-node", `pipeline-${status}`)}
            key={step.key}
          >
            <div className="pipeline-icon">
              <Icon
                size={compact ? 17 : 19}
                className={status === "running" ? "spin" : ""}
              />
            </div>
            <div className="pipeline-label">
              <b>{t(step.zh, step.en)}</b>
              {!compact && (
                <span>
                  {node?.duration_ms !== undefined
                    ? `${(node.duration_ms / 1000).toFixed(1)}s`
                    : status === "waiting"
                      ? t("需要你的决定", "Your decision needed")
                      : status === "idle"
                        ? t("等待上一步", "Awaiting previous step")
                        : status === "running"
                          ? t("服务端执行中", "Running on server")
                          : status === "succeeded"
                            ? t("已执行", "Executed")
                            : t("查看错误", "View error")}
                </span>
              )}
            </div>
            {index < pipelineSteps.length - 1 && (
              <div className="pipeline-connector" />
            )}
          </div>
        );
      })}
    </div>
  );
}
export function EventsTable({
  events,
  loading = false,
  compact = false,
}: {
  events: EventRecord[];
  loading?: boolean;
  compact?: boolean;
}) {
  const { t, lang, openEvent } = useConsole();
  if (!events.length && !loading)
    return (
      <Empty
        title={t("还没有客户线索", "No leads yet")}
        description={t(
          "提交一条表单，或运行测试，服务端会开始处理。",
          "Submit a form or run the sample batch to start real server execution.",
        )}
      />
    );
  return (
    <div className="table-scroll">
      <table className={cn("data-table", compact && "table-compact")}>
        <thead>
          <tr>
            <th>{t("客户 / 公司", "Customer / company")}</th>
            {!compact && <th>{t("来源", "Source")}</th>}
            <th>{t("优先级", "Priority")}</th>
            <th>{t("处理状态", "Status")}</th>
            <th>{t("接收时间", "Received")}</th>
            <th aria-label={t("查看详情", "View details")} />
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr
              key={event.id}
              onClick={() => openEvent(event.id)}
              className="clickable-row"
            >
              <td>
                <div className="person-cell">
                  <Avatar name={event.name || event.company || "?"} />
                  <div>
                    <button
                      className="cell-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEvent(event.id);
                      }}
                    >
                      {event.name ||
                        event.company ||
                        t("未提供姓名", "Name unavailable")}
                    </button>
                    <div className="cell-subline">
                      {event.company || event.email || shortId(event.id)}
                      {event.is_test && (
                        <span className="mini-tag">{t("测试", "TEST")}</span>
                      )}
                    </div>
                  </div>
                </div>
              </td>
              {!compact && (
                <td>
                  <span className="source-name">
                    <Circle size={7} fill="currentColor" />
                    {(
                      {
                        form: t("网页表单", "Web form"),
                        api: "API",
                        webhook: "Webhook",
                        csv: "CSV",
                        demo: t("示例线索", "Sample batch"),
                      } as Record<string, string>
                    )[event.source] || event.source}
                  </span>
                </td>
              )}
              <td>
                {event.priority ? (
                  <PriorityBadge priority={event.priority} />
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                <StatusBadge status={event.status} />
              </td>
              <td className="date-cell">
                {dateTime(event.created_at, lang, true)}
              </td>
              <td>
                <ArrowRight size={16} className="row-arrow" />
              </td>
            </tr>
          ))}
          {loading && !events.length && (
            <tr>
              <td colSpan={6}>
                <div className="table-loading">
                  <LoaderCircle className="spin" size={20} />
                  {t("正在读取线索…", "Loading leads…")}
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
export function RetryButton({
  execution,
  onClick,
  loading = false,
}: {
  execution: Execution;
  onClick: () => void;
  loading?: boolean;
}) {
  const { t } = useConsole();
  return ["failed", "stale"].includes(execution.status) ? (
    <Button variant="outline" size="sm" loading={loading} onClick={onClick}>
      <RotateCcw size={14} />
      {t("重新执行", "Retry execution")}
    </Button>
  ) : null;
}
export function Metric({
  label,
  value,
  icon: Icon = Activity,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  detail: string;
  tone?: string;
}) {
  return (
    <div className={cn("metric-card", `metric-${tone}`)}>
      <div className="metric-top">
        <span>{label}</span>
        <Icon size={18} strokeWidth={1.6} />
      </div>
      <strong>
        {typeof value === "number" ? value.toLocaleString() : value}
      </strong>
      <span className="metric-detail">
        <i />
        {detail}
      </span>
    </div>
  );
}
