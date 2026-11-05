import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  FileCheck2,
  FileText,
  Inbox,
  Mail,
  MailCheck,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react";
import { useConsole } from "../lib/context";
import { patch, post } from "../lib/api";
import { useApiData } from "../lib/useApiData";
import { asList, cn, dateTime, shortId } from "../lib/utils";
import type { Approval, Outbox, Settings } from "../lib/types";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
} from "../components/ui";
import {
  Avatar,
  Empty,
  InlineError,
  PageHeader,
  PriorityBadge,
  StatusBadge,
} from "../components/shared";

export function ApprovalsPage() {
  const { t, lang, nonce, openEvent } = useConsole();
  const [status, setStatus] = useState("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useApiData<{ items: Approval[]; total: number }>(
    `/approvals${status ? `?status=${status}` : ""}`,
    nonce,
  );
  const approvals = asList<Approval>(query.data);
  const selected = approvals.find((a) => a.id === selectedId) || approvals[0];
  const settings = useApiData<Settings>("/settings", nonce, false);
  return (
    <>
      <PageHeader
        eyebrow="HUMAN IN THE LOOP"
        title={t(
          "AI 已准备好，下一步由你决定。",
          "AI has prepared it. You decide what’s next.",
        )}
        description={t(
          "阅读原始需求、编辑跟进邮件，再批准、拒绝或仅保存草稿。",
          "Review the inquiry, edit the follow-up, then approve, reject, or simply save the draft.",
        )}
        actions={
          <Badge tone="purple">
            <ShieldCheck size={13} />
            {t("所有外发必须审批", "Approval required for every delivery")}
          </Badge>
        }
      />
      <div className="section-tabs">
        {[
          ["pending", "待审批", "Pending"],
          ["approved", "已批准待交付", "Approved, awaiting delivery"],
          ["test_saved", "已存测试箱", "Test outbox"],
          ["sent", "已外部发送", "Externally sent"],
          ["rejected", "已拒绝", "Rejected"],
          ["saved", "已保存", "Saved"],
          ["", "全部记录", "All records"],
        ].map(([value, zh, en]) => (
          <button
            key={value}
            className={status === value ? "active" : ""}
            onClick={() => {
              setStatus(value);
              setSelectedId(null);
            }}
          >
            {t(zh, en)}
          </button>
        ))}
      </div>
      {query.error && (
        <InlineError
          message={query.error}
          onRetry={() => void query.refresh()}
        />
      )}
      {query.loading ? (
        <section className="panel">
          <Spinner />
        </section>
      ) : !approvals.length ? (
        <section className="panel">
          <Empty
            icon={FileCheck2}
            title={
              status === "pending"
                ? t("审批队列已清空", "Your approval queue is clear")
                : t("暂无审批记录", "No approval records")
            }
            description={
              status === "pending"
                ? t(
                    "AI 完成线索理解与邮件起草后，需要你决定的事项会出现在这里。",
                    "When AI finishes understanding a lead and drafting a reply, it will wait for your decision here.",
                  )
                : t(
                    "更改筛选条件，或运行一条客户线索。",
                    "Change the filter or run a customer lead.",
                  )
            }
          />
        </section>
      ) : (
        <div className="approval-layout">
          <section className="panel approval-queue">
            <div className="panel-header">
              <h2>{t("审批事项", "Approval queue")}</h2>
              <Badge>{approvals.length}</Badge>
            </div>
            {approvals.map((approval) => (
              <button
                key={approval.id}
                className={cn(
                  "approval-queue-item",
                  selected?.id === approval.id && "approval-selected",
                )}
                onClick={() => setSelectedId(approval.id)}
              >
                <div className="approval-queue-person">
                  <Avatar
                    small
                    name={
                      approval.customer_name || approval.company_name || "?"
                    }
                  />
                  <div>
                    <b>
                      {approval.customer_name ||
                        approval.to_email ||
                        t("客户", "Customer")}
                    </b>
                    <span>{approval.company_name || approval.to_email}</span>
                  </div>
                  <ChevronRight size={15} />
                </div>
                <p>{approval.subject}</p>
                <div className="approval-queue-meta">
                  <PriorityBadge priority={approval.priority} />
                  <span>{dateTime(approval.created_at, lang, true)}</span>
                </div>
                {approval.is_test && (
                  <span className="queue-test-label">
                    {t(
                      "测试线索 · 仅测试发件箱",
                      "TEST LEAD · TEST OUTBOX ONLY",
                    )}
                  </span>
                )}
              </button>
            ))}
          </section>
          <section className="panel approval-editor-panel">
            {selected && (
              <>
                <div className="panel-header">
                  <div className="heading-with-count">
                    <h2>{t("跟进邮件", "Follow-up email")}</h2>
                    <StatusBadge status={selected.status} />
                  </div>
                  <button
                    className="text-button"
                    onClick={() => openEvent(selected.event_id)}
                  >
                    {t("查看原始线索", "View original lead")}
                    <ArrowUpRight size={15} />
                  </button>
                </div>
                <ApprovalEditor
                  key={selected.id}
                  approval={selected}
                  settings={settings.data}
                />
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export function ApprovalEditor({
  approval,
  settings,
  embedded = false,
}: {
  approval: Approval;
  settings?: Settings;
  embedded?: boolean;
}) {
  const { t, lang, notify, refresh } = useConsole();
  const [snapshot, setSnapshot] = useState(approval);
  const [to, setTo] = useState(approval.to_email || "");
  const [subject, setSubject] = useState(approval.subject);
  const [body, setBody] = useState(approval.body);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [externalOpen, setExternalOpen] = useState(false);
  const [authorize, setAuthorize] = useState(false);
  const [mode, setMode] = useState<"test" | "smtp">("test");
  const dirty =
    to !== snapshot.to_email ||
    subject !== snapshot.subject ||
    body !== snapshot.body;
  const pending = approval.status === "pending";
  const canExternal = settings?.smtp_enabled && !approval.is_test;
  useEffect(() => {
    if (approval.version !== snapshot.version) {
      if (dirty) setConflict(true);
      else {
        setSnapshot(approval);
        setTo(approval.to_email || "");
        setSubject(approval.subject);
        setBody(approval.body);
        setConflict(false);
      }
    }
  }, [approval, snapshot.version, dirty]);
  function reload() {
    setSnapshot(approval);
    setTo(approval.to_email || "");
    setSubject(approval.subject);
    setBody(approval.body);
    setConflict(false);
    setError("");
  }
  function unwrap(value: Approval | { approval: Approval }): Approval {
    return "approval" in value ? value.approval : value;
  }
  async function persist() {
    if (!dirty) return snapshot;
    const result = unwrap(
      await patch<Approval | { approval: Approval }>(
        `/approvals/${approval.id}`,
        { to_email: to, subject, body, expected_version: snapshot.version },
      ),
    );
    setSnapshot(result);
    setTo(result.to_email || to);
    setSubject(result.subject);
    setBody(result.body);
    setConflict(false);
    return result;
  }
  async function saveEdits() {
    setBusy("edit");
    setError("");
    try {
      await persist();
      refresh();
      notify("success", t("草稿更改已保存", "Draft changes saved"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function decide(
    decision: "approve" | "reject" | "save",
    external = false,
  ) {
    setBusy(decision);
    setError("");
    try {
      const current = decision === "reject" ? snapshot : await persist();
      await post(`/approvals/${approval.id}/decision`, {
        decision,
        expected_version: current.version,
        reason: decision === "reject" ? reason : undefined,
        delivery_mode: external ? "smtp" : "test",
        authorize_external_send: external && authorize,
      });
      refresh();
      setRejectOpen(false);
      setExternalOpen(false);
      notify(
        "success",
        decision === "reject"
          ? t("已拒绝，未执行发送", "Rejected; nothing was sent")
          : decision === "save"
            ? t("已保存草稿，流程完成", "Draft saved; workflow completed")
            : external
              ? t(
                  "已授权外部发送，正在执行",
                  "External delivery authorized and queued",
                )
              : t(
                  "已批准，正在写入测试发件箱",
                  "Approved; queuing test outbox delivery",
                ),
      );
    } catch (e) {
      setError((e as Error).message);
      refresh();
    } finally {
      setBusy(null);
    }
  }
  return (
    <div
      className={cn("approval-editor", embedded && "approval-editor-embedded")}
    >
      <div className="approval-safety-note">
        <ShieldCheck size={19} />
        <div>
          <b>
            {approval.is_test
              ? t("这是一条测试线索", "This is a test lead")
              : t("发送前，最后一道确认", "The final check before delivery")}
          </b>
          <p>
            {approval.is_test
              ? t(
                  "批准后只会进入内置测试发件箱，不能外部发送。",
                  "Approval stores the message in the test outbox. External delivery is blocked.",
                )
              : t(
                  "默认只进入测试发件箱。真实发送需要有效 SMTP 配置和你的明确授权。",
                  "Delivery defaults to the test outbox. External email requires SMTP configuration and your explicit authorization.",
                )}
          </p>
        </div>
      </div>
      {approval.recommendation && (
        <div className="recommendation">
          <span className="small-label">
            {t("建议的下一步", "SUGGESTED NEXT STEP")}
          </span>
          <p>{approval.recommendation}</p>
        </div>
      )}
      {conflict && (
        <div className="inline-error" role="alert">
          <TriangleAlert size={17} />
          <span>
            {t(
              "此草稿已在别处更新，请重新载入后再审批。",
              "This draft changed elsewhere. Reload before approving.",
            )}
          </span>
          <Button variant="ghost" size="sm" onClick={reload}>
            {t("载入最新", "Reload latest")}
          </Button>
        </div>
      )}
      <div className="draft-sheet">
        <div className="draft-sheet-heading">
          <span>
            <Mail size={17} />
            {t("邮件草稿", "Email draft")}
          </span>
          <span>
            {t("版本", "Version")} {snapshot.version}
            {dirty && <Badge tone="amber">{t("未保存", "Unsaved")}</Badge>}
          </span>
        </div>
        <Field label={t("收件人", "To")} id={`draft-to-${approval.id}`}>
          <Input
            id={`draft-to-${approval.id}`}
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={!pending || !!busy}
            maxLength={254}
          />
        </Field>
        <Field label={t("主题", "Subject")} id={`draft-subject-${approval.id}`}>
          <Input
            id={`draft-subject-${approval.id}`}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={!pending || !!busy}
            maxLength={250}
          />
        </Field>
        <Field
          label={t("邮件正文", "Email body")}
          id={`draft-body-${approval.id}`}
        >
          <Textarea
            id={`draft-body-${approval.id}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={!pending || !!busy}
            rows={embedded ? 8 : 12}
            minLength={20}
            maxLength={12000}
          />
        </Field>
        <div className="draft-sheet-footer">
          <span>
            <Pencil size={13} />
            {pending
              ? t(
                  "可直接编辑，保存时校验版本",
                  "Editable, with version checks on save",
                )
              : t(
                  "审批已结束，草稿不可再编辑",
                  "Decision recorded; this draft is locked",
                )}
          </span>
          {pending && (
            <Button
              variant="ghost"
              size="sm"
              disabled={
                !dirty ||
                !!busy ||
                conflict ||
                subject.trim().length < 3 ||
                body.trim().length < 20
              }
              loading={busy === "edit"}
              onClick={() => void saveEdits()}
            >
              <Save size={14} />
              {t("保存编辑", "Save edits")}
            </Button>
          )}
        </div>
      </div>
      {!pending && (
        <div className="decision-record">
          <StatusBadge status={approval.status} />
          <span>
            {dateTime(approval.decided_at || approval.updated_at, lang)}
          </span>
          {approval.decision_reason && (
            <p>
              {t("审批意见：", "Decision note: ")}
              {approval.decision_reason}
            </p>
          )}
        </div>
      )}
      {error && (
        <div className="inline-error" role="alert">
          <XCircle size={17} />
          <span>{error}</span>
        </div>
      )}
      {pending && (
        <div className="approval-bottom">
          <div className="delivery-selector">
            <span className="small-label">
              {t("批准后的交付方式", "DELIVERY AFTER APPROVAL")}
            </span>
            <Select
              aria-label={t("交付方式", "Delivery mode")}
              value={mode}
              onChange={(e) => setMode(e.target.value as "test" | "smtp")}
              disabled={!!busy}
            >
              <option value="test">
                {t(
                  "内置测试发件箱（推荐）",
                  "Built-in test outbox (recommended)",
                )}
              </option>
              {canExternal && (
                <option value="smtp">
                  {t("SMTP 外部邮箱", "External SMTP email")}
                </option>
              )}
            </Select>
          </div>
          <div className="approval-actions">
            <Button
              variant="ghost"
              disabled={!!busy || conflict}
              onClick={() => {
                setReason("");
                setRejectOpen(true);
              }}
            >
              <X size={15} />
              {t("拒绝", "Reject")}
            </Button>
            <Button
              variant="outline"
              disabled={
                !!busy ||
                conflict ||
                subject.trim().length < 3 ||
                body.trim().length < 20
              }
              loading={busy === "save"}
              onClick={() => void decide("save")}
            >
              <FileText size={15} />
              {t("仅保存草稿", "Save draft only")}
            </Button>
            <Button
              disabled={
                !!busy ||
                conflict ||
                !to.trim() ||
                subject.trim().length < 3 ||
                body.trim().length < 20
              }
              loading={busy === "approve"}
              onClick={() => {
                if (mode === "smtp") {
                  setAuthorize(false);
                  setExternalOpen(true);
                } else void decide("approve");
              }}
            >
              <Check size={16} />
              {mode === "smtp"
                ? t("审批外部发送", "Review external send")
                : t("批准到测试发件箱", "Approve to test outbox")}
            </Button>
          </div>
        </div>
      )}
      <Modal
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={t("拒绝这封跟进邮件", "Reject this follow-up")}
        description={t(
          "拒绝将停止此执行的发送，并保留审批记录。",
          "Rejection stops delivery for this run and preserves the decision record.",
        )}
      >
        <div className="modal-form">
          <Field
            label={t("拒绝原因（可选）", "Reason (optional)")}
            id="reject-reason"
          >
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder={t("说明需要改进的内容…", "What should be improved?")}
            />
          </Field>
          <div className="dialog-actions">
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              {t("取消", "Cancel")}
            </Button>
            <Button
              variant="destructive"
              loading={busy === "reject"}
              onClick={() => void decide("reject")}
            >
              <X size={16} />
              {t("确认拒绝", "Confirm rejection")}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={externalOpen}
        onOpenChange={setExternalOpen}
        title={t("确认向外部邮箱发送", "Confirm external email delivery")}
        description={t(
          "这是实际外部发送。请核对收件人及已保存的邮件内容。",
          "This sends a real external email. Verify the recipient and saved content.",
        )}
      >
        <div className="modal-form">
          <div className="external-warning">
            <TriangleAlert size={21} />
            <div>
              <b>{to}</b>
              <p>{subject}</p>
            </div>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={authorize}
              onChange={(e) => setAuthorize(e.target.checked)}
            />
            <span>
              <b>
                {t(
                  "我明确授权发送这封邮件",
                  "I explicitly authorize this email",
                )}
              </b>
              <small>
                {t(
                  "批准记录将包含此次外部发送授权。",
                  "This authorization will be saved with the approval record.",
                )}
              </small>
            </span>
          </label>
          {error && <div className="inline-error">{error}</div>}
          <div className="dialog-actions">
            <Button variant="ghost" onClick={() => setExternalOpen(false)}>
              {t("取消", "Cancel")}
            </Button>
            <Button
              disabled={!authorize}
              loading={busy === "approve"}
              onClick={() => void decide("approve", true)}
            >
              <Send size={16} />
              {t("授权并发送", "Authorize & send")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function OutboxPage() {
  const { t, nonce, lang, openEvent } = useConsole();
  const query = useApiData<{ items: Outbox[]; total: number }>(
    "/outbox?limit=100",
    nonce,
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Outbox | null>(null);
  const messages = asList<Outbox>(query.data).filter(
    (message) =>
      !search ||
      `${message.to_email} ${message.subject}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="DELIVERY RECORDS"
        title={t(
          "每一封邮件，都有明确的去向。",
          "Every message has a clear destination.",
        )}
        description={t(
          "测试发件箱保存真实审批后的邮件；SMTP 记录单独标记。",
          "The test outbox stores approved messages. External SMTP records are clearly labeled.",
        )}
        actions={
          <Badge tone="blue">
            <Inbox size={13} />
            {t("默认测试发件箱", "Test outbox by default")}
          </Badge>
        }
      />
      <div className="outbox-banner">
        <ShieldCheck size={21} />
        <div>
          <b>
            {t(
              "测试发件箱中的邮件不会对外发送",
              "Messages in the test outbox are never sent externally",
            )}
          </b>
          <p>
            {t(
              "这里的记录来自实际审批和服务端持久化写入，可以核对最终收件人、正文、审批与事件。",
              "These records come from real approvals and persistent server writes. Inspect the final recipient, content, approval, and source event.",
            )}
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <div className="table-search">
            <Search size={16} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(
                "搜索收件人或主题…",
                "Search recipient or subject…",
              )}
              aria-label={t("搜索邮件", "Search messages")}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void query.refresh()}
            aria-label={t("刷新", "Refresh")}
          >
            <RefreshCw size={16} />
          </Button>
        </div>
        {query.error && <InlineError message={query.error} />}
        {query.loading ? (
          <Spinner />
        ) : !messages.length ? (
          <Empty
            icon={MailCheck}
            title={t("还没有邮件记录", "No messages yet")}
            description={t(
              "批准一封跟进邮件后，等待服务端完成交付，它就会出现在这里。",
              "Approve a follow-up and wait for server delivery. The final message will appear here.",
            )}
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("邮件", "Message")}</th>
                  <th>{t("收件人", "Recipient")}</th>
                  <th>{t("交付方式", "Delivery mode")}</th>
                  <th>{t("状态", "Status")}</th>
                  <th>{t("时间", "Time")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {messages.map((message) => (
                  <tr
                    key={message.id}
                    className="clickable-row"
                    onClick={() => setSelected(message)}
                  >
                    <td>
                      <div className="person-cell">
                        <span className="mail-avatar">
                          <Mail size={18} />
                        </span>
                        <div>
                          <button
                            className="cell-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(message);
                            }}
                          >
                            {message.subject}
                          </button>
                          <div className="cell-subline mono">
                            #{shortId(message.id)}
                            {message.is_test && (
                              <span className="mini-tag">
                                {t("测试", "TEST")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{message.to_email}</td>
                    <td>
                      <Badge tone={message.mode === "smtp" ? "amber" : "blue"}>
                        {message.mode === "smtp"
                          ? "SMTP"
                          : t("测试发件箱", "Test outbox")}
                      </Badge>
                    </td>
                    <td>
                      <StatusBadge status={message.status} />
                    </td>
                    <td className="date-cell">
                      {dateTime(
                        message.sent_at || message.created_at,
                        lang,
                        true,
                      )}
                    </td>
                    <td>
                      <ChevronRight size={15} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          <span>
            {t(`${messages.length} 封邮件`, `${messages.length} messages`)}
          </span>
          <span>
            {t(
              "每条记录关联唯一审批",
              "Every record links to a unique approval",
            )}
          </span>
        </div>
      </section>
      <Modal
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={t("邮件交付记录", "Message delivery record")}
        description={
          selected?.mode === "smtp"
            ? t("外部 SMTP 交付记录", "External SMTP delivery record")
            : t(
                "仅保存于测试发件箱，没有发送到外部邮箱。",
                "Stored in the test outbox only. It was not sent externally.",
              )
        }
        wide
      >
        <div className="modal-form">
          {selected && (
            <>
              <div className="message-metadata">
                <div>
                  <span>{t("收件人", "To")}</span>
                  <b>{selected.to_email}</b>
                </div>
                <div>
                  <span>{t("主题", "Subject")}</span>
                  <b>{selected.subject}</b>
                </div>
                <div>
                  <span>{t("状态", "Status")}</span>
                  <StatusBadge status={selected.status} />
                </div>
                <div>
                  <span>{t("审批编号", "Approval")}</span>
                  <code>{selected.approval_id}</code>
                </div>
                <div>
                  <span>{t("消息标识", "Message ID")}</span>
                  <code>{selected.message_id || "—"}</code>
                </div>
              </div>
              <pre className="email-preview">{selected.body}</pre>
              {selected.error_message && (
                <InlineError
                  message={`${selected.error_code || ""} ${selected.error_message}`}
                />
              )}
              {selected.mode === "smtp" &&
                ["unknown", "sending"].includes(selected.status) && (
                  <ReconcileOutbox
                    key={selected.id}
                    message={selected}
                    onResolved={() => setSelected(null)}
                  />
                )}
              <div className="dialog-actions">
                <Button
                  variant="outline"
                  onClick={() => {
                    openEvent(selected.event_id);
                    setSelected(null);
                  }}
                >
                  {t("查看来源与审批", "View source & approval")}
                  <ArrowUpRight size={15} />
                </Button>
                <Button onClick={() => setSelected(null)}>
                  {t("关闭", "Close")}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

function ReconcileOutbox({
  message,
  onResolved,
}: {
  message: Outbox;
  onResolved: () => void;
}) {
  const { t, refresh, notify } = useConsole();
  const [outcome, setOutcome] = useState<
    "" | "confirmed_sent" | "confirmed_not_sent"
  >("");
  const [reason, setReason] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function resolve() {
    if (!outcome || !verified || reason.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      await post(`/outbox/${message.id}/resolve`, {
        outcome,
        reason: reason.trim(),
      });
      refresh();
      notify(
        "success",
        outcome === "confirmed_sent"
          ? t("已记录核实后的投递结果", "Verified delivery outcome recorded")
          : t(
              "已确认未发送，重新排队投递",
              "Confirmed not sent; queued for delivery",
            ),
      );
      onResolved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="reconcile-box">
      <div className="reconcile-heading">
        <TriangleAlert size={21} />
        <div>
          <h3>
            {t("外部投递结果不确定", "External delivery outcome is uncertain")}
          </h3>
          <p>
            {t(
              "请先到 SMTP 服务商日志或收件方核实。系统不会自行猜测或自动重复发送。",
              "Verify the delivery using your SMTP provider logs or with the recipient. The system does not guess or resend automatically.",
            )}
          </p>
        </div>
      </div>
      <Field
        label={t("你在外部核实的结果", "Outcome verified externally")}
        id="reconcile-outcome"
      >
        <Select
          id="reconcile-outcome"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as typeof outcome)}
        >
          <option value="">
            {t("请选择已核实的结果", "Select a verified outcome")}
          </option>
          <option value="confirmed_sent">
            {t("已确认成功发送，不再重发", "Confirmed sent — do not resend")}
          </option>
          <option value="confirmed_not_sent">
            {t(
              "已确认未发送，允许重新投递",
              "Confirmed not sent — allow retry",
            )}
          </option>
        </Select>
      </Field>
      <Field
        label={t("核实依据 *", "Verification evidence *")}
        id="reconcile-reason"
      >
        <Textarea
          id="reconcile-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={3}
          maxLength={1000}
          rows={3}
          placeholder={t(
            "例如：已核对 SMTP 服务商日志及消息 ID，确认…",
            "For example: Checked the SMTP provider log and Message-ID; confirmed…",
          )}
        />
      </Field>
      <label className="check-row">
        <input
          type="checkbox"
          checked={verified}
          onChange={(e) => setVerified(e.target.checked)}
        />
        <span>
          <b>
            {t(
              "我已通过外部记录核实此结果",
              "I verified this outcome using external records",
            )}
          </b>
          <small>
            {outcome === "confirmed_not_sent"
              ? t(
                  "确认后，系统会再次执行已授权的 SMTP 投递。",
                  "Confirmation queues another attempt of the authorized SMTP delivery.",
                )
              : t(
                  "此决定和核实依据会保存在操作记录中。",
                  "This decision and its evidence will be saved in the audit trail.",
                )}
          </small>
        </span>
      </label>
      {error && <InlineError message={error} />}
      <Button
        variant={outcome === "confirmed_not_sent" ? "destructive" : "default"}
        disabled={!verified || !outcome || reason.trim().length < 3}
        loading={busy}
        onClick={() => void resolve()}
      >
        {outcome === "confirmed_not_sent" ? (
          <Send size={15} />
        ) : (
          <Check size={15} />
        )}
        {outcome === "confirmed_not_sent"
          ? t("确认未发送并重新投递", "Confirm not sent & retry")
          : t("记录已核实的结果", "Record verified outcome")}
      </Button>
    </div>
  );
}
