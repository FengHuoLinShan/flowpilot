from __future__ import annotations

import dataclasses
import ipaddress
from datetime import datetime
from urllib.parse import urlparse

from cryptography.fernet import Fernet, InvalidToken
from pydantic import TypeAdapter, EmailStr
from sqlalchemy import select

from .config import Settings
from .db import Audit, Database, Event, Execution, Setting, now
from .errors import FlowError


def iso(value):
    if isinstance(value, datetime):
        from .db import utc
        return utc(value).isoformat()
    if isinstance(value, dict):
        return {k: iso(v) for k, v in value.items()}
    if isinstance(value, list):
        return [iso(v) for v in value]
    return value


def columns(obj, *, exclude: set[str] | None = None) -> dict:
    omit = exclude or set()
    return {c.key: iso(getattr(obj, c.key)) for c in obj.__table__.columns if c.key not in omit}


def audit(session, action: str, message: str, *, event_id: str | None = None,
          execution_id: str | None = None, actor: str = "system", details: dict | None = None):
    session.add(Audit(action=action, message=message, event_id=event_id, execution_id=execution_id,
                      actor=actor, details=details or {}))


class ServiceBase:
    def __init__(self, settings: Settings):
        settings.validate()
        self.settings = settings
        self.db = Database(settings.database_url)
        self.db.initialize()
        self._fernet = Fernet(settings.encryption_key.encode())

    def effective_settings(self, session=None) -> Settings:
        own = session is None
        session = session or self.db.session()
        try:
            cfg = dataclasses.replace(self.settings)
            for row in session.scalars(select(Setting)):
                if not hasattr(cfg, row.key):
                    continue
                data = row.value
                if data.get("encrypted"):
                    try:
                        value = self._fernet.decrypt(data["ciphertext"].encode()).decode()
                    except InvalidToken:
                        raise FlowError("SECRET_DECRYPTION_FAILED", "Integration credentials cannot be decrypted; restore the original encryption key.", status=503) from None
                else:
                    value = data.get("value")
                setattr(cfg, row.key, value)
            return cfg
        finally:
            if own:
                session.close()

    def public_settings(self) -> dict:
        cfg = self.effective_settings()
        return {"company_name": cfg.company_name, "engine": cfg.engine,
                "llm_provider": cfg.llm_provider, "llm_base_url": cfg.llm_base_url, "llm_model": cfg.llm_model,
                "llm_api_key_configured": bool(cfg.llm_api_key), "llm_timeout_seconds": cfg.llm_timeout_seconds,
                "llm_max_retries": cfg.llm_max_retries, "webhook_key_configured": bool(cfg.webhook_key),
                "webhook_url": cfg.public_base_url.rstrip("/") + "/api/webhooks/leads", "crm_adapter": "builtin",
                "external_crm_configured": False, "smtp_enabled": cfg.smtp_enabled, "smtp_host": cfg.smtp_host,
                "smtp_port": cfg.smtp_port, "smtp_username": cfg.smtp_username,
                "smtp_password_configured": bool(cfg.smtp_password), "smtp_from": cfg.smtp_from,
                "smtp_starttls": cfg.smtp_starttls, "public_base_url": cfg.public_base_url,
                "n8n_base_url": cfg.n8n_base_url, "n8n_workflow_url": cfg.n8n_base_url.rstrip("/") + "/workflows",
                "n8n_api_key_configured": bool(cfg.n8n_api_key), "test_mode": cfg.test_mode,
                "fault_injection_enabled": cfg.allow_faults,
                "model_configured": bool(cfg.llm_model and cfg.llm_base_url and (cfg.llm_provider != "openai_compatible" or cfg.llm_api_key))}

    def update_settings(self, values: dict) -> dict:
        cfg = self.effective_settings()
        updates = {k: v for k, v in values.items() if v is not None}
        for key, value in updates.items():
            setattr(cfg, key, value)
        if cfg.llm_provider == "fixture" and not cfg.test_mode:
            raise FlowError("FIXTURE_NOT_ALLOWED", "Fixture inference is available only in explicit test mode.")
        parsed = urlparse(cfg.llm_base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise FlowError("MODEL_URL_INVALID", "Model endpoint must be HTTP(S), without credentials, query strings or fragments.")
        if parsed.hostname in {"metadata.google.internal", "instance-data"}:
            raise FlowError("MODEL_URL_INVALID", "Cloud metadata endpoints are not allowed.")
        try:
            ip = ipaddress.ip_address(parsed.hostname)
            if ip.is_link_local or ip.is_multicast or ip.is_unspecified:
                raise FlowError("MODEL_URL_INVALID", "Link-local, multicast and unspecified destinations are not allowed.")
        except ValueError:
            pass
        if cfg.smtp_enabled:
            self.validate_smtp(cfg)
        with self.db.session() as session, session.begin():
            for key, value in updates.items():
                stored = {"encrypted": True, "ciphertext": self._fernet.encrypt(value.encode()).decode()} if key in {"llm_api_key", "smtp_password"} else {"value": value}
                row = session.get(Setting, key)
                if row:
                    row.value = stored
                else:
                    session.add(Setting(key=key, value=stored))
            audit(session, "settings_updated", "Integration settings updated; secret values are not included in audit records.",
                  actor="admin", details={"fields": sorted(updates)})
        return self.public_settings()

    @staticmethod
    def validate_smtp(cfg: Settings):
        if not cfg.smtp_enabled or not cfg.smtp_host or not cfg.smtp_from:
            raise FlowError("SMTP_NOT_CONFIGURED", "Enable SMTP and configure the server and sender before requesting external delivery.", status=409)
        try:
            TypeAdapter(EmailStr).validate_python(cfg.smtp_from)
        except Exception:
            raise FlowError("SMTP_FROM_INVALID", "SMTP sender must be a valid email address.", status=409) from None
        if not cfg.smtp_starttls and cfg.smtp_port != 465:
            raise FlowError("SMTP_TLS_REQUIRED", "External SMTP requires STARTTLS or implicit TLS on port 465.", status=409)
        if cfg.smtp_username and not cfg.smtp_password:
            raise FlowError("SMTP_PASSWORD_REQUIRED", "SMTP authentication password is missing.", status=409)

    def event_locked(self, session, event_id: str) -> Event:
        obj = session.scalar(select(Event).where(Event.id == event_id).with_for_update().execution_options(populate_existing=True))
        if obj is None:
            raise FlowError("EVENT_NOT_FOUND", "Event does not exist.", status=404)
        return obj

    def execution_locked(self, session, run_id: str) -> Execution:
        obj = session.scalar(select(Execution).where(Execution.id == run_id).with_for_update().execution_options(populate_existing=True))
        if obj is None:
            raise FlowError("EXECUTION_NOT_FOUND", "Execution does not exist.", status=404)
        return obj

    @staticmethod
    def set_state(run: Execution, event: Event, status: str):
        run.status = status
        run.updated_at = now()
        if event.current_execution_id == run.id:
            event.status = status
            event.updated_at = now()

    def close(self):
        self.db.close()
