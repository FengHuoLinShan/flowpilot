from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select

from .db import Approval, Audit, Company, Contact, Event, Execution, Lead, NodeRun, Outbox, Task, now
from .errors import FlowError
from .service_base import audit, columns, iso


class QueryMixin:
    def _event_summary(self, event: Event, session) -> dict:
        extracted = event.extraction or {}
        classification = event.classification or {}
        result = {key: value for key, value in columns(event).items() if key in {
            "id", "source", "is_test", "status", "current_execution_id", "created_at", "updated_at", "revision"}}
        for key in ["name", "company", "email"]:
            result[key] = extracted.get(key) or event.payload.get(key)
        result["priority"] = classification.get("priority")
        result["category"] = classification.get("category")
        node = session.scalar(select(NodeRun).where(NodeRun.execution_id == event.current_execution_id, NodeRun.step == "extract")) if event.current_execution_id else None
        result["model_provider"] = (node.output or {}).get("provider") if node else None
        return result

    @staticmethod
    def event_summary_from_detail(detail: dict) -> dict:
        return {k: v for k, v in detail.items() if k not in {
            "payload", "extraction", "classification", "crm_changes", "current_execution", "executions", "approvals", "outbox", "logs"}}

    def _execution_summary(self, run: Execution, session, *, include_nodes=False) -> dict:
        data = columns(run, exclude={"dispatch_token", "step_owner", "step_lease_until"})
        event = session.get(Event, run.event_id)
        data["is_test"] = event.is_test if event else False
        data["customer_name"] = ((event.extraction or {}).get("name") or event.payload.get("name")) if event else None
        data["company_name"] = ((event.extraction or {}).get("company") or event.payload.get("company")) if event else None
        if include_nodes:
            data["nodes"] = [columns(n) for n in session.scalars(select(NodeRun).where(NodeRun.execution_id == run.id).order_by(NodeRun.started_at))]
            data["logs"] = [columns(a) for a in session.scalars(select(Audit).where(Audit.execution_id == run.id).order_by(Audit.created_at).limit(500))]
        return data

    def _approval_summary(self, approval: Approval, session) -> dict:
        data = columns(approval, exclude={"external_authorized"})
        event = session.get(Event, approval.event_id)
        extraction = event.extraction or {}
        data.update({"is_test": event.is_test, "customer_name": extraction.get("name") or event.payload.get("name"),
                     "company_name": extraction.get("company") or event.payload.get("company"),
                     "priority": (event.classification or {}).get("priority")})
        return data

    def _outbox_summary(self, item: Outbox, session) -> dict:
        data = columns(item)
        event = session.get(Event, item.event_id)
        data["is_test"] = event.is_test if event else False
        return data

    def list_events(self, *, status=None, q=None, is_test=None, limit=100, offset=0) -> dict:
        with self.db.session() as session:
            query = select(Event)
            if status:
                query = query.where(Event.status == status)
            if is_test is not None:
                query = query.where(Event.is_test == is_test)
            if q:
                pattern = f"%{q}%"
                query = query.where(or_(Event.id.ilike(pattern),
                                        *[Event.payload[field].as_string().ilike(pattern) for field in ["name", "company", "email", "message", "requirement"]],
                                        *[Event.extraction[field].as_string().ilike(pattern) for field in ["name", "company", "email", "requirement"]]))
            total = session.scalar(select(func.count()).select_from(query.subquery()))
            items = [self._event_summary(item, session) for item in session.scalars(query.order_by(Event.created_at.desc()).offset(offset).limit(limit))]
            return {"items": items, "total": total}

    def event_detail(self, event_id: str) -> dict:
        with self.db.session() as session:
            event = session.get(Event, event_id)
            if not event:
                raise FlowError("EVENT_NOT_FOUND", "Event does not exist.", status=404)
            result = self._event_summary(event, session)
            result.update({"payload": event.payload, "extraction": event.extraction,
                           "classification": event.classification, "crm_changes": event.crm_changes})
            runs = list(session.scalars(select(Execution).where(Execution.event_id == event_id).order_by(Execution.created_at.desc())))
            result["executions"] = [self._execution_summary(r, session, include_nodes=True) for r in runs]
            result["current_execution"] = next((x for x in result["executions"] if x["id"] == event.current_execution_id), None)
            result["approvals"] = [self._approval_summary(a, session) for a in session.scalars(select(Approval).where(Approval.event_id == event_id).order_by(Approval.created_at.desc()))]
            result["outbox"] = [self._outbox_summary(o, session) for o in session.scalars(select(Outbox).where(Outbox.event_id == event_id).order_by(Outbox.created_at.desc()))]
            result["logs"] = [columns(a) for a in session.scalars(select(Audit).where(Audit.event_id == event_id).order_by(Audit.created_at).limit(500))]
            return result

    def list_executions(self, *, status=None, limit=100, offset=0) -> dict:
        with self.db.session() as session:
            query = select(Execution)
            if status:
                query = query.where(Execution.status == status)
            total = session.scalar(select(func.count()).select_from(query.subquery()))
            return {"items": [self._execution_summary(r, session) for r in session.scalars(query.order_by(Execution.updated_at.desc()).offset(offset).limit(limit))], "total": total}

    def execution_detail(self, run_id: str) -> dict:
        with self.db.session() as session:
            run = session.get(Execution, run_id)
            if not run:
                raise FlowError("EXECUTION_NOT_FOUND", "Execution does not exist.", status=404)
            data = self._execution_summary(run, session, include_nodes=True)
            data["event"] = self._event_summary(session.get(Event, run.event_id), session)
            return data

    def list_approvals(self, *, status=None, limit=100, offset=0) -> dict:
        with self.db.session() as session:
            query = select(Approval)
            if status:
                query = query.where(Approval.status == status)
            total = session.scalar(select(func.count()).select_from(query.subquery()))
            return {"items": [self._approval_summary(a, session) for a in session.scalars(query.order_by(Approval.created_at.desc()).offset(offset).limit(limit))], "total": total}

    def list_outbox(self, *, limit=100, offset=0) -> dict:
        with self.db.session() as session:
            return {"items": [self._outbox_summary(o, session) for o in session.scalars(select(Outbox).order_by(Outbox.created_at.desc()).offset(offset).limit(limit))],
                    "total": session.scalar(select(func.count()).select_from(Outbox))}

    def list_crm(self, kind: str, *, limit=100, offset=0) -> dict:
        model = {"contacts": Contact, "companies": Company, "leads": Lead, "tasks": Task}.get(kind)
        if not model:
            raise FlowError("CRM_RESOURCE_NOT_FOUND", "Unknown CRM resource.", status=404)
        with self.db.session() as session:
            items = []
            for obj in session.scalars(select(model).order_by(model.created_at.desc()).offset(offset).limit(limit)):
                data = columns(obj)
                if isinstance(obj, (Contact, Lead)):
                    company = session.get(Company, obj.company_id) if obj.company_id else None
                    data["company_name"] = company.name if company else None
                if isinstance(obj, Lead):
                    contact = session.get(Contact, obj.contact_id) if obj.contact_id else None
                    data.update({"name": contact.name if contact else None, "email": contact.email if contact else None})
                if isinstance(obj, (Lead, Task)):
                    event = session.get(Event, obj.event_id)
                    data["is_test"] = event.is_test
                items.append(data)
            return {"items": items, "total": session.scalar(select(func.count()).select_from(model))}

    def update_lead(self, lead_id: str, values: dict) -> dict:
        with self.db.session() as session, session.begin():
            lead = session.scalar(select(Lead).where(Lead.id == lead_id).with_for_update())
            if not lead:
                raise FlowError("LEAD_NOT_FOUND", "Lead does not exist.", status=404)
            updates = {k: v for k, v in values.items() if v is not None}
            for key, value in updates.items():
                setattr(lead, key, value)
            if "owner" in updates:
                task = session.scalar(select(Task).where(Task.lead_id == lead.id))
                if task and task.status == "open":
                    task.owner = updates["owner"]
            audit(session, "lead_updated", "CRM lead updated by an operator.", event_id=lead.event_id, actor="admin", details={"fields": sorted(updates)})
            session.flush()
            return columns(lead)

    def update_task(self, task_id: str, status: str) -> dict:
        with self.db.session() as session, session.begin():
            task = session.get(Task, task_id)
            if not task:
                raise FlowError("TASK_NOT_FOUND", "Task does not exist.", status=404)
            task.status = status
            audit(session, "task_updated", "Follow-up task status updated.", event_id=task.event_id, actor="admin", details={"status": status})
            return columns(task)

    def dashboard(self) -> dict:
        cfg = self.effective_settings()
        local = datetime.now(ZoneInfo("Asia/Shanghai"))
        day = local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
        with self.db.session() as session:
            count = lambda model, *conditions: session.scalar(select(func.count()).select_from(model).where(*conditions))
            statuses = dict(session.execute(select(Event.status, func.count(Event.id)).group_by(Event.status)).all())
            priorities = dict(session.execute(select(Lead.priority, func.count(Lead.id)).group_by(Lead.priority)).all())
            return {"today_received": count(Event, Event.created_at >= day),
                    "today_processed": count(Event, Event.updated_at >= day, Event.status.in_(["succeeded", "rejected"])),
                    "pending_approvals": count(Approval, Approval.status == "pending"),
                    "failed_executions": count(Event, Event.status == "failed"), "needs_review": count(Event, Event.status == "needs_review"),
                    "contacts": count(Contact), "total_leads": count(Lead), "test_messages": count(Outbox, Outbox.mode == "test"),
                    "status_counts": statuses, "priority_counts": priorities,
                    "recent_events": [self._event_summary(e, session) for e in session.scalars(select(Event).order_by(Event.created_at.desc()).limit(8))],
                    "recent_executions": [self._execution_summary(r, session) for r in session.scalars(select(Execution).order_by(Execution.updated_at.desc()).limit(8))],
                    "engine": cfg.engine, "model_provider": cfg.llm_provider,
                    "model_configured": bool(cfg.llm_model and cfg.llm_base_url and (cfg.llm_provider != "openai_compatible" or cfg.llm_api_key)),
                    "test_mode": cfg.test_mode, "service_time": now().isoformat(), "day_timezone": "Asia/Shanghai"}
