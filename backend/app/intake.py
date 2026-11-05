from __future__ import annotations

import hashlib
import json
import unicodedata

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from .crm import normalize_email, normalize_phone
from .db import Event, Execution, IntakeKey
from .errors import FlowError
from .schemas import EventInput
from .service_base import audit


def canonical(payload: dict) -> dict:
    result = {}
    for key, value in payload.items():
        if key == "source":
            continue
        if isinstance(value, str):
            value = " ".join(unicodedata.normalize("NFKC", value).split())
        result[key] = value
    result["email"] = normalize_email(result.get("email"))
    result["phone"] = normalize_phone(result.get("phone"))
    for key in ["name", "company"]:
        if result.get(key):
            result[key] = result[key].casefold()
    return result


class IntakeMixin:
    @staticmethod
    def _register_key(session, key, fingerprint, event_id):
        # A distinct client key can refer to an already-deduplicated event. Use
        # database conflict handling so concurrent aliases also remain idempotent.
        if session.get_bind().dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import insert
        else:
            from sqlalchemy.dialects.sqlite import insert
        session.execute(insert(IntakeKey).values(key=key, fingerprint=fingerprint, event_id=event_id)
                        .on_conflict_do_nothing(index_elements=["key"]))
        actual = session.get(IntakeKey, key)
        if actual.fingerprint != fingerprint:
            raise FlowError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used with different input.", status=409)

    def ingest(self, payload: dict | EventInput, idempotency_key: str | None = None, *, source: str | None = None) -> dict:
        parsed = payload if isinstance(payload, EventInput) else EventInput.model_validate(payload)
        data = parsed.model_dump(mode="json")
        if source:
            data["source"] = source
        if data.get("fault") and (not data["is_test"] or not self.settings.allow_faults):
            raise FlowError("FAULT_INJECTION_DISABLED", "Fault injection requires an explicitly marked test event and enabled test-fault configuration.", status=403)
        cfg = self.effective_settings()
        if cfg.llm_provider == "fixture" and not data["is_test"]:
            raise FlowError("FIXTURE_NOT_ALLOWED", "Fixture inference cannot accept real customer events. Configure a real model or mark this as a test.", status=409)
        fingerprint = hashlib.sha256(json.dumps(canonical(data), sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
        if idempotency_key and (len(idempotency_key) > 150 or not idempotency_key.strip()):
            raise FlowError("IDEMPOTENCY_KEY_INVALID", "Idempotency-Key must contain 1 to 150 characters.")
        key = ("test:" if data["is_test"] else "live:") + (idempotency_key.strip() if idempotency_key else "auto:" + fingerprint)
        duplicate = False
        try:
            with self.db.session() as session, session.begin():
                registered = session.get(IntakeKey, key)
                if registered:
                    if registered.fingerprint != fingerprint:
                        raise FlowError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used with different input.", status=409)
                    event_id = registered.event_id
                    duplicate = True
                else:
                    event = session.scalar(select(Event).where(Event.fingerprint == fingerprint))
                    if event:
                        event_id = event.id
                        duplicate = True
                    else:
                        event = Event(fingerprint=fingerprint, idempotency_key=key, source=data["source"],
                                      is_test=data["is_test"], payload=data)
                        session.add(event)
                        session.flush()
                        run = Execution(event_id=event.id, engine=cfg.engine)
                        session.add(run)
                        session.flush()
                        event.current_execution_id = run.id
                        event_id = event.id
                        audit(session, "event_received", "Validated input persisted and queued for workflow execution.",
                              event_id=event.id, execution_id=run.id,
                              details={"source": data["source"], "is_test": data["is_test"], "engine": cfg.engine})
                    self._register_key(session, key, fingerprint, event_id)
                if duplicate:
                    audit(session, "duplicate_input", "Duplicate input recognized; the existing event was returned without repeating side effects.", event_id=event_id)
        except IntegrityError:
            # Parallel identical requests race on a database unique constraint. Return
            # the committed winner; no in-memory lock is relied on for idempotency.
            with self.db.session() as session, session.begin():
                registered = session.get(IntakeKey, key)
                if registered and registered.fingerprint != fingerprint:
                    raise FlowError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used with different input.", status=409) from None
                event = session.scalar(select(Event).where(Event.fingerprint == fingerprint))
                if not event:
                    raise FlowError("INTAKE_CONFLICT", "Concurrent intake changed this record. Retry using the same idempotency key.", status=409, retryable=True) from None
                event_id, duplicate = event.id, True
                if not registered:
                    self._register_key(session, key, fingerprint, event_id)
        detail = self.event_detail(event_id)
        return {"event": self.event_summary_from_detail(detail), "execution": detail["current_execution"], "duplicate": duplicate}

    def batch_ingest(self, rows: list[dict], *, source: str, batch_key: str | None = None) -> dict:
        accepted = duplicates = rejected = 0
        results = []
        for index, row in enumerate(rows, start=1):
            try:
                result = self.ingest(row, f"{batch_key}:{index}" if batch_key else None, source=source)
                if result["duplicate"]:
                    duplicates += 1
                else:
                    accepted += 1
                results.append({"row": index, "ok": True, "event_id": result["event"]["id"], "duplicate": result["duplicate"]})
            except ValidationError as exc:
                rejected += 1
                errors = [{"field": ".".join(str(x) for x in e["loc"]), "message": e["msg"]} for e in exc.errors(include_input=False)]
                results.append({"row": index, "ok": False, "error_code": "INVALID_INPUT", "errors": errors})
            except FlowError as exc:
                rejected += 1
                results.append({"row": index, "ok": False, "error_code": exc.code, "message": exc.message})
        return {"accepted": accepted, "duplicates": duplicates, "rejected": rejected, "results": results}
