import { useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  RefreshCw,
  Search,
  TerminalSquare,
  XCircle,
} from "lucide-react";
import { useConsole } from "../lib/context";
import { post } from "../lib/api";
import { useApiData } from "../lib/useApiData";
import { asList, cn, dateTime, shortId } from "../lib/utils";
import type { Execution, NodeRun } from "../lib/types";
import { Badge, Button, Input, Modal, Select, Spinner } from "../components/ui";
import {
  Empty,
  InlineError,
  NativeStatus,
  PageHeader,
  Pipeline,
  RetryButton,
  StatusBadge,
  stepLabel,
  TestBadge,
} from "../components/shared";

export function ExecutionsPage() {
  const { t, nonce, lang, refresh, notify, openEvent } = useConsole();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const query = useApiData<{ items: Execution[]; total: number }>(
    `/executions?limit=100${status ? `&status=${status}` : ""}`,
    nonce,
  );
  const executions = asList<Execution>(query.data).filter(
    (run) =>
      !search ||
      `${run.id} ${run.event_id} ${run.n8n_execution_id || ""} ${run.error_code || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function retry(run: Execution) {
    setBusyId(run.id);
    try {
      await post(`/executions/${run.id}/retry`);
      refresh();
      notify("success", t("已排入重试队列", "Execution queued for retry"));
    } catch (e) {
      notify(
        "error",
        t("重试未能启动", "Could not start retry"),
        (e as Error).message,
      );
    } finally {
      setBusyId(null);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="EXECUTION HISTORY"
        title={t(
          "看见过程，也看见原因。",
          "See the process. Understand the outcome.",
        )}
        description={t(
          "真实节点状态、错误与重试记录。每个执行都可以追溯到原始事件。",
          "Real node states, errors, and retry attempts, linked back to the original event.",
        )}
        actions={
          <Button variant="outline" onClick={() => void query.refresh()}>
            <RefreshCw size={15} />
            {t("刷新记录", "Refresh")}
          </Button>
        }
      />
      <section className="panel">
        <div className="table-toolbar">
          <div className="table-search">
            <Search size={16} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(
                "搜索执行 ID、事件 ID 或错误码…",
                "Search execution, event, or error code…",
              )}
              aria-label={t("搜索执行记录", "Search executions")}
            />
          </div>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label={t("执行状态", "Execution status")}
          >
            <option value="">{t("全部状态", "All statuses")}</option>
            {[
              ["running", "执行中", "Running"],
              ["queued", "等待执行", "Queued"],
              ["retrying", "重试中", "Retrying"],
              ["waiting_approval", "等待审批", "Awaiting approval"],
              ["needs_review", "待人工确认", "Needs review"],
              ["succeeded", "已完成", "Completed"],
              ["failed", "异常", "Failed"],
              ["rejected", "已拒绝", "Rejected"],
            ].map(([value, zh, en]) => (
              <option key={value} value={value}>
                {t(zh, en)}
              </option>
            ))}
          </Select>
        </div>
        {query.error && (
          <InlineError
            message={query.error}
            onRetry={() => void query.refresh()}
          />
        )}
        {query.loading ? (
          <Spinner />
        ) : !executions.length ? (
          <Empty
            icon={Activity}
            title={t("暂无执行记录", "No executions yet")}
            description={t(
              "提交一个事件，或切换筛选条件。",
              "Submit an event or change the filter.",
            )}
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table execution-table">
              <thead>
                <tr>
                  <th>{t("执行 / 事件", "Execution / event")}</th>
                  <th>{t("当前节点", "Current step")}</th>
                  <th>{t("业务状态", "Business status")}</th>
                  <th>{t("编排状态", "Orchestration")}</th>
                  <th>{t("尝试", "Attempt")}</th>
                  <th>{t("开始时间", "Started")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {executions.map((run) => (
                  <tr
                    key={run.id}
                    className="clickable-row"
                    onClick={() => setSelectedId(run.id)}
                  >
                    <td>
                      <div className="execution-identity">
                        <span
                          className={cn(
                            "execution-icon",
                            run.status === "failed" && "execution-icon-failed",
                          )}
                        >
                          <TerminalSquare size={18} />
                        </span>
                        <div>
                          <button
                            className="cell-link mono"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(run.id);
                            }}
                          >
                            #{shortId(run.id)}
                          </button>
                          <span className="cell-subline mono">
                            {t("事件", "Event")} #{shortId(run.event_id)}
                            {run.is_test && (
                              <span className="mini-tag">
                                {t("测试", "TEST")}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div>
                        {run.current_node
                          ? stepLabel(run.current_node, t)
                          : "—"}
                      </div>
                      {run.error_code && (
                        <span className="error-code">{run.error_code}</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={run.status} />
                    </td>
                    <td>
                      <span className="engine-cell">
                        <i />
                        {run.engine === "n8n"
                          ? "n8n"
                          : t("本地引擎", "Local engine")}
                      </span>
                      {run.n8n_execution_id && (
                        <span className="cell-subline mono">
                          n8n #{run.n8n_execution_id}
                        </span>
                      )}
                      <NativeStatus execution={run} />
                    </td>
                    <td className="number-cell">{run.attempt || 1}</td>
                    <td className="date-cell">
                      {dateTime(run.created_at, lang, true)}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        <RetryButton
                          execution={run}
                          loading={busyId === run.id}
                          onClick={() => void retry(run)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("查看来源事件", "View source event")}
                          onClick={() => openEvent(run.event_id)}
                        >
                          <ArrowUpRight size={15} />
                        </Button>
                      </div>
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
              `当前显示 ${executions.length} 条执行`,
              `Showing ${executions.length} executions`,
            )}
          </span>
          <span>
            <Clock3 size={13} />
            {t("失败执行支持人工恢复", "Manual recovery for failed runs")}
          </span>
        </div>
      </section>
      <ExecutionDialog id={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}

export function ExecutionDialog({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { t, nonce, lang, notify, refresh, openEvent } = useConsole();
  const query = useApiData<Execution>(id ? `/executions/${id}` : null, nonce);
  const run = query.data;
  const [busy, setBusy] = useState(false);
  async function retry() {
    if (!run) return;
    setBusy(true);
    try {
      await post(`/executions/${run.id}/retry`);
      refresh();
      notify("success", t("已排入重试队列", "Queued for retry"));
    } catch (e) {
      notify("error", t("无法重试", "Retry failed"), (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!run) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(run, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `flowpilot-execution-${shortId(run.id)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Modal
      open={!!id}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("执行详情", "Execution details")}
      description={id ? `${t("执行 ID", "Execution ID")}: ${id}` : ""}
      wide
    >
      <div className="execution-detail">
        {query.loading ? (
          <Spinner />
        ) : query.error ? (
          <InlineError
            message={query.error}
            onRetry={() => void query.refresh()}
          />
        ) : (
          run && (
            <>
              <div className="execution-meta">
                <StatusBadge status={run.status} />
                <Badge>
                  {run.engine === "n8n"
                    ? "n8n"
                    : t("本地引擎 · 非 n8n", "Local engine · not n8n")}
                </Badge>
                {run.is_test && <TestBadge />}
                <span>
                  {t("第", "Attempt")} {run.attempt || 1} {t("次执行", "")}
                </span>
                <span>{dateTime(run.created_at, lang)}</span>
              </div>
              {run.error_message && (
                <div className="execution-error">
                  <XCircle size={20} />
                  <div>
                    <b>{run.error_code || t("执行异常", "Execution failed")}</b>
                    <p>{run.error_message}</p>
                  </div>
                </div>
              )}
              <Pipeline execution={run} nodes={run.nodes || []} />
              <NativeStatus execution={run} history />
              <div className="detail-section-heading">
                <h3>{t("持久化节点记录", "Persistent node records")}</h3>
                {run.n8n_execution_id && (
                  <span className="mono">n8n #{run.n8n_execution_id}</span>
                )}
              </div>
              <NodeTimeline nodes={run.nodes || []} />
              <div className="dialog-actions">
                <Button variant="ghost" onClick={download}>
                  <ArrowDownToLine size={15} />
                  {t("导出执行记录", "Export execution")}
                </Button>
                <div className="button-group">
                  <RetryButton
                    execution={run}
                    loading={busy}
                    onClick={() => void retry()}
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      openEvent(run.event_id);
                      onClose();
                    }}
                  >
                    {t("查看原始事件", "View source event")}
                    <ArrowUpRight size={15} />
                  </Button>
                </div>
              </div>
            </>
          )
        )}
      </div>
    </Modal>
  );
}

