from __future__ import annotations

import hmac
import secrets
from datetime import timedelta

from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError

from .crm import BuiltinCRMAdapter
from .db import Approval, Event, Execution, NodeRun, Outbox, now, utc
from .errors import FlowError, NeedsReview
from .llm import LLMClient
from .rules import classify
from .schemas import Extraction
from .service_base import audit

STEPS = {"extract", "classify", "crm", "draft", "await_approval", "deliver", "finish"}
TERMINAL = {"succeeded", "rejected", "needs_review", "waiting_approval"}


class WorkflowMixin:
    def _context_check(self, run, event, phase: str, token: str, native_id: str | None = None):
        if event.current_execution_id != run.id or event.revision != run.revision:
            raise FlowError("STALE_EXECUTION", "This execution was replaced by a corrected revision.", status=409)
        if run.phase != phase or not run.dispatch_token or not hmac.compare_digest(run.dispatch_token, token):
            raise FlowError("STALE_DISPATCH", "The dispatch lease is stale. This callback cannot execute any action.", status=409)
        if native_id and run.n8n_execution_id and run.n8n_execution_id != native_id:
            raise FlowError("DUPLICATE_ENGINE_EXECUTION", "Another native execution already owns this dispatch.", status=409)

    def _stage_response(self, run, event, *, proceed=True):
        data = event.classification or {}
        return {"run_id": run.id, "proceed": proceed, "phase": run.phase, "dispatch_token": run.dispatch_token,
                "needs_review": run.status == "needs_review" or bool(data.get("needs_review")),
                "irrelevant": bool(data.get("irrelevant")), "status": run.status}

    def claim(self, run_id: str, phase: str, dispatch_token: str, n8n_execution_id: str) -> dict:
        with self.db.session() as session, session.begin():
            run = self.execution_locked(session, run_id)
            event = self.event_locked(session, run.event_id)
            self._context_check(run, event, phase, dispatch_token)
            if run.n8n_execution_id and run.n8n_execution_id != n8n_execution_id:
                return self._stage_response(run, event, proceed=False)
            if run.status in TERMINAL:
                return self._stage_response(run, event, proceed=False)
            if run.status not in {"running", "retrying", "failed"}:
                raise FlowError("RUN_NOT_DISPATCHED", "Execution has not been dispatched by the durable worker.", status=409)
            if run.engine == "n8n":
                claimed = session.execute(update(Execution).where(
                    Execution.id == run.id, Execution.dispatch_token == dispatch_token,
                    or_(Execution.n8n_execution_id.is_(None), Execution.n8n_execution_id == n8n_execution_id)
                ).values(n8n_execution_id=n8n_execution_id))
                if claimed.rowcount != 1:
                    session.refresh(run)
                    return self._stage_response(run, event, proceed=False)
            run.n8n_status = "running" if run.engine == "n8n" else "not_applicable"
            history = list(run.n8n_runs or [])
            if run.engine == "n8n" and not any(x.get("id") == n8n_execution_id for x in history):
                history.append({"id": n8n_execution_id, "phase": phase, "attempt": run.attempt,
                                "observed_status": "running", "started_at": now().isoformat()})
                run.n8n_runs = history
            cfg = self.effective_settings(session)
            run.lease_until = now() + timedelta(seconds=max(cfg.lease_seconds, cfg.llm_timeout_seconds * (cfg.llm_max_retries + 1) + 30))
            audit(session, "engine_claimed", "Workflow engine claimed the durable dispatch.", event_id=event.id,
                  execution_id=run.id, details={"engine": run.engine, "native_execution_id": n8n_execution_id, "phase": phase})
            return self._stage_response(run, event)

    def _require_previous(self, session, run, event, step):
        done = set(session.scalars(select(NodeRun.step).where(NodeRun.execution_id == run.id, NodeRun.status == "succeeded")))
        if step == "extract":
            if run.phase != "pipeline":
                raise FlowError("STEP_ORDER_INVALID", "Extraction is available only in the pipeline phase.", status=409)
        elif step == "classify":
            if "extract" not in done:
                raise FlowError("STEP_ORDER_INVALID", "Extraction must finish before classification.", status=409)
        elif step == "crm":
            if "classify" not in done or not event.classification or event.classification.get("needs_review"):
                raise FlowError("REVIEW_REQUIRED", "Business validation must pass before any CRM mutation.", status=409)
        elif step == "draft":
            if "crm" not in done or (event.classification or {}).get("irrelevant"):
                raise FlowError("STEP_ORDER_INVALID", "A relevant, validated CRM lead is required before drafting.", status=409)
        elif step == "await_approval":
            if "draft" not in done:
                raise FlowError("STEP_ORDER_INVALID", "A validated draft must exist before requesting approval.", status=409)
        elif step == "deliver":
            if run.phase != "delivery":
                raise FlowError("APPROVAL_REQUIRED", "Delivery is available only after an explicit approval decision.", status=409)
            approval = session.scalar(select(Approval).where(Approval.execution_id == run.id))
            if not approval or approval.status not in {"approved", "sent", "test_saved"}:
                raise FlowError("APPROVAL_REQUIRED", "An approved immutable draft is required before delivery.", status=409)
        elif step == "finish":
            c = event.classification or {}
            if run.phase == "delivery" and "deliver" not in done:
                raise FlowError("STEP_ORDER_INVALID", "Delivery must be recorded before completing an approved action.", status=409)
            if run.phase == "pipeline" and not ("classify" in done and c.get("needs_review")) and not ("crm" in done and c.get("irrelevant")):
                raise FlowError("STEP_ORDER_INVALID", "Only a review pause or unrelated archive may finish directly in the pipeline.", status=409)
        if step != "deliver" and step != "finish" and run.phase != "pipeline":
            raise FlowError("STEP_ORDER_INVALID", "Pipeline stages cannot execute during delivery.", status=409)

    def run_step(self, run_id: str, step: str, phase: str, dispatch_token: str, n8n_execution_id: str) -> dict:
        if step not in STEPS:
            raise FlowError("STEP_NOT_FOUND", "Unknown workflow step.", status=404)
        owner = secrets.token_hex(24)
        with self.db.session() as session, session.begin():
            run = self.execution_locked(session, run_id)
            event = self.event_locked(session, run.event_id)
            self._context_check(run, event, phase, dispatch_token, n8n_execution_id)
            node = session.scalar(select(NodeRun).where(NodeRun.execution_id == run_id, NodeRun.step == step))
            if node and node.status == "succeeded":
                return self._stage_response(run, event)
            self._require_previous(session, run, event, step)
            allowed_review_finish = step == "finish" and run.status == "needs_review"
            if run.status not in {"running", "retrying", "failed"} and not allowed_review_finish:
                raise FlowError("EXECUTION_PAUSED", "This execution is not running. A human action is required to continue.", status=409)
            if run.status == "failed" and not run.retryable:
                raise FlowError("MANUAL_RETRY_REQUIRED", "This failure requires an operator retry or correction.", status=409)
            cfg = self.effective_settings(session)
            lease_seconds = max(cfg.lease_seconds, cfg.llm_timeout_seconds * (cfg.llm_max_retries + 1) + 30)
            claimed = session.execute(update(Execution).where(
                Execution.id == run_id, Execution.dispatch_token == dispatch_token,
                or_(Execution.step_owner.is_(None), Execution.step_lease_until < now())
            ).values(step_owner=owner, step_lease_until=now() + timedelta(seconds=lease_seconds),
                     lease_until=now() + timedelta(seconds=lease_seconds)))
            if claimed.rowcount != 1:
                raise FlowError("STEP_BUSY", "The current node still holds its execution lease.", status=409, retryable=True)
            # Re-read after the compare-and-set for SQLite's concurrent test mode.
            # A second request may have read the node before the first committed.
            session.expire_all()
            run = session.get(Execution, run_id)
            event = session.get(Event, run.event_id)
            node = session.scalar(select(NodeRun).where(NodeRun.execution_id == run_id, NodeRun.step == step))
            if node and node.status == "succeeded":
                run.step_owner = run.step_lease_until = None
                return self._stage_response(run, event)
            run.current_node = step
            if not allowed_review_finish:
                self.set_state(run, event, "running")
            run.error_code = run.error_message = None
            if node:
                node.status, node.attempt, node.started_at = "running", node.attempt + 1, now()
                node.finished_at = node.error_code = node.error_message = None
            else:
                node = NodeRun(execution_id=run.id, step=step)
                session.add(node)
            session.flush()
            attempt = node.attempt
            snapshot = {"payload": dict(event.payload), "extraction": dict(event.extraction or {}),
                        "classification": dict(event.classification or {}), "is_test": event.is_test}
            audit(session, "step_started", f"Node {step} started.", event_id=event.id, execution_id=run.id,
                  details={"step": step, "attempt": attempt})
        try:
            result = None
            if step == "extract":
                result = LLMClient(cfg).extract(snapshot["payload"], attempt=attempt).model_dump(mode="json")
            elif step == "classify":
                result = classify(Extraction.model_validate(snapshot["extraction"]))
            elif step == "crm":
                fault = snapshot["payload"].get("fault")
                if fault == "crm_failure_always" or (fault == "crm_failure_once" and attempt == 1):
                    raise FlowError("CRM_TEMPORARY_FAILURE", "Test fault: simulated CRM service failure before any mutation.", status=503, retryable=True)
            elif step == "draft":
                result = LLMClient(cfg).draft(snapshot["extraction"], snapshot["classification"], is_test=snapshot["is_test"]).model_dump(mode="json")
            elif step == "deliver":
                result = self._perform_delivery(run_id, owner, dispatch_token, cfg)
            with self.db.session() as session, session.begin():
                run = self.execution_locked(session, run_id)
                event = self.event_locked(session, run.event_id)
                self._context_check(run, event, phase, dispatch_token, n8n_execution_id)
                if run.step_owner != owner:
                    raise FlowError("STEP_LEASE_LOST", "The node lost its lease; its result cannot be committed.", status=409)
                node = session.scalar(select(NodeRun).where(NodeRun.execution_id == run_id, NodeRun.step == step))
                output = {}
                if step == "extract":
                    event.extraction = result
                    output = {"provider": cfg.llm_provider, "model": cfg.llm_model, "validated": True,
                              "confidence": result["confidence"], "fixture": cfg.llm_provider == "fixture"}
                elif step == "classify":
                    event.classification = result
                    output = result
                    if result["needs_review"]:
                        self.set_state(run, event, "needs_review")
                        run.error_code, run.error_message = "REVIEW_REQUIRED", "Human correction is required before CRM mutation."
                elif step == "crm":
                    output = BuiltinCRMAdapter().upsert(session, event, event.extraction, event.classification)
                    event.crm_changes = output
                elif step == "draft":
                    approval = session.scalar(select(Approval).where(Approval.execution_id == run_id))
                    if not approval:
                        approval = Approval(event_id=event.id, execution_id=run.id, status="draft",
                                            to_email=event.extraction["email"], subject=result["subject"],
                                            body=result["body"], recommendation=result["recommendation"])
                        session.add(approval)
                        session.flush()
                    output = {"approval_id": approval.id, "provider": cfg.llm_provider, "requires_human": True}
                elif step == "await_approval":
                    approval = session.scalar(select(Approval).where(Approval.execution_id == run.id))
                    if approval.status == "draft":
                        approval.status = "pending"
                    self.set_state(run, event, "waiting_approval")
                    output = {"approval_id": approval.id, "approval_status": approval.status}
                elif step == "deliver":
                    output = result
                elif step == "finish":
                    if run.phase == "pipeline" and (event.classification or {}).get("needs_review"):
                        self.set_state(run, event, "needs_review")
                        output = {"outcome": "human_review_required"}
                    else:
                        self.set_state(run, event, "succeeded")
                        run.completed_at = now()
                        output = {"outcome": "delivered" if phase == "delivery" else "unrelated_archived"}
                node.status, node.finished_at = "succeeded", now()
                node.duration_ms = int((now() - utc(node.started_at)).total_seconds() * 1000)
                node.output, node.error_code, node.error_message = output, None, None
                run.step_owner = run.step_lease_until = None
                run.retryable = False
                if run.status in TERMINAL:
                    run.lease_until = None
                else:
                    run.lease_until = now() + timedelta(seconds=cfg.lease_seconds)
                audit(session, "step_succeeded", f"Node {step} completed and its result was committed.",
                      event_id=event.id, execution_id=run.id, details={"step": step, "attempt": node.attempt})
                return self._stage_response(run, event)
        except IntegrityError:
            error = FlowError("CRM_CONCURRENT_UPDATE", "Concurrent CRM identity update detected; retry will use the committed record.", status=503, retryable=True)
            self._fail_step(run_id, step, owner, dispatch_token, error)
            raise error from None
        except FlowError as error:
            self._fail_step(run_id, step, owner, dispatch_token, error)
            raise
        except Exception as exc:
            import logging
            import traceback
            from pathlib import Path
            locations = [f"{Path(frame.filename).name}:{frame.lineno}:{frame.name}" for frame in traceback.extract_tb(exc.__traceback__)[-6:]]
            logging.error("Workflow failure execution=%s step=%s type=%s locations=%s", run_id, step, type(exc).__name__, locations)
            error = FlowError("INTERNAL_STEP_ERROR", "A workflow step failed unexpectedly. Inspect server diagnostics using this execution ID.", status=500)
            self._fail_step(run_id, step, owner, dispatch_token, error)
            raise error from None

    def _fail_step(self, run_id, step, owner, token, error: FlowError):
        with self.db.session() as session, session.begin():
            run = self.execution_locked(session, run_id)
            if run.dispatch_token != token or run.step_owner != owner:
                return
            event = self.event_locked(session, run.event_id)
            node = session.scalar(select(NodeRun).where(NodeRun.execution_id == run_id, NodeRun.step == step))
            node.status, node.error_code, node.error_message = "failed", error.code, error.message
            node.finished_at = now()
            node.duration_ms = int((now() - utc(node.started_at)).total_seconds() * 1000)
            run.error_code, run.error_message, run.retryable = error.code, error.message, error.retryable
            run.step_owner = run.step_lease_until = None
            run.next_run_at = now() + timedelta(seconds=self.settings.retry_delay_seconds * min(2 ** (run.attempt - 1), 8))
            run.lease_until = now() + timedelta(seconds=20) if run.engine == "n8n" else None
            if isinstance(error, NeedsReview):
                self.set_state(run, event, "needs_review")
                data = dict(event.classification or {})
                data["needs_review"] = True
                data["review_reasons"] = list(data.get("review_reasons", [])) + [error.message]
                event.classification = data
                run.lease_until = None
            else:
                self.set_state(run, event, "failed")
            audit(session, "step_failed", error.message, event_id=event.id, execution_id=run.id,
                  details={"step": step, "error_code": error.code, "retryable": error.retryable, "attempt": node.attempt})

    def record_failure(self, run_id, phase, dispatch_token, n8n_execution_id, **ignored):
        with self.db.session() as session, session.begin():
            run = self.execution_locked(session, run_id)
            event = self.event_locked(session, run.event_id)
            self._context_check(run, event, phase, dispatch_token, n8n_execution_id)
            if run.status in TERMINAL:
                return self._stage_response(run, event, proceed=False)
            if run.status != "failed":
                run.error_code = "N8N_NODE_FAILED"
                run.error_message = "n8n reported a node failure; inspect the linked native execution. External error payloads are not copied into business logs."
                run.retryable = True
                self.set_state(run, event, "failed")
            run.n8n_status = "error_reported"
            run.lease_until = None
            run.step_owner = run.step_lease_until = None
            run.next_run_at = now() + timedelta(seconds=self.settings.retry_delay_seconds)
            audit(session, "engine_failure", "n8n reported a workflow failure.", event_id=event.id, execution_id=run.id,
                  details={"native_execution_id": n8n_execution_id, "error_code": run.error_code})
            return self._stage_response(run, event, proceed=False)

    def correct_event(self, event_id: str, fields: dict, reason: str):
        allowed = set(Extraction.model_fields)
        if not fields or set(fields) - allowed:
            raise FlowError("CORRECTION_FIELDS_INVALID", "Corrections may only update extraction fields.")
        with self.db.session() as session, session.begin():
            candidate = session.get(Event, event_id)
            if not candidate:
                raise FlowError("EVENT_NOT_FOUND", "Event does not exist.", status=404)
            old = self.execution_locked(session, candidate.current_execution_id)
            event = self.event_locked(session, event_id)
            if event.current_execution_id != old.id or event.revision != old.revision:
                raise FlowError("STALE_EXECUTION", "The event revision changed. Reload before correcting.", status=409)
            if event.status not in {"needs_review", "waiting_approval", "failed"}:
                raise FlowError("CORRECTION_NOT_ALLOWED", "Corrections require a paused or failed execution, before approval.", status=409)
            approval = session.scalar(select(Approval).where(Approval.execution_id == old.id).with_for_update())
            if approval and approval.status not in {"draft", "pending", "invalidated"}:
                raise FlowError("APPROVED_ACTION_IMMUTABLE", "An approved or completed action cannot be rewritten. Create a new event.", status=409)
            if old.step_owner and old.step_lease_until and utc(old.step_lease_until) > now():
                raise FlowError("STEP_BUSY", "A node is still running; wait for its lease to finish before correcting data.", status=409)
            base = dict(event.extraction or {})
            if not base:
                payload = event.payload
                base = {k: payload.get(k) for k in ["name", "company", "email", "phone", "budget", "currency"]}
                base.update({"requirement": payload.get("requirement") or payload["message"], "intent": "unknown", "confidence": 0.5})
            base.update(fields)
            validated = Extraction.model_validate(base).model_dump(mode="json")
            if approval:
                invalidated = session.execute(update(Approval).where(
                    Approval.id == approval.id, Approval.status.in_(["draft", "pending", "invalidated"]),
                    Approval.version == approval.version
                ).values(status="invalidated", version=approval.version + 1))
                if invalidated.rowcount != 1:
                    raise FlowError("APPROVAL_VERSION_CONFLICT", "Another operator approved or edited this draft. Reload before correcting.", status=409)
            superseded = session.execute(update(Execution).where(
                Execution.id == old.id, Execution.phase == "pipeline",
                Execution.status.in_(["needs_review", "waiting_approval", "failed"]),
                or_(Execution.step_owner.is_(None), Execution.step_lease_until < now())
            ).values(dispatch_token=None, step_owner=None, step_lease_until=None, lease_until=None, status="failed", retryable=False,
                     error_code="SUPERSEDED_BY_CORRECTION", error_message="An operator created a corrected revision. This execution cannot resume."))
            if superseded.rowcount != 1:
                raise FlowError("CORRECTION_CONFLICT", "Execution resumed or was approved while this correction was being reviewed.", status=409)
            event.revision += 1
            event.extraction, event.classification = validated, None
            event.status = "queued"
            run = Execution(event_id=event.id, engine=self.settings.engine, revision=event.revision)
            session.add(run)
            session.flush()
            event.current_execution_id = run.id
            session.add(NodeRun(execution_id=run.id, step="extract", status="succeeded", started_at=now(), finished_at=now(),
                                duration_ms=0, output={"provider": "human", "manual_override": True, "validated": True, "confidence": validated["confidence"]}))
            audit(session, "extraction_corrected", "Operator corrected extracted fields; policy and downstream actions will run again.",
                  event_id=event.id, execution_id=run.id, actor="admin", details={"fields": sorted(fields), "reason": reason, "revision": event.revision})
        return self.event_detail(event_id)

    def retry_execution(self, run_id: str, *, automatic=False):
        with self.db.session() as session, session.begin():
            run = self.execution_locked(session, run_id)
            event = self.event_locked(session, run.event_id)
            if event.current_execution_id != run.id:
                raise FlowError("STALE_EXECUTION", "Only the current event revision can be retried.", status=409)
            if run.status in {"queued", "retrying", "running"}:
                return {"execution": self._execution_summary(run, session)}
            if run.status != "failed":
                raise FlowError("RETRY_NOT_ALLOWED", "Only failed executions can retry. Review-required events need field correction.", status=409)
            if run.error_code in {"SMTP_DELIVERY_UNKNOWN", "SUPERSEDED_BY_CORRECTION"}:
                raise FlowError("RECONCILIATION_REQUIRED", "Ambiguous delivery must be reconciled before it can resume.", status=409)
            if automatic and (not run.retryable or run.attempt >= self.settings.max_run_attempts):
                return {"execution": self._execution_summary(run, session)}
            run.attempt += 1
            run.dispatch_token = run.n8n_execution_id = None
            run.n8n_status = "unknown"
            run.error_code = run.error_message = None
            run.step_owner = run.step_lease_until = run.lease_until = None
            run.next_run_at = now()
            self.set_state(run, event, "retrying" if automatic else "queued")
            audit(session, "execution_retried", "Execution queued for recovery from its persisted successful steps.",
                  event_id=event.id, execution_id=run.id, actor="worker" if automatic else "admin", details={"attempt": run.attempt})
            return {"execution": self._execution_summary(run, session)}
