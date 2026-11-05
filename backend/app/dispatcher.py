from __future__ import annotations

import secrets
import time
from datetime import timedelta

import httpx
from sqlalchemy import or_, select, update

from .db import Approval, Event, Execution, NodeRun, Outbox, now, utc
from .errors import FlowError
from .service_base import audit


class DispatcherMixin:
    def recover_stale(self) -> int:
        count = 0
        with self.db.session() as session, session.begin():
            runs = list(session.scalars(select(Execution).where(
                Execution.status.in_(["running", "retrying"]), Execution.lease_until < now()
            ).with_for_update(skip_locked=True).limit(100)))
            for run in runs:
                if run.step_lease_until and utc(run.step_lease_until) > now():
                    continue
                event = self.event_locked(session, run.event_id)
                if event.current_execution_id != run.id:
                    continue
                approval = session.scalar(select(Approval).where(Approval.execution_id == run.id))
                outbox = session.scalar(select(Outbox).where(Outbox.approval_id == approval.id)) if approval else None
                ambiguous = bool(outbox and outbox.mode == "smtp" and outbox.status in {"sending", "unknown"})
                if ambiguous:
                    outbox.status = "unknown"
                    outbox.error_code = "SMTP_DELIVERY_UNKNOWN"
                    outbox.error_message = "Worker stopped during SMTP delivery. Verify provider records before resuming."
                run.error_code = "SMTP_DELIVERY_UNKNOWN" if ambiguous else "EXECUTION_INTERRUPTED"
                run.error_message = "Delivery outcome requires manual reconciliation." if ambiguous else "Execution lease expired after an interruption. Safe persisted steps can resume."
                run.retryable = not ambiguous
                self.set_state(run, event, "failed")
                run.dispatch_token = run.step_owner = run.step_lease_until = run.lease_until = None
                run.next_run_at = now()
                for node in session.scalars(select(NodeRun).where(NodeRun.execution_id == run.id, NodeRun.status == "running")):
                    node.status, node.finished_at = "failed", now()
                    node.error_code, node.error_message = run.error_code, run.error_message
                audit(session, "execution_recovered", run.error_message, event_id=event.id, execution_id=run.id,
                      details={"error_code": run.error_code, "retryable": run.retryable})
                count += 1
        return count

    def _schedule_retries(self):
        with self.db.session() as session:
            ids = list(session.scalars(select(Execution.id).where(
                Execution.status == "failed", Execution.retryable.is_(True),
                Execution.attempt < self.settings.max_run_attempts, Execution.next_run_at <= now(),
                or_(Execution.lease_until.is_(None), Execution.lease_until <= now())
            ).limit(50)))
        for run_id in ids:
            try:
                self.retry_execution(run_id, automatic=True)
            except FlowError:
                # An operator may have corrected or approved a record since selection.
                continue

    def _take_next(self):
        cfg = self.effective_settings()
        with self.db.session() as session, session.begin():
            run = session.scalar(select(Execution).where(
                Execution.status.in_(["queued", "retrying"]), Execution.next_run_at <= now(),
                Execution.step_owner.is_(None)
            ).order_by(Execution.next_run_at, Execution.created_at).with_for_update(skip_locked=True).limit(1))
            if not run:
                return None
            event = self.event_locked(session, run.event_id)
            if event.current_execution_id != run.id:
                run.status, run.retryable = "failed", False
                run.error_code, run.error_message = "STALE_EXECUTION", "This execution is not the current event revision."
                return None
            token = secrets.token_hex(24)
            changed = session.execute(update(Execution).where(
                Execution.id == run.id, Execution.status.in_(["queued", "retrying"]), Execution.step_owner.is_(None)
            ).values(status="running", dispatch_token=token, n8n_execution_id=None,
                     lease_until=now() + timedelta(seconds=max(cfg.lease_seconds, cfg.llm_timeout_seconds * (cfg.llm_max_retries + 1) + 30)),
                     updated_at=now()))
            if changed.rowcount != 1:
                return None
            event.status, event.updated_at = "running", now()
            audit(session, "execution_dispatched", "Durable execution dispatched to its configured workflow engine.",
                  event_id=event.id, execution_id=run.id, details={"engine": run.engine, "phase": run.phase, "attempt": run.attempt})
            return {"run_id": run.id, "phase": run.phase, "dispatch_token": token, "engine": run.engine}

    def tick(self) -> bool:
        """Recover leases and dispatch one persisted job; no sleep, suitable for tests."""
        self.recover_stale()
        self._schedule_retries()
        work = self._take_next()
        if not work:
            self.sync_n8n_status()
            return False
        if work["engine"] == "local":
            native = "local-" + secrets.token_hex(8)
            try:
                self.claim(work["run_id"], work["phase"], work["dispatch_token"], native)
                if work["phase"] == "delivery":
                    for step in ["deliver", "finish"]:
                        self.run_step(work["run_id"], step, work["phase"], work["dispatch_token"], native)
                else:
                    self.run_step(work["run_id"], "extract", work["phase"], work["dispatch_token"], native)
                    state = self.run_step(work["run_id"], "classify", work["phase"], work["dispatch_token"], native)
                    if state["needs_review"]:
                        self.run_step(work["run_id"], "finish", work["phase"], work["dispatch_token"], native)
                    else:
                        self.run_step(work["run_id"], "crm", work["phase"], work["dispatch_token"], native)
                        if state["irrelevant"]:
                            self.run_step(work["run_id"], "finish", work["phase"], work["dispatch_token"], native)
                        else:
                            self.run_step(work["run_id"], "draft", work["phase"], work["dispatch_token"], native)
                            self.run_step(work["run_id"], "await_approval", work["phase"], work["dispatch_token"], native)
            except FlowError:
                # Node state and sanitized failure are persisted by run_step.
                pass
        else:
            cfg = self.effective_settings()
            try:
                with httpx.Client(timeout=15, trust_env=False) as client:
                    response = client.post(cfg.n8n_webhook_url, json={k: v for k, v in work.items() if k != "engine"},
                                           headers={"X-FlowPilot-Internal": cfg.internal_key})
                if response.status_code >= 400:
                    raise FlowError("N8N_DISPATCH_FAILED", f"n8n webhook rejected dispatch (HTTP {response.status_code}). Verify workflow publication and credentials.", status=503, retryable=True)
            except (httpx.HTTPError, FlowError) as exc:
                code = exc.code if isinstance(exc, FlowError) else "N8N_UNREACHABLE"
                message = exc.message if isinstance(exc, FlowError) else "n8n webhook is unavailable; the persisted event remains recoverable."
                with self.db.session() as session, session.begin():
                    run = self.execution_locked(session, work["run_id"])
                    # A timeout may occur after n8n claimed and started the workflow.
                    # Let the node lease govern recovery rather than dispatching twice.
                    if run.dispatch_token == work["dispatch_token"] and not run.n8n_execution_id and run.status == "running":
                        event = self.event_locked(session, run.event_id)
                        self.set_state(run, event, "failed")
                        run.error_code, run.error_message, run.retryable = code, message, True
                        run.dispatch_token = run.lease_until = None
                        run.next_run_at = now() + timedelta(seconds=self.settings.retry_delay_seconds)
                        audit(session, "dispatch_failed", message, event_id=event.id, execution_id=run.id, details={"error_code": code})
        self.sync_n8n_status()
        return True

    def sync_n8n_status(self, *, force=False) -> int:
        cfg = self.effective_settings()
        if not cfg.n8n_api_key or cfg.engine != "n8n":
            return 0
        instant = time.monotonic()
        if not force and instant - getattr(self, "_last_native_poll", 0) < 5:
            return 0
        self._last_native_poll = instant
        with self.db.session() as session:
            runs = list(session.scalars(select(Execution).where(Execution.engine == "n8n", Execution.n8n_execution_id.is_not(None),
                                                               Execution.n8n_status.in_(["unknown", "running", "error_reported"])).limit(30)))
            selected = [(r.id, r.n8n_execution_id) for r in runs]
        count = 0
        for run_id, native_id in selected:
            try:
                with httpx.Client(timeout=8, trust_env=False) as client:
                    response = client.get(cfg.n8n_base_url.rstrip("/") + "/api/v1/executions/" + native_id,
                                          headers={"X-N8N-API-KEY": cfg.n8n_api_key}, params={"includeData": "false"})
                if response.status_code != 200:
                    continue
                status = response.json().get("status")
                if status not in {"new", "running", "waiting", "success", "error", "canceled", "crashed", "unknown"}:
                    continue
                with self.db.session() as session, session.begin():
                    run = session.get(Execution, run_id)
                    if run.n8n_execution_id != native_id:
                        continue
                    run.n8n_status = status
                    history = list(run.n8n_runs or [])
                    for item in history:
                        if item.get("id") == native_id:
                            item["observed_status"], item["checked_at"] = status, now().isoformat()
                    run.n8n_runs = history
                    count += 1
            except (httpx.HTTPError, ValueError, KeyError):
                continue
        return count
