from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage

from sqlalchemy import select, update

from .db import Approval, Event, Execution, Lead, Outbox, now
from .errors import FlowError
from .service_base import audit


class DeliveryMixin:
    def edit_approval(self, approval_id: str, values: dict) -> dict:
        with self.db.session() as session, session.begin():
            approval = session.scalar(select(Approval).where(Approval.id == approval_id).with_for_update())
            if not approval:
                raise FlowError("APPROVAL_NOT_FOUND", "Approval does not exist.", status=404)
            if approval.status != "pending":
                raise FlowError("APPROVAL_IMMUTABLE", "Only a pending draft can be edited.", status=409)
            if approval.version != values["expected_version"]:
                raise FlowError("APPROVAL_VERSION_CONFLICT", "The draft changed in another session. Reload before approving.", status=409)
            changed = {"subject": values["subject"], "body": values["body"], "updated_at": now(), "version": approval.version + 1}
            if values.get("to_email"):
                changed["to_email"] = str(values["to_email"]).casefold()
            result = session.execute(update(Approval).where(Approval.id == approval_id, Approval.status == "pending",
                                                            Approval.version == values["expected_version"]).values(**changed))
            if result.rowcount != 1:
                raise FlowError("APPROVAL_VERSION_CONFLICT", "The draft changed in another session. Reload before approving.", status=409)
            audit(session, "draft_edited", "Pending email draft edited by an operator.", event_id=approval.event_id,
                  execution_id=approval.execution_id, actor="admin", details={"version": changed["version"], "recipient_changed": "to_email" in changed})
            session.refresh(approval)
            return {"approval": self._approval_summary(approval, session)}

    def decide_approval(self, approval_id: str, values: dict) -> dict:
        decision = values["decision"]
        with self.db.session() as session, session.begin():
            approval = session.get(Approval, approval_id)
            if not approval:
                raise FlowError("APPROVAL_NOT_FOUND", "Approval does not exist.", status=404)
            run = self.execution_locked(session, approval.execution_id)
            event = self.event_locked(session, approval.event_id)
            approval = session.scalar(select(Approval).where(Approval.id == approval_id).with_for_update().execution_options(populate_existing=True))
            accepted_states = {"approve": {"approved", "sent", "test_saved"}, "reject": {"rejected"}, "save": {"saved"}}
            if approval.status in accepted_states[decision]:
                if decision == "approve" and approval.delivery_mode != values.get("delivery_mode", "test"):
                    raise FlowError("APPROVAL_DECISION_CONFLICT", "This approval already committed a different delivery mode.", status=409)
                return {"approval": self._approval_summary(approval, session), "execution": self._execution_summary(run, session), "duplicate": True}
            if approval.status != "pending" or run.status != "waiting_approval" or event.current_execution_id != run.id:
                raise FlowError("APPROVAL_DECISION_CONFLICT", "This draft is no longer awaiting approval.", status=409)
            if approval.version != values["expected_version"]:
                raise FlowError("APPROVAL_VERSION_CONFLICT", "The draft changed. Reload and inspect the current version before deciding.", status=409)
            mode = values.get("delivery_mode", "test")
            external = values.get("authorize_external_send", False)
            if decision == "approve" and mode == "smtp":
                if event.is_test:
                    raise FlowError("TEST_EXTERNAL_SEND_BLOCKED", "Test events cannot send to external email addresses.", status=403)
                if not external:
                    raise FlowError("EXTERNAL_SEND_NOT_AUTHORIZED", "Explicit authorization is required for this external email.", status=403)
                self.validate_smtp(self.effective_settings(session))
            new_status = {"approve": "approved", "reject": "rejected", "save": "saved"}[decision]
            updated = session.execute(update(Approval).where(Approval.id == approval.id, Approval.status == "pending",
                                                             Approval.version == values["expected_version"]).values(
                status=new_status, version=approval.version + 1, delivery_mode=mode,
                external_authorized=bool(decision == "approve" and mode == "smtp" and external),
                decision_reason=values.get("reason", ""), decided_at=now(), updated_at=now()))
            if updated.rowcount != 1:
                raise FlowError("APPROVAL_VERSION_CONFLICT", "Another operator already decided this draft.", status=409)
            if decision == "approve":
                run.phase = "delivery"
                run.attempt = 1
                run.dispatch_token = run.n8n_execution_id = None
                run.n8n_status = "unknown"
                run.step_owner = run.step_lease_until = run.lease_until = None
                run.next_run_at = now()
                self.set_state(run, event, "queued")
            else:
                self.set_state(run, event, "rejected" if decision == "reject" else "succeeded")
                run.completed_at = now()
                run.dispatch_token = run.lease_until = None
            audit(session, "approval_" + decision, "Human approval decision committed.", event_id=event.id,
                  execution_id=run.id, actor="admin", details={"decision": decision, "version": values["expected_version"], "delivery_mode": mode, "reason": values.get("reason", "")})
            session.refresh(approval)
            return {"approval": self._approval_summary(approval, session), "execution": self._execution_summary(run, session), "duplicate": False}

    def _perform_delivery(self, run_id: str, owner: str, token: str, cfg) -> dict:
        with self.db.session() as session, session.begin():
            run = self.execution_locked(session, run_id)
            event = self.event_locked(session, run.event_id)
            self._context_check(run, event, "delivery", token)
            if run.step_owner != owner:
                raise FlowError("STEP_LEASE_LOST", "Delivery lease changed before dispatch.", status=409)
            approval = session.scalar(select(Approval).where(Approval.execution_id == run_id).with_for_update())
            if not approval or approval.status not in {"approved", "sent", "test_saved"}:
                raise FlowError("APPROVAL_REQUIRED", "No immutable human approval exists for this action.", status=409)
            outbox = session.scalar(select(Outbox).where(Outbox.approval_id == approval.id).with_for_update())
            if outbox and outbox.status in {"sent", "test_saved"}:
                return {"outbox_id": outbox.id, "mode": outbox.mode, "status": outbox.status, "duplicate": True}
            if outbox and outbox.status in {"sending", "unknown"}:
                raise FlowError("SMTP_DELIVERY_UNKNOWN", "Delivery outcome is uncertain. Verify with the SMTP provider and use manual reconciliation; automatic resend is blocked.", status=409)
            if outbox is None:
                outbox = Outbox(event_id=event.id, approval_id=approval.id, to_email=approval.to_email,
                                subject=approval.subject, body=approval.body, mode=approval.delivery_mode,
                                message_id=f"<flowpilot-{approval.id}@flowpilot.local>")
                session.add(outbox)
                session.flush()
            if approval.delivery_mode == "test":
                outbox.status, outbox.sent_at = "test_saved", now()
                approval.status = "test_saved"
                lead = session.scalar(select(Lead).where(Lead.event_id == event.id))
                if lead and lead.status == "new":
                    lead.status = "qualified"
                audit(session, "test_outbox_saved", "Approved message saved to the internal test outbox. No external email was sent.",
                      event_id=event.id, execution_id=run.id, details={"outbox_id": outbox.id})
                return {"outbox_id": outbox.id, "mode": "test", "status": "test_saved", "external_sent": False}
            if event.is_test or not approval.external_authorized:
                raise FlowError("EXTERNAL_SEND_NOT_AUTHORIZED", "External delivery requires a live event and explicit per-message authorization.", status=403)
            self.validate_smtp(cfg)
            outbox.status, outbox.error_code, outbox.error_message = "sending", None, None
            outbox_id, approval_id, event_id = outbox.id, approval.id, event.id
            message = {"to": outbox.to_email, "subject": outbox.subject, "body": outbox.body, "id": outbox.message_id}
            audit(session, "smtp_dispatch_started", "Approved external email dispatch began. An ambiguous transport result will require reconciliation.",
                  event_id=event.id, execution_id=run.id, details={"outbox_id": outbox.id})
        send_started = False
        smtp_accepted = False
        try:
            mail = EmailMessage()
            mail["From"], mail["To"], mail["Subject"], mail["Message-ID"] = cfg.smtp_from, message["to"], message["subject"], message["id"]
            mail.set_content(message["body"])
            context = ssl.create_default_context()
            client = smtplib.SMTP_SSL(cfg.smtp_host, cfg.smtp_port, timeout=30, context=context) if cfg.smtp_port == 465 else smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=30)
            with client:
                client.ehlo()
                if cfg.smtp_starttls and cfg.smtp_port != 465:
                    client.starttls(context=context)
                    client.ehlo()
                if cfg.smtp_username:
                    client.login(cfg.smtp_username, cfg.smtp_password)
                send_started = True
                client.send_message(mail)
                smtp_accepted = True
        except Exception as exc:
            if smtp_accepted:
                # A QUIT/disconnect failure after a successful DATA response does
                # not undo the server's acceptance of the message.
                exc = None
            if exc is not None:
                self._record_smtp_failure(exc, send_started, outbox_id, event_id, run_id)
        with self.db.session() as session, session.begin():
            outbox = session.get(Outbox, outbox_id)
            outbox.status, outbox.sent_at = "sent", now()
            approval = session.get(Approval, approval_id)
            approval.status = "sent"
            lead = session.scalar(select(Lead).where(Lead.event_id == event_id))
            if lead and lead.status in {"new", "qualified"}:
                lead.status = "contacted"
            audit(session, "smtp_dispatch_accepted", "SMTP server accepted the approved message. This records SMTP acceptance, not inbox delivery.",
                  event_id=event_id, execution_id=run_id, details={"outbox_id": outbox_id})
        return {"outbox_id": outbox_id, "mode": "smtp", "status": "sent", "external_sent": True}

    def _record_smtp_failure(self, exc, send_started, outbox_id, event_id, run_id):
        definite_rejection = isinstance(exc, (smtplib.SMTPRecipientsRefused, smtplib.SMTPDataError, smtplib.SMTPSenderRefused))
        unknown = send_started and not definite_rejection
        code = "SMTP_DELIVERY_UNKNOWN" if unknown else "SMTP_SEND_FAILED"
        explanation = ("SMTP connection failed after send began; delivery may have occurred. Reconcile before any resend."
                       if unknown else "SMTP rejected or could not start delivery. Check credentials, TLS and recipient; manual retry is available.")
        with self.db.session() as session, session.begin():
            outbox = session.get(Outbox, outbox_id)
            outbox.status = "unknown" if unknown else "failed"
            outbox.error_code, outbox.error_message = code, explanation
            audit(session, "smtp_dispatch_failed", explanation, event_id=event_id, execution_id=run_id, details={"outbox_id": outbox_id, "error_code": code})
        raise FlowError(code, explanation, status=502) from None

    def reconcile_outbox(self, outbox_id: str, outcome: str, reason: str) -> dict:
        if outcome not in {"confirmed_sent", "confirmed_not_sent"} or len(reason.strip()) < 3:
            raise FlowError("RECONCILIATION_INVALID", "Supply a confirmed delivery outcome and an operator reason.")
        with self.db.session() as session, session.begin():
            outbox = session.get(Outbox, outbox_id)
            if not outbox:
                raise FlowError("OUTBOX_NOT_FOUND", "Outbox item does not exist.", status=404)
            approval = session.get(Approval, outbox.approval_id)
            run = self.execution_locked(session, approval.execution_id)
            event = self.event_locked(session, approval.event_id)
            outbox = session.scalar(select(Outbox).where(Outbox.id == outbox_id).with_for_update().execution_options(populate_existing=True))
            approval = session.scalar(select(Approval).where(Approval.id == approval.id).with_for_update().execution_options(populate_existing=True))
            if outbox.status not in {"unknown", "sending"}:
                raise FlowError("RECONCILIATION_NOT_REQUIRED", "This delivery does not have an ambiguous outcome.", status=409)
            if run.step_owner:
                raise FlowError("DELIVERY_IN_PROGRESS", "Wait for the active delivery lease to end before reconciling.", status=409)
            if outcome == "confirmed_sent":
                outbox.status, outbox.sent_at, approval.status = "sent", now(), "sent"
                lead = session.scalar(select(Lead).where(Lead.event_id == event.id))
                if lead and lead.status in {"new", "qualified"}:
                    lead.status = "contacted"
            else:
                outbox.status, approval.status = "pending", "approved"
            outbox.error_code = outbox.error_message = None
            run.error_code = run.error_message = None
            run.retryable = False
            run.dispatch_token = run.n8n_execution_id = run.lease_until = None
            run.n8n_status = "unknown"
            run.next_run_at = now()
            self.set_state(run, event, "queued")
            audit(session, "smtp_reconciled", "Operator recorded a delivery outcome verified outside FlowPilot.",
                  event_id=event.id, execution_id=run.id, actor="admin", details={"outcome": outcome, "reason": reason, "outbox_id": outbox.id})
            return {"outbox": self._outbox_summary(outbox, session), "execution": self._execution_summary(run, session)}