export function NodeTimeline({ nodes }: { nodes: NodeRun[] }) {
  const { t, lang } = useConsole();
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!nodes.length)
    return (
      <div className="no-nodes">
        <Clock3 size={18} />
        {t(
          "尚未开始执行节点，等待工作流引擎接收。",
          "No nodes have started. Waiting for the workflow engine.",
        )}
      </div>
    );
  return (
    <div className="node-timeline">
      {nodes.map((node) => (
        <div
          key={node.id}
          className={cn("node-timeline-item", `node-${node.status}`)}
        >
          <span className="node-timeline-dot">
            {node.status === "succeeded" ? (
              <Check size={12} />
            ) : node.status === "failed" ? (
              <X size={12} />
            ) : (
              <Clock3 size={11} />
            )}
          </span>
          <button
            className="node-heading"
            onClick={() => setExpanded(expanded === node.id ? null : node.id)}
            aria-expanded={expanded === node.id}
          >
            <div>
              <b>{stepLabel(node.step, t)}</b>
              <span>
                {dateTime(node.started_at, lang, true)} · {t("尝试", "Attempt")}{" "}
                {node.attempt || 1}
              </span>
            </div>
            <div>
              <StatusBadge status={node.status} />
              {node.duration_ms !== undefined && node.duration_ms !== null && (
                <span className="mono node-duration">
                  {node.duration_ms < 1000
                    ? `${node.duration_ms}ms`
                    : `${(node.duration_ms / 1000).toFixed(2)}s`}
                </span>
              )}
              <ChevronDown
                size={15}
                className={expanded === node.id ? "rotate-180" : ""}
              />
            </div>
          </button>
          {node.error_message && (
            <div className="node-error">
              <code>{node.error_code}</code>
              <p>{node.error_message}</p>
            </div>
          )}
          {expanded === node.id && (
            <div className="node-expanded">
              <span className="small-label">
                {t("节点输出", "NODE OUTPUT")}
              </span>
              <pre className="json-block">
                {node.output
                  ? JSON.stringify(node.output, null, 2)
                  : t("此节点没有输出数据。", "No output data for this node.")}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

import { X } from "lucide-react";
