from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

Currency = Literal["CNY", "USD", "EUR", "AUD", "GBP"]
Intent = Literal["inquiry", "support", "partnership", "unrelated", "unknown"]
FAULTS = {"llm_timeout_once", "llm_rate_limit_once", "llm_invalid_json", "crm_failure_once", "crm_failure_always"}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class EventInput(StrictModel):
    name: str | None = Field(None, max_length=200)
    company: str | None = Field(None, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=50)
    message: str = Field(min_length=8, max_length=16000)
    requirement: str | None = Field(None, max_length=8000)
    budget: float | None = Field(None, ge=0, le=1_000_000_000)
    currency: Currency = "CNY"
    source: Literal["form", "csv", "api", "demo"] = "form"
    is_test: bool = False
    fault: str | None = None

    @field_validator("name", "company", "phone", "requirement", "email", "fault", mode="before")
    @classmethod
    def empty_to_none(cls, value):
        return None if value is None or (isinstance(value, str) and not value.strip()) else value

    @field_validator("phone")
    @classmethod
    def phone_format(cls, value):
        if value and (not re.fullmatch(r"[+\d(). \-]{5,50}", value) or len(re.sub(r"\D", "", value)) < 5):
            raise ValueError("Phone must contain a valid contact number.")
        return value

    @field_validator("fault")
    @classmethod
    def fault_value(cls, value):
        if value is not None and value not in FAULTS:
            raise ValueError("Unknown test fault.")
        return value


class Extraction(StrictModel):
    name: str | None = Field(None, max_length=200)
    company: str | None = Field(None, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=50)
    requirement: str = Field(min_length=1, max_length=8000)
    budget: float | None = Field(None, ge=0, le=1_000_000_000)
    currency: Currency = "CNY"
    intent: Intent = "unknown"
    timeline: str | None = Field(None, max_length=500)
    urgency: Literal["urgent", "normal", "unknown"] = Field(default="unknown", description="Use urgent only for explicit urgent/rush/asap/紧急/加急 language. A date or two-week timeline alone is not urgent. Use normal when no urgent request is stated.")
    confidence: float = Field(ge=0, le=1, description="A decimal probability from 0.0 to 1.0, e.g. 0.92. NEVER output a percentage such as 92 or 100.")
    ambiguities: list[str] = Field(default_factory=list, max_length=20, description="Only unresolved contradictions or uncertainty about required customer facts. Never restate confirmed facts. Missing optional budget/timeline belong in null fields, not here. Use [] when supplied facts are clear and consistent.")

    @field_validator("email", mode="before")
    @classmethod
    def email_empty(cls, value):
        return None if value == "" else value

    @field_validator("name", "company", "phone", "timeline", mode="before")
    @classmethod
    def text_empty(cls, value):
        return None if isinstance(value, str) and not value.strip() else value


class Draft(StrictModel):
    subject: str = Field(min_length=3, max_length=250)
    body: str = Field(min_length=20, max_length=12000)
    recommendation: str = Field(min_length=5, max_length=2000)

    @field_validator("subject")
    @classmethod
    def no_header_injection(cls, value):
        if "\n" in value or "\r" in value:
            raise ValueError("Subject must be a single line.")
        return value


class LoginInput(StrictModel):
    password: str = Field(min_length=1, max_length=500)


class CorrectionInput(StrictModel):
    fields: dict
    reason: str = Field(min_length=3, max_length=1000)


class DraftEdit(StrictModel):
    subject: str = Field(min_length=3, max_length=250)
    body: str = Field(min_length=20, max_length=12000)
    to_email: EmailStr | None = None
    expected_version: int = Field(ge=1)

    @field_validator("subject")
    @classmethod
    def no_header_injection(cls, value):
        return Draft.no_header_injection(value)


class DecisionInput(StrictModel):
    decision: Literal["approve", "reject", "save"]
    expected_version: int = Field(ge=1)
    reason: str = Field(default="", max_length=1000)
    delivery_mode: Literal["test", "smtp"] = "test"
    authorize_external_send: bool = False


class InternalInput(StrictModel):
    phase: Literal["pipeline", "delivery"] = "pipeline"
    dispatch_token: str = Field(min_length=10, max_length=100)
    n8n_execution_id: str = Field(min_length=1, max_length=100)


class FailureInput(InternalInput):
    error_code: str = Field(default="N8N_NODE_FAILED", max_length=80)
    error_message: str = Field(default="Workflow node failed. Inspect the n8n execution.", max_length=1000)


class SettingsPatch(StrictModel):
    company_name: str | None = Field(None, min_length=2, max_length=200)
    llm_provider: Literal["ollama", "openai_compatible", "fixture"] | None = None
    llm_base_url: str | None = Field(None, min_length=8, max_length=1000)
    llm_model: str | None = Field(None, min_length=1, max_length=150)
    llm_api_key: str | None = Field(None, max_length=1000)
    llm_timeout_seconds: int | None = Field(None, ge=5, le=120)
    llm_max_retries: int | None = Field(None, ge=0, le=3)
    smtp_enabled: bool | None = None
    smtp_host: str | None = Field(None, max_length=255)
    smtp_port: int | None = Field(None, ge=1, le=65535)
    smtp_username: str | None = Field(None, max_length=200)
    smtp_password: str | None = Field(None, max_length=1000)
    smtp_from: str | None = Field(None, max_length=320)
    smtp_starttls: bool | None = None


class LeadPatch(StrictModel):
    status: Literal["new", "qualified", "contacted", "won", "lost", "disqualified"] | None = None
    owner: str | None = Field(None, min_length=1, max_length=100)


class TaskPatch(StrictModel):
    status: Literal["open", "done"]
