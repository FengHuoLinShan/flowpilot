import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  Check,
  ClipboardList,
  Mail,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  UsersRound,
  XCircle,
} from "lucide-react";
import { useConsole } from "../lib/context";
import { patch } from "../lib/api";
import { useApiData } from "../lib/useApiData";
import type { Company, Contact, Lead, Task } from "../lib/types";
import { asList, dateTime, shortId } from "../lib/utils";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
} from "../components/ui";
import {
  Avatar,
  Empty,
  InlineError,
  PageHeader,
  PriorityBadge,
  StatusBadge,
} from "../components/shared";

type CrmTab = "leads" | "contacts" | "companies" | "tasks";
type CrmRow = Lead | Contact | Company | Task;
export function CrmPage() {
  const { t, lang, nonce, refresh, notify, openEvent } = useConsole();
  const [tab, setTab] = useState<CrmTab>("leads");
  const [search, setSearch] = useState("");
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const query = useApiData<{ items: CrmRow[]; total: number }>(
    `/crm/${tab}?limit=100`,
    nonce,
  );
  const items = asList<CrmRow>(query.data).filter(
    (row) =>
      !search ||
      Object.values(row).some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
  );
  useEffect(() => setSearch(""), [tab]);
  const tabs: {
    id: CrmTab;
    zh: string;
    en: string;
    icon: typeof UsersRound;
  }[] = [
    { id: "leads", zh: "业务线索", en: "Leads", icon: ClipboardList },
    { id: "contacts", zh: "联系人", en: "Contacts", icon: UsersRound },
    { id: "companies", zh: "公司", en: "Companies", icon: Building2 },
    { id: "tasks", zh: "跟进任务", en: "Follow-up tasks", icon: Check },
  ];
  async function toggleTask(task: Task) {
    setBusyId(task.id);
    try {
      await patch(`/crm/tasks/${task.id}`, {
        status: task.status === "done" ? "open" : "done",
      });
      refresh();
      notify("success", t("任务状态已更新", "Task updated"));
    } catch (e) {
      notify("error", t("更新失败", "Update failed"), (e as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="CUSTOMER RELATIONSHIPS"
        title={t(
          "关系有序，跟进有据。",
          "Organized relationships. Clear follow-ups.",
        )}
        description={t(
          "真实写入的内置 CRM。联系人匹配、公司归档、线索状态与任务都可追溯。",
          "Your real built-in CRM: matched contacts, organized companies, lead stages, and follow-up tasks.",
        )}
        actions={
          <Badge tone="green">
            <span className="status-dot" />
            {t("内置 CRM 已启用", "Built-in CRM enabled")}
          </Badge>
        }
      />
      <div className="section-tabs">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}
          >
            <item.icon size={16} />
            {t(item.zh, item.en)}
          </button>
        ))}
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <div className="table-search">
            <Search size={16} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("搜索当前列表…", "Search this list…")}
              aria-label={t("搜索 CRM", "Search CRM")}
            />
          </div>
          <div className="toolbar-right">
            <span className="muted text-sm">
              {t(
                "数据来源：工作流实际执行",
                "Source: actual workflow execution",
              )}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("刷新", "Refresh")}
              onClick={() => void query.refresh()}
            >
              <RefreshCw size={16} />
            </Button>
          </div>
        </div>
        {query.error && (
          <InlineError
            message={query.error}
            onRetry={() => void query.refresh()}
          />
        )}
        {query.loading ? (
          <Spinner />
        ) : !items.length ? (
          <Empty
            icon={
              tab === "companies"
                ? Building2
                : tab === "tasks"
                  ? ClipboardList
                  : UsersRound
            }
            title={
              search
                ? t("没有匹配记录", "No matching records")
                : t("暂无 CRM 记录", "No CRM records yet")
            }
            description={
              search
                ? t("试试其他关键词。", "Try a different search term.")
                : t(
                    "有效线索执行到 CRM 步骤后，这里会显示真实创建的记录。",
                    "Real records appear here when a qualified event reaches the CRM step.",
                  )
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {tab === "leads" ? (
                    <>
                      <th>{t("客户 / 公司", "Customer / company")}</th>
                      <th>{t("需求", "Inquiry")}</th>
                      <th>{t("预算", "Budget")}</th>
                      <th>{t("优先级", "Priority")}</th>
                      <th>{t("状态", "Stage")}</th>
                      <th>{t("负责人", "Owner")}</th>
                      <th />
                    </>
                  ) : tab === "contacts" ? (
                    <>
                      <th>{t("联系人", "Contact")}</th>
                      <th>{t("公司", "Company")}</th>
                      <th>{t("联系方式", "Contact details")}</th>
                      <th>{t("更新于", "Updated")}</th>
                    </>
                  ) : tab === "companies" ? (
                    <>
                      <th>{t("公司名称", "Company name")}</th>
                      <th>{t("匹配标识", "Matching identity")}</th>
                      <th>{t("创建时间", "Created")}</th>
                    </>
                  ) : (
                    <>
                      <th>{t("跟进任务", "Follow-up task")}</th>
                      <th>{t("负责人", "Owner")}</th>
                      <th>{t("计划时间", "Due")}</th>
                      <th>{t("状态", "Status")}</th>
                      <th />
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {tab === "leads"
                  ? (items as Lead[]).map((lead) => (
                      <tr
                        className="clickable-row"
                        key={lead.id}
                        onClick={() => openEvent(lead.event_id)}
                      >
                        <td>
                          <div className="person-cell">
                            <Avatar
                              name={lead.name || lead.company_name || "?"}
                            />
                            <div>
                              <button
                                className="cell-link"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEvent(lead.event_id);
                                }}
                              >
                                {lead.name ||
                                  t("未提供姓名", "Name unavailable")}
                              </button>
                              <div className="cell-subline">
                                {lead.company_name || lead.email || "—"}
                                {lead.is_test && (
                                  <span className="mini-tag">
                                    {t("测试", "TEST")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div
                            className="cell-truncate"
                            title={lead.requirement}
                          >
                            {lead.requirement}
                          </div>
                          {lead.tags?.length > 0 && (
                            <div className="cell-tags">
                              {lead.tags.slice(0, 2).map((tag) => (
                                <span key={tag}>{tag}</span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="number-cell">
                          {lead.budget !== null && lead.budget !== undefined
                            ? `${lead.currency || "CNY"} ${Number(lead.budget).toLocaleString()}`
                            : "—"}
                        </td>
                        <td>
                          <PriorityBadge priority={lead.priority} />
                        </td>
                        <td>
                          <StatusBadge status={lead.status} />
                        </td>
                        <td>
                          <span className="owner-cell">
                            {lead.owner || t("未分配", "Unassigned")}
                          </span>
                        </td>
                        <td>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("编辑线索", "Edit lead")}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingLead(lead);
                            }}
                          >
                            <Pencil size={15} />
                          </Button>
                        </td>
                      </tr>
                    ))
                  : tab === "contacts"
                    ? (items as Contact[]).map((contact) => (
                        <tr key={contact.id}>
                          <td>
                            <div className="person-cell">
                              <Avatar name={contact.name || "?"} />
                              <div>
                                <b>{contact.name || "—"}</b>
                                <span className="cell-subline mono">
                                  #{shortId(contact.id)}
                                  {contact.is_test && (
                                    <span className="mini-tag">
                                      {t("测试", "TEST")}
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>{contact.company_name || "—"}</td>
                          <td>
                            <div className="contact-lines">
                              {contact.email && (
                                <span>
                                  <Mail size={13} />
                                  {contact.email}
                                </span>
                              )}
                              {contact.phone && (
                                <span>
                                  <Phone size={13} />
                                  {contact.phone}
                                </span>
                              )}
                              {!contact.email && !contact.phone && "—"}
                            </div>
                          </td>
                          <td className="date-cell">
                            {dateTime(contact.updated_at, lang, true)}
                          </td>
                        </tr>
                      ))
                    : tab === "companies"
                      ? (items as Company[]).map((company) => (
                          <tr key={company.id}>
                            <td>
                              <div className="person-cell">
                                <span className="company-avatar">
                                  <Building2 size={19} />
                                </span>
                                <b>{company.name}</b>
                                {company.is_test && (
                                  <span className="mini-tag">
                                    {t("测试", "TEST")}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <code className="subtle-code">
                                {company.normalized_name}
                              </code>
                            </td>
                            <td className="date-cell">
                              {dateTime(company.created_at, lang, true)}
                            </td>
                          </tr>
                        ))
                      : (items as Task[]).map((task) => (
                          <tr key={task.id}>
                            <td>
                              <div className="task-cell">
                                <button
                                  className={`task-check ${task.status === "done" ? "task-checked" : ""}`}
                                  disabled={busyId === task.id}
                                  onClick={() => void toggleTask(task)}
                                  aria-label={
                                    task.status === "done"
                                      ? t("重新打开任务", "Reopen task")
                                      : t("完成任务", "Complete task")
                                  }
                                >
                                  {task.status === "done" && (
                                    <Check size={14} />
                                  )}
                                </button>
                                <button
                                  className="cell-link"
                                  onClick={() => openEvent(task.event_id)}
                                >
                                  {task.title}
                                </button>
                                {task.is_test && (
                                  <span className="mini-tag">
                                    {t("测试", "TEST")}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>{task.owner || t("未分配", "Unassigned")}</td>
                            <td className="date-cell">
                              {dateTime(task.due_at, lang, true)}
                            </td>
                            <td>
                              <StatusBadge status={task.status} />
                            </td>
                            <td>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={t(
                                  "查看来源事件",
                                  "View source event",
                                )}
                                onClick={() => openEvent(task.event_id)}
                              >
                                <ArrowUpRight size={16} />
                              </Button>
                            </td>
                          </tr>
                        ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          <span>
            {t(
              `当前显示 ${items.length} 条记录`,
              `Showing ${items.length} records`,
            )}
          </span>
          <span>
            <UsersRound size={13} />
            {t(
              "联系人按联系方式精确匹配",
              "Contacts match exact contact details",
            )}
          </span>
        </div>
      </section>
      <div className="helper-note">
        <Building2 size={15} />
        {t(
          "当前执行内置 CRM；HubSpot、GoHighLevel 等外部平台尚未接入。",
          "The built-in CRM is active. External platforms such as HubSpot and GoHighLevel are not connected.",
        )}
      </div>
      <EditLeadModal lead={editingLead} onClose={() => setEditingLead(null)} />
    </>
  );
}

function EditLeadModal({
  lead,
  onClose,
}: {
  lead: Lead | null;
  onClose: () => void;
}) {
  const { t, notify, refresh } = useConsole();
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState("new");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (lead) {
      setOwner(lead.owner || "");
      setStatus(lead.status);
      setError("");
    }
  }, [lead]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!lead) return;
    setBusy(true);
    try {
      await patch(`/crm/leads/${lead.id}`, {
        status,
        ...(owner.trim() ? { owner: owner.trim() } : {}),
      });
      refresh();
      notify("success", t("线索已更新", "Lead updated"));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={!!lead}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("更新线索状态", "Update lead stage")}
      description={t(
        "状态与负责人更改会写入操作记录。",
        "Stage and owner changes are persisted in the audit trail.",
      )}
    >
      <form onSubmit={save} className="modal-form">
        <div className="info-panel">
          <UsersRound size={19} />
          <div>
            <b>{lead?.name}</b>
            <p>{lead?.company_name || lead?.email}</p>
          </div>
        </div>
        <Field label={t("销售状态", "Sales stage")} id="lead-stage">
          <Select
            id="lead-stage"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {[
              ["new", "新线索", "New"],
              ["qualified", "已确认需求", "Qualified"],
              ["contacted", "已跟进", "Contacted"],
              ["won", "已成交", "Won"],
              ["lost", "已流失", "Lost"],
              ["disqualified", "无关线索", "Disqualified"],
            ].map(([value, zh, en]) => (
              <option key={value} value={value}>
                {t(zh, en)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("负责人", "Owner")} id="lead-owner">
          <Input
            id="lead-owner"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder={t("输入负责人的姓名或团队", "Enter an owner or team")}
            maxLength={100}
          />
        </Field>
        {error && (
          <div className="inline-error">
            <XCircle size={17} />
            {error}
          </div>
        )}
        <div className="dialog-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("取消", "Cancel")}
          </Button>
          <Button type="submit" loading={busy}>
            <Check size={16} />
            {t("保存更改", "Save changes")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
