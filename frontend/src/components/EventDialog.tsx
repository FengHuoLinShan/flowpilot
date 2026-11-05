import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  ChevronDown,
  Clock3,
  Database,
  FileText,
  History,
  Mail,
  Pencil,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRound,
  XCircle,
} from "lucide-react";
import { useConsole } from "../lib/context";
import { post } from "../lib/api";
import { useApiData } from "../lib/useApiData";
import { cn, dateTime, display, shortId } from "../lib/utils";
import type { Audit, EventDetail, Execution, Settings } from "../lib/types";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
} from "./ui";
import {
  Avatar,
  Empty,
  InlineError,
  NativeStatus,
  Pipeline,
  PriorityBadge,
  RetryButton,
  StatusBadge,
  TestBadge,
} from "./shared";
import { ApprovalEditor } from "../pages/Approvals";
import { NodeTimeline } from "../pages/Executions";

type DetailTab = "overview" | "understanding" | "crm" | "email" | "logs";
export function EventDialog({
  eventId,
  onClose,
}: {
  eventId: string | null;
  onClose: () => void;
}) {
  const { t, lang, nonce, refresh, notify, navigate } = useConsole();
  const query = useApiData<EventDetail>(
    eventId ? `/events/${eventId}` : null,
    nonce,
  );
  const event = query.data;
  const executionId =
    event?.current_execution?.id || event?.current_execution_id;
  const executionQuery = useApiData<Execution>(
    executionId ? `/executions/${executionId}` : null,
    nonce,
  );
  const execution = executionQuery.data || event?.current_execution;
  const [tab, setTab] = useState<DetailTab>("overview");
  const [correctOpen, setCorrectOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const settingsQuery = useApiData<Settings>(
    eventId && tab === "email" ? "/settings" : null,
    nonce,
    false,
  );
  useEffect(() => {
    setTab("overview");
    setCorrectOpen(false);
  }, [eventId]);
  async function retry() {
    if (!execution) return;
    setBusy(true);
    try {
      await post(`/executions/${execution.id}/retry`);
      refresh();
      notify("success", t("已排入重试队列", "Queued for retry"));
    } catch (e) {
      notify("error", t("无法重试", "Retry failed"), (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const canCorrect =
    !!event &&
    ["needs_review", "waiting_approval", "failed"].includes(event.status) &&
    !event.approvals?.some((approval) => approval.status === "approved");
  const tabs: {
    id: DetailTab;
    zh: string;
    en: string;
    icon: typeof FileText;
  }[] = [
    { id: "overview", zh: "线索总览", en: "Overview", icon: FileText },
    {
      id: "understanding",
      zh: "AI 与业务判断",
      en: "AI & decisions",
      icon: Sparkles,
    },
    { id: "crm", zh: "CRM 变更", en: "CRM changes", icon: Database },
    { id: "email", zh: "邮件与审批", en: "Email & approval", icon: Mail },
    { id: "logs", zh: "执行与日志", en: "Execution & logs", icon: History },
  ];
  const latestApproval =
    event?.approvals?.find((approval) => approval.status === "pending") ||
    event?.approvals?.[0];
  return (
    <>
      <Modal
        open={!!eventId}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={t("线索详情", "Lead details")}
        description={eventId ? `${t("事件", "Event")} ${eventId}` : ""}
        wide
        className="event-dialog"
      >
        {query.loading ? (
          <Spinner />
        ) : query.error ? (
          <div className="modal-form">
            <InlineError
              message={query.error}
              onRetry={() => void query.refresh()}
            />
          </div>
        ) : (
          event && (
            <>
              <div className="event-summary">
                <div className="event-person">
                  <Avatar
                    name={
                      event.extraction?.name ||
                      event.name ||
                      event.company ||
                      "?"
                    }
                  />
                  <div>
                    <h2>
                      {event.extraction?.name ||
                        event.name ||
                        t("待确认客户", "Customer to confirm")}
                    </h2>
                    <p>
                      {event.extraction?.company ||
                        event.company ||
                        t("公司信息待补充", "Company not provided")}
                    </p>
                  </div>
                </div>
                <div className="event-summary-badges">
                  <StatusBadge status={event.status} />
                  {event.priority && (
                    <PriorityBadge priority={event.priority} />
                  )}
                  {event.is_test && <TestBadge />}
                  {event.model_provider === "fixture" && <TestBadge fixture />}
                </div>
              </div>
              <div className="event-detail-tabs">
                {tabs.map((item) => (
                  <button
                    key={item.id}
                    className={tab === item.id ? "active" : ""}
                    onClick={() => setTab(item.id)}
                  >
                    <item.icon size={15} />
                    {t(item.zh, item.en)}
                    {item.id === "email" &&
                      latestApproval?.status === "pending" && <i />}
                  </button>
                ))}
              </div>
              <div className="event-detail-body">
                {(event.status === "failed" ||
                  event.status === "needs_review") && (
                  <div
                    className={cn(
                      "event-alert",
                      event.status === "failed"
                        ? "event-alert-error"
                        : "event-alert-review",
                    )}
                  >
                    <TriangleAlert size={20} />
                    <div>
                      <b>
                        {event.status === "failed"
                          ? t(
                              "这条线索需要恢复执行",
                              "This lead needs recovery",
                            )
                          : t(
                              "继续处理前，需要核实信息",
                              "Verify information before continuing",
                            )}
                      </b>
                      <p>
                        {execution?.error_message ||
                          (event.classification?.missing_fields?.length
                            ? `${t("缺失字段：", "Missing fields: ")}${event.classification.missing_fields.join(", ")}`
                            : t(
                                "查看业务判断依据，修正字段后重新执行后续步骤。",
                                "Review the decision reasons, correct the fields, and resume subsequent steps.",
                              ))}
                      </p>
                    </div>
                    {canCorrect && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCorrectOpen(true)}
                      >
                        <Pencil size={13} />
                        {t("核实并修正", "Review & correct")}
                      </Button>
                    )}
                  </div>
                )}
                {tab === "overview" && (
                  <>
                    <div className="event-progress">
                      <div className="detail-section-heading">
                        <h3>
                          {t("当前执行进度", "Current execution progress")}
                        </h3>
                        <span>
                          {execution?.engine === "n8n"
                            ? "n8n"
                            : execution?.engine
                              ? t("本地引擎", "Local engine")
                              : "—"}
                          {execution?.n8n_execution_id &&
                            ` #${execution.n8n_execution_id}`}
                        </span>
                      </div>
                      <Pipeline
                        execution={execution}
                        nodes={execution?.nodes || []}
                        compact
                      />
                    </div>
                    <div className="event-overview-grid">
                      <section className="detail-card">
                        <div className="detail-card-heading">
                          <FileText size={17} />
                          <h3>
                            {t("客户原始信息", "Original customer information")}
                          </h3>
                          <Badge>{event.source}</Badge>
                        </div>
                        <pre className="original-message">
                          {display(
                            event.payload.message || event.payload.requirement,
                          )}
                        </pre>
                        <div className="original-fields">
                          <div>
                            <UserRound size={14} />
                            <span>{t("姓名", "Name")}</span>
                            <b>{display(event.payload.name)}</b>
                          </div>
                          <div>
                            <Building2 size={14} />
                            <span>{t("公司", "Company")}</span>
                            <b>{display(event.payload.company)}</b>
                          </div>
                          <div>
                            <Mail size={14} />
                            <span>{t("邮箱", "Email")}</span>
                            <b>{display(event.payload.email)}</b>
                          </div>
                          <div>
                            <Phone size={14} />
                            <span>{t("电话", "Phone")}</span>
                            <b>{display(event.payload.phone)}</b>
                          </div>
                        </div>
                        <div className="detail-card-footer">
                          <Clock3 size={13} />
                          {dateTime(event.created_at, lang)}
                        </div>
                      </section>
                      <section className="detail-card decision-card">
                        <div className="detail-card-heading">
                          <ShieldCheck size={17} />
                          <h3>{t("业务判断", "Business decision")}</h3>
                        </div>
                        {event.classification ? (
                          <>
                            <div className="classification-head">
                              <PriorityBadge
                                priority={
                                  event.classification.priority ||
                                  event.priority
                                }
                              />
                              <Badge>
                                {display(
                                  event.classification.category ||
                                    event.category,
                                )}
                              </Badge>
                            </div>
                            <ReasonList event={event} />
                            <button
                              className="text-button"
                              onClick={() => setTab("understanding")}
                            >
                              {t(
                                "查看提取字段与规则",
                                "View extraction & rules",
                              )}
                              <ArrowRight size={14} />
                            </button>
                          </>
                        ) : (
                          <div className="detail-awaiting">
                            <Sparkles size={24} />
                            <p>
                              {t(
                                "等待 AI 提取与业务规则判断",
                                "Waiting for extraction and business rules",
                              )}
                            </p>
                            <span>
                              {t(
                                "系统不会预先填充推测结果。",
                                "No inferred results are filled in ahead of execution.",
                              )}
                            </span>
                          </div>
                        )}
                        {latestApproval && (
                          <button
                            className="next-action-card"
                            onClick={() => setTab("email")}
                          >
                            <Mail size={18} />
                            <div>
                              <b>
                                {latestApproval.status === "pending"
                                  ? t(
                                      "跟进邮件等你审批",
                                      "Follow-up awaiting your approval",
                                    )
                                  : t(
                                      "查看邮件与审批记录",
                                      "View email and decision",
                                    )}
                              </b>
                              <span>{latestApproval.subject}</span>
                            </div>
                            <ChevronDown size={15} />
                          </button>
                        )}
                      </section>
                    </div>
                    <div className="event-identifiers">
                      <span className="mono">EVENT #{shortId(event.id)}</span>
                      <span className="mono">
                        RUN #{shortId(execution?.id)}
                      </span>
                      <span>
                        {t(
                          "原始数据保留，修改单独记账",
                          "Original input preserved; corrections recorded separately",
                        )}
                      </span>
                    </div>
                  </>
                )}
                {tab === "understanding" && (
                  <>
                    <div className="detail-section-heading">
                      <div>
                        <h3>
                          {t("结构化理解结果", "Structured understanding")}
                        </h3>
                        <p>
                          {t(
                            "模型负责提取，服务端校验字段与规则。",
                            "The model extracts; the server validates fields and rules.",
                          )}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canCorrect}
                        onClick={() => setCorrectOpen(true)}
                        title={
                          !canCorrect
                            ? t(
                                "仅暂停、待审批或失败时可修正",
                                "Corrections are available while paused, pending approval, or failed",
                              )
                            : undefined
                        }
                      >
                        <Pencil size={14} />
                        {t("人工修正", "Correct fields")}
                      </Button>
                    </div>
                    {event.extraction ? (
                      <>
                        <div className="extraction-grid">
                          {[
                            ["name", "客户姓名", "Customer name"],
                            ["company", "公司", "Company"],
                            ["email", "邮箱", "Email"],
                            ["phone", "联系电话", "Phone"],
                            ["budget", "预算", "Budget"],
                            ["currency", "币种", "Currency"],
                            ["intent", "意图", "Intent"],
                            ["urgency", "紧急程度", "Urgency"],
                            ["timeline", "时间要求", "Timeline"],
                          ].map(([key, zh, en]) => (
                            <div key={key}>
                              <span>{t(zh, en)}</span>
                              <b
                                className={
                                  !event.extraction?.[key] ? "muted" : ""
                                }
                              >
                                {display(
                                  event.extraction?.[key],
                                  t("未提供", "Not provided"),
                                )}
                              </b>
                            </div>
                          ))}
                        </div>
                        <div className="extraction-requirement">
                          <span className="small-label">
                            {t("需求摘要", "REQUIREMENT")}
                          </span>
                          <p>{display(event.extraction.requirement)}</p>
                        </div>
                        <div className="confidence-row">
                          <span>
                            {t("理解结果置信标记", "Extraction confidence marker")}
                          </span>
                          <div className="confidence-track">
                            <i
                              style={{
                                width: `${Math.max(0, Math.min(1, Number(event.extraction.confidence || 0))) * 100}%`,
                              }}
                            />
                          </div>
                          <b>
                            {event.extraction.confidence !== undefined
                              ? `${Math.round(event.extraction.confidence * 100)}%`
                              : "—"}
                          </b>
                          <small>
                            {t("不等同于实测准确率", "Not measured accuracy")}
                          </small>
                        </div>
                        {Array.isArray(event.extraction.ambiguities) &&
                          event.extraction.ambiguities.length > 0 && (
                            <div className="ambiguity-box">
                              <TriangleAlert size={18} />
                              <div>
                                <h4>
                                  {t(
                                    "模型标记的不确定信息",
                                    "Model-reported ambiguities",
                                  )}
                                </h4>
                                <ul>
                                  {event.extraction.ambiguities.map(
                                    (value, i) => (
                                      <li key={i}>{String(value)}</li>
                                    ),
                                  )}
                                </ul>
                              </div>
                            </div>
                          )}
                      </>
                    ) : (
                      <Empty
                        icon={Sparkles}
                        title={t("尚未获得模型结果", "No model result yet")}
                        description={t(
                          "执行完成提取步骤后，这里显示通过结构校验的数据。",
                          "Schema-validated data appears here after extraction.",
                        )}
                      />
                    )}
                    <section className="business-reason-section">
                      <div className="detail-section-heading">
                        <h3>
                          {t("确定性业务规则", "Deterministic business rules")}
                        </h3>
                        <ShieldCheck size={18} />
                      </div>
                      <ReasonList event={event} />
                      {event.classification && (
                        <details className="technical-details">
                          <summary>
                            {t("查看规则输出 JSON", "View rule output JSON")}
                          </summary>
                          <pre className="json-block">
                            {JSON.stringify(event.classification, null, 2)}
                          </pre>
                        </details>
                      )}
                    </section>
                  </>
                )}
                {tab === "crm" && (
                  <>
                    <div className="detail-section-heading">
                      <div>
                        <h3>
                          {t(
                            "本次实际 CRM 变更",
                            "CRM changes from this event",
                          )}
                        </h3>
                        <p>
                          {t(
                            "数据来自服务端操作结果；未执行的动作不会显示为成功。",
                            "Shown from server-side operation results. Unexecuted actions are not marked successful.",
                          )}
                        </p>
                      </div>
                      <Badge tone="green">
                        {t("内置 CRM", "Built-in CRM")}
                      </Badge>
                    </div>
                    {event.crm_changes &&
                    Object.keys(event.crm_changes).length > 0 ? (
                      <>
                        <div className="crm-change-grid">
                          {Object.entries(event.crm_changes).map(
                            ([key, value]) => (
                              <div key={key}>
                                <span className="crm-change-icon">
                                  <Database size={16} />
                                </span>
                                <div>
                                  <span>
                                    {(
                                      {
                                        contact_id: t("联系人", "Contact"),
                                        contact_created: t(
                                          "是否新建联系人",
                                          "Contact created",
                                        ),
                                        company_id: t("公司", "Company"),
                                        company_created: t(
                                          "是否新建公司",
                                          "Company created",
                                        ),
                                        lead_id: t("线索", "Lead"),
                                        task_id: t(
                                          "跟进任务",
                                          "Follow-up task",
                                        ),
                                        adapter: t("执行适配器", "Adapter"),
                                        matched_existing: t(
                                          "匹配已有联系人",
                                          "Matched existing contact",
                                        ),
                                        action: t("执行动作", "Action"),
                                      } as Record<string, string>
                                    )[key] || key}
                                  </span>
                                  <b
                                    className={
                                      typeof value === "string" &&
                                      value.length > 25
                                        ? "mono"
                                        : ""
                                    }
                                  >
                                    {typeof value === "boolean"
                                      ? value
                                        ? t("是", "Yes")
                                        : t("否", "No")
                                      : display(value)}
                                  </b>
                                </div>
                                <Check size={16} />
                              </div>
                            ),
                          )}
                        </div>
                        <div className="info-panel">
                          <ShieldCheck size={18} />
                          <p>
                            {t(
                              "重复事件不会重复创建线索或任务；已有联系人会被匹配复用。",
                              "Repeated events do not create duplicate leads or tasks. Existing contacts are matched and reused.",
                            )}
                          </p>
                        </div>
                        <div className="inline-actions">
                          <Button
                            variant="outline"
                            onClick={() => {
                              onClose();
                              navigate("crm");
                            }}
                          >
                            {t("打开 CRM", "Open CRM")}
                            <ArrowUpRight size={15} />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Empty
                        icon={Database}
                        title={t(
                          "这条线索尚未产生 CRM 变更",
                          "No CRM changes for this event yet",
                        )}
                        description={t(
                          "缺失信息、执行失败或未到达 CRM 步骤时，这里会保持为空。",
                          "This stays empty if information is missing, execution failed, or the CRM step has not been reached.",
                        )}
                      />
                    )}
                  </>
                )}
                {tab === "email" && (
                  <>
                    {latestApproval ? (
                      <>
                        <div className="detail-section-heading">
                          <h3>
                            {t(
                              "跟进草稿与审批",
                              "Follow-up draft and approval",
                            )}
                          </h3>
                          <StatusBadge status={latestApproval.status} />
                        </div>
                        <ApprovalEditor
                          key={latestApproval.id}
                          approval={latestApproval}
                          settings={settingsQuery.data}
                          embedded
                        />
                        {(event.outbox || []).length > 0 && (
                          <div className="event-deliveries">
                            <h3>
                              {t("实际交付记录", "Actual delivery records")}
                            </h3>
                            {event.outbox!.map((message) => (
                              <div key={message.id}>
                                <Mail size={17} />
                                <span>{message.to_email}</span>
                                <Badge
                                  tone={
                                    message.mode === "smtp" ? "amber" : "blue"
                                  }
                                >
                                  {message.mode === "smtp"
                                    ? "SMTP"
                                    : t("测试发件箱", "Test outbox")}
                                </Badge>
                                <StatusBadge status={message.status} />
                              </div>
                            ))}
                          </div>
                        )}
                        {(event.approvals || []).length > 1 && (
                          <details className="technical-details">
                            <summary>
                              {t(
                                `历史审批（${event.approvals!.length - 1}）`,
                                `Previous approvals (${event.approvals!.length - 1})`,
                              )}
                            </summary>
                            {event
                              .approvals!.filter(
                                (item) => item.id !== latestApproval.id,
                              )
                              .map((item) => (
                                <div className="history-approval" key={item.id}>
                                  <span>{item.subject}</span>
                                  <StatusBadge status={item.status} />
                                  <span>
                                    {dateTime(item.updated_at, lang, true)}
                                  </span>
                                </div>
                              ))}
                          </details>
                        )}
                      </>
                    ) : (
                      <Empty
                        icon={Mail}
                        title={t("尚未生成邮件草稿", "No email draft yet")}
                        description={t(
                          "在信息完整、业务判断与 CRM 更新完成后，AI 会起草邮件并等待审批。",
                          "Once information is complete and the CRM update succeeds, AI drafts an email and waits for approval.",
                        )}
                      />
                    )}
                  </>
                )}
                {tab === "logs" && (
                  <>
                    <div className="detail-section-heading">
                      <div>
                        <h3>{t("节点执行记录", "Node execution records")}</h3>
                        <p>
                          {execution?.id
                            ? `${t("当前执行", "Current run")}: ${execution.id}`
                            : t("执行尚未分配", "Execution not assigned")}
                        </p>
                      </div>
                      {execution && (
                        <RetryButton
                          execution={execution}
                          loading={busy}
                          onClick={() => void retry()}
                        />
                      )}
                    </div>
                    {executionQuery.error && (
                      <InlineError message={executionQuery.error} />
                    )}
                    {execution && (
                      <NativeStatus execution={execution} history />
                    )}
                    <NodeTimeline nodes={execution?.nodes || []} />
                    {(event.executions || []).length > 1 && (
                      <div className="run-history">
                        <h3>{t("全部执行尝试", "All execution attempts")}</h3>
                        {event.executions!.map((run) => (
                          <div key={run.id}>
                            <code>#{shortId(run.id)}</code>
                            <StatusBadge status={run.status} />
                            <span>
                              {run.phase} · {run.engine}
                            </span>
                            <span>{dateTime(run.created_at, lang, true)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="detail-section-heading audit-heading">
                      <h3>{t("操作与审计记录", "Audit trail")}</h3>
                      <Badge>{event.logs?.length || 0}</Badge>
                    </div>
                    <AuditTrail logs={event.logs || []} />
                    <details className="technical-details">
                      <summary>
                        {t("查看原始事件 JSON", "View original event JSON")}
                      </summary>
                      <pre className="json-block">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    </details>
                  </>
                )}
              </div>
              <div className="event-footer">
                <span>
                  <ShieldCheck size={14} />
                  {t(
                    "所有操作均由服务端持久化记录",
                    "All actions are persisted on the server",
                  )}
                </span>
                <div>
                  {execution && (
                    <RetryButton
                      execution={execution}
                      loading={busy}
                      onClick={() => void retry()}
                    />
                  )}
                  <Button variant="outline" size="sm" onClick={onClose}>
                    {t("关闭", "Close")}
                  </Button>
                </div>
              </div>
            </>
          )
        )}
      </Modal>
      {event && (
        <CorrectionDialog
          event={event}
          open={correctOpen}
          onOpenChange={setCorrectOpen}
        />
      )}
    </>
  );
}

function ReasonList({ event }: { event: EventDetail }) {
  const { t } = useConsole();
  const reasons = event.classification?.reasons;
  return reasons && reasons.length > 0 ? (
    <ul className="reason-list">
      {reasons.map((reason, i) => (
        <li key={i}>
          <span>{String(i + 1).padStart(2, "0")}</span>
          <p>{typeof reason === "string" ? reason : JSON.stringify(reason)}</p>
        </li>
      ))}
    </ul>
  ) : (
    <p className="muted reason-placeholder">
      {t(
        "业务规则尚未输出判断依据。",
        "No business-rule decision has been recorded yet.",
      )}
    </p>
  );
}

function AuditTrail({ logs }: { logs: Audit[] }) {
  const { t, lang } = useConsole();
  return logs.length ? (
    <div className="audit-list">
      {logs.map((log, i) => (
        <div key={log.id || i}>
          <span className="audit-dot" />
          <div>
            <b>
              {display(
                log.action || log.message || log.step,
                t("操作记录", "Audit event"),
              )}
            </b>
            <p>{display(log.message || "", "")}</p>
            {Boolean(log.details || log.data) && (
              <details>
                <summary>{t("详情", "Details")}</summary>
                <pre className="json-block">
                  {JSON.stringify(log.details || log.data, null, 2)}
                </pre>
              </details>
            )}
          </div>
          <span className="audit-time">
            {dateTime(log.created_at, lang, true)}
            {log.actor && <small>{log.actor}</small>}
          </span>
        </div>
      ))}
    </div>
  ) : (
    <div className="no-nodes">
      <History size={17} />
      {t("尚无审计记录", "No audit records yet")}
    </div>
  );
}

function CorrectionDialog({
  event,
  open,
  onOpenChange,
}: {
  event: EventDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, refresh, notify } = useConsole();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    if (open) {
      setVerified(false);
      setError("");
    }
  }, [open]);
  const extraction = event.extraction || {};
  const value = (key: string) =>
    display(extraction[key] ?? event.payload[key], "");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!verified) return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const fields: Record<string, unknown> = { confidence: 1, ambiguities: [] };
    for (const key of [
      "name",
      "company",
      "email",
      "phone",
      "requirement",
      "currency",
      "intent",
      "urgency",
      "timeline",
    ]) {
      const raw = String(data.get(key) || "").trim();
      fields[key] = raw || null;
    }
    fields.budget = data.get("budget") ? Number(data.get("budget")) : null;
    try {
      await post(`/events/${event.id}/correct`, {
        fields,
        reason: String(data.get("reason") || "").trim(),
      });
      refresh();
      notify(
        "success",
        t(
          "修正已保存，继续执行后续步骤",
          "Corrections saved; subsequent steps queued",
        ),
      );
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("核实并修正 AI 理解", "Review and correct AI understanding")}
      description={t(
        "原始客户信息会保留。待审批草稿会失效，修正后的字段将重新执行业务规则与后续流程。",
        "Original input is preserved. Pending drafts are invalidated and corrected fields go through business rules and subsequent steps again.",
      )}
      wide
    >
      <form onSubmit={submit} className="modal-form">
        <div className="form-grid">
          {[
            ["name", "姓名", "Name"],
            ["company", "公司", "Company"],
            ["email", "邮箱", "Email"],
            ["phone", "电话", "Phone"],
          ].map(([key, zh, en]) => (
            <Field key={key} label={t(zh, en)} id={`correction-${key}`}>
              <Input
                id={`correction-${key}`}
                type={key === "email" ? "email" : "text"}
                name={key}
                defaultValue={value(key)}
                maxLength={
                  key === "name" || key === "company"
                    ? 200
                    : key === "phone"
                      ? 50
                      : 254
                }
              />
            </Field>
          ))}
          <Field label={t("预算", "Budget")} id="correction-budget">
            <Input
              id="correction-budget"
              name="budget"
              type="number"
              min={0}
              max={1000000000}
              step="0.01"
              defaultValue={value("budget")}
            />
          </Field>
          <Field label={t("币种", "Currency")} id="correction-currency">
            <Select
              id="correction-currency"
              name="currency"
              defaultValue={value("currency") || "CNY"}
            >
              {["CNY", "USD", "EUR", "AUD", "GBP"].map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("咨询意图", "Intent")} id="correction-intent">
            <Select
              id="correction-intent"
              name="intent"
              defaultValue={value("intent") || "unknown"}
            >
              {[
                ["inquiry", "产品 / 服务询价", "Product / service inquiry"],
                ["support", "售后支持", "Support"],
                ["partnership", "合作意向", "Partnership"],
                ["unrelated", "无关咨询", "Unrelated"],
                ["unknown", "待确认", "Unknown"],
              ].map(([key, zh, en]) => (
                <option key={key} value={key}>
                  {t(zh, en)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("紧急程度", "Urgency")} id="correction-urgency">
            <Select
              id="correction-urgency"
              name="urgency"
              defaultValue={value("urgency") || "unknown"}
            >
              {[
                ["urgent", "紧急", "Urgent"],
                ["normal", "普通", "Normal"],
                ["unknown", "未说明", "Unknown"],
              ].map(([key, zh, en]) => (
                <option key={key} value={key}>
                  {t(zh, en)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t("时间要求", "Timeline")} id="correction-timeline">
          <Input
            id="correction-timeline"
            name="timeline"
            maxLength={500}
            defaultValue={value("timeline")}
            placeholder={t(
              "仅填写客户明确提供的信息",
              "Only information explicitly provided by the customer",
            )}
          />
        </Field>
        <Field label={t("需求摘要", "Requirement")} id="correction-requirement">
          <Textarea
            id="correction-requirement"
            name="requirement"
            required
            minLength={1}
            maxLength={8000}
            defaultValue={
              value("requirement") || display(event.payload.message, "")
            }
            rows={4}
          />
        </Field>
        <Field
          label={t("修正原因 *", "Reason for correction *")}
          id="correction-reason"
        >
          <Textarea
            id="correction-reason"
            name="reason"
            required
            minLength={3}
            maxLength={1000}
            rows={2}
            placeholder={t(
              "说明修正的字段及依据，供后续审计…",
              "Explain what changed and why, for the audit trail…",
            )}
          />
        </Field>
        <label className="check-row">
          <input
            type="checkbox"
            required
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
          />
          <span>
            <b>{t("我已核实以上字段", "I have verified these fields")}</b>
            <small>
              {t(
                "清除模型的不确定标记；服务端仍会检查必填信息与业务规则。",
                "Clears model uncertainty markers. Required fields and business rules are still checked by the server.",
              )}
            </small>
          </span>
        </label>
        {error && (
          <div className="inline-error">
            <XCircle size={17} />
            <span>{error}</span>
          </div>
        )}
        <div className="dialog-actions">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {t("取消", "Cancel")}
          </Button>
          <Button type="submit" loading={busy} disabled={!verified}>
            <RefreshCw size={15} />
            {t("保存并重新执行后续步骤", "Save & resume subsequent steps")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
