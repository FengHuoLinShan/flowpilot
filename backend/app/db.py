from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool


def now() -> datetime:
    return datetime.now(timezone.utc)


def utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def uid() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class Event(Base):
    __tablename__ = "events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    source: Mapped[str] = mapped_column(String(20))
    is_test: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    extraction: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    classification: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    crm_changes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="queued", index=True)
    current_execution_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Execution(Base):
    __tablename__ = "executions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="queued", index=True)
    phase: Mapped[str] = mapped_column(String(20), default="pipeline")
    engine: Mapped[str] = mapped_column(String(20), default="n8n")
    revision: Mapped[int] = mapped_column(Integer, default=1)
    current_node: Mapped[str | None] = mapped_column(String(40), nullable=True)
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    retryable: Mapped[bool] = mapped_column(Boolean, default=False)
    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    dispatch_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    step_owner: Mapped[str | None] = mapped_column(String(64), nullable=True)
    step_lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    n8n_execution_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    n8n_status: Mapped[str] = mapped_column(String(30), default="unknown")
    n8n_runs: Mapped[list] = mapped_column(JSON, default=list)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class IntakeKey(Base):
    __tablename__ = "intake_keys"
    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64))
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class NodeRun(Base):
    __tablename__ = "node_runs"
    __table_args__ = (UniqueConstraint("execution_id", "step", name="uq_execution_step"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), index=True)
    step: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(30), default="running")
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


class Company(Base):
    __tablename__ = "companies"
    __table_args__ = (UniqueConstraint("normalized_name", "is_test", name="uq_company_scope"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200))
    normalized_name: Mapped[str] = mapped_column(String(200), index=True)
    is_test: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (UniqueConstraint("email", "is_test", name="uq_contact_email_scope"),
                     UniqueConstraint("phone", "is_test", name="uq_contact_phone_scope"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(320), nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    is_test: Mapped[bool] = mapped_column(Boolean, default=False)
    company_id: Mapped[str | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Lead(Base):
    __tablename__ = "leads"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), unique=True)
    contact_id: Mapped[str | None] = mapped_column(ForeignKey("contacts.id"), nullable=True)
    company_id: Mapped[str | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    requirement: Mapped[str] = mapped_column(Text)
    budget: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="CNY")
    priority: Mapped[str] = mapped_column(String(20))
    category: Mapped[str] = mapped_column(String(30))
    tags: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(30), default="new")
    owner: Mapped[str] = mapped_column(String(100), default="未分配 / Unassigned")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), unique=True)
    lead_id: Mapped[str] = mapped_column(ForeignKey("leads.id"))
    title: Mapped[str] = mapped_column(String(300))
    owner: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="open")
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Approval(Base):
    __tablename__ = "approvals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), unique=True)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    to_email: Mapped[str] = mapped_column(String(320))
    subject: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    recommendation: Mapped[str] = mapped_column(Text)
    delivery_mode: Mapped[str] = mapped_column(String(10), default="test")
    external_authorized: Mapped[bool] = mapped_column(Boolean, default=False)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Outbox(Base):
    __tablename__ = "outbox"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), index=True)
    approval_id: Mapped[str] = mapped_column(ForeignKey("approvals.id"), unique=True)
    to_email: Mapped[str] = mapped_column(String(320))
    subject: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    mode: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(30), default="pending")
    message_id: Mapped[str] = mapped_column(String(200), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


class Audit(Base):
    __tablename__ = "audit_log"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    event_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    execution_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(100))
    actor: Mapped[str] = mapped_column(String(100), default="system")
    message: Mapped[str] = mapped_column(Text)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Database:
    def __init__(self, url: str):
        kwargs = {"pool_pre_ping": True}
        if url.startswith("sqlite"):
            kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
            if url.endswith(":memory:") or url == "sqlite://":
                kwargs["poolclass"] = StaticPool
        self.engine = create_engine(url, **kwargs)
        if url.startswith("sqlite"):
            @event.listens_for(self.engine, "connect")
            def configure_sqlite(connection, record):
                connection.execute("PRAGMA foreign_keys=ON")
                connection.execute("PRAGMA busy_timeout=30000")
        self.session = sessionmaker(self.engine, expire_on_commit=False)

    def initialize(self) -> None:
        Base.metadata.create_all(self.engine)

    def close(self) -> None:
        self.engine.dispose()
