from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import urlparse


def flag(value: str | None, default: bool = False) -> bool:
    return default if value is None else value.lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    database_url: str = "sqlite:///./flowpilot.db"
    admin_password: str = ""
    session_secret: str = ""
    webhook_key: str = ""
    internal_key: str = ""
    encryption_key: str = ""
    public_base_url: str = "http://localhost:3000"
    public_form_enabled: bool = True
    company_name: str = "星舟数智 · Starbridge Automation"
    engine: str = "n8n"
    test_mode: bool = False
    allow_faults: bool = False
    llm_provider: str = "ollama"
    llm_base_url: str = "http://ollama:11434"
    llm_model: str = "qwen2.5:1.5b"
    llm_api_key: str = ""
    llm_timeout_seconds: int = 60
    llm_max_retries: int = 2
    ollama_num_thread: int = 4
    ollama_num_ctx: int = 16384
    n8n_base_url: str = "http://n8n:5678"
    n8n_webhook_url: str = "http://n8n:5678/webhook/flowpilot"
    n8n_api_key: str = ""
    smtp_enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_starttls: bool = True
    max_run_attempts: int = 3
    lease_seconds: int = 240
    retry_delay_seconds: int = 5
    worker_poll_seconds: float = 1.0
    session_ttl_seconds: int = 12 * 60 * 60
    demo_data_path: str = "../data/leads.json"

    @classmethod
    def from_env(cls) -> "Settings":
        mapping = {
            "database_url": "DATABASE_URL", "admin_password": "FLOWPILOT_ADMIN_PASSWORD",
            "session_secret": "FLOWPILOT_SESSION_SECRET", "webhook_key": "FLOWPILOT_WEBHOOK_KEY",
            "internal_key": "FLOWPILOT_INTERNAL_KEY", "encryption_key": "FLOWPILOT_ENCRYPTION_KEY",
            "public_base_url": "PUBLIC_BASE_URL", "company_name": "COMPANY_NAME",
            "public_form_enabled": "PUBLIC_FORM_ENABLED",
            "engine": "WORKFLOW_ENGINE", "test_mode": "FLOWPILOT_TEST_MODE",
            "allow_faults": "FLOWPILOT_ALLOW_FAULTS", "llm_provider": "LLM_PROVIDER",
            "llm_base_url": "LLM_BASE_URL", "llm_model": "LLM_MODEL", "llm_api_key": "LLM_API_KEY",
            "llm_timeout_seconds": "LLM_TIMEOUT_SECONDS", "llm_max_retries": "LLM_MAX_RETRIES",
            "ollama_num_thread": "OLLAMA_NUM_THREAD", "ollama_num_ctx": "OLLAMA_NUM_CTX",
            "n8n_base_url": "N8N_BASE_URL", "n8n_webhook_url": "N8N_WEBHOOK_URL",
            "n8n_api_key": "N8N_API_KEY", "smtp_enabled": "SMTP_ENABLED", "smtp_host": "SMTP_HOST",
            "smtp_port": "SMTP_PORT", "smtp_username": "SMTP_USERNAME", "smtp_password": "SMTP_PASSWORD",
            "smtp_from": "SMTP_FROM", "smtp_starttls": "SMTP_STARTTLS", "max_run_attempts": "MAX_RUN_ATTEMPTS",
            "lease_seconds": "WORKER_LEASE_SECONDS", "retry_delay_seconds": "RETRY_DELAY_SECONDS",
            "worker_poll_seconds": "WORKER_POLL_SECONDS", "demo_data_path": "DEMO_DATA_PATH",
        }
        obj = cls()
        for field, env in mapping.items():
            value = os.getenv(env)
            if value is not None:
                old = getattr(obj, field)
                parsed = flag(value) if isinstance(old, bool) else type(old)(value)
                setattr(obj, field, parsed)
        return obj

    def validate(self) -> None:
        if self.test_mode:
            # These fixed values are only available behind an explicit test-mode switch.
            self.admin_password = self.admin_password or "FlowPilot-test-only-2026"
            self.session_secret = self.session_secret or "test-session-secret-not-for-production-2026"
            self.webhook_key = self.webhook_key or "test-webhook-key-not-for-production"
            self.internal_key = self.internal_key or "test-internal-key-not-for-production"
            self.encryption_key = self.encryption_key or "dGVzdC1mbG93cGlsb3QtZW5jcnlwdGlvbi1rZXktMDE="
        missing = []
        for name, length in [("admin_password", 12), ("session_secret", 32), ("webhook_key", 24), ("internal_key", 24)]:
            if len(getattr(self, name)) < length:
                missing.append(name)
        if missing:
            raise RuntimeError("Configure strong FlowPilot secrets before startup: " + ", ".join(missing))
        if not self.encryption_key:
            raise RuntimeError("FLOWPILOT_ENCRYPTION_KEY is required to encrypt stored integration credentials.")
        from cryptography.fernet import Fernet
        try:
            Fernet(self.encryption_key.encode())
        except (ValueError, TypeError) as exc:
            raise RuntimeError("FLOWPILOT_ENCRYPTION_KEY must be a Fernet key.") from exc
        if self.engine not in {"n8n", "local"}:
            raise RuntimeError("WORKFLOW_ENGINE must be n8n or local.")
        if self.llm_provider not in {"ollama", "openai_compatible", "fixture"}:
            raise RuntimeError("Unsupported LLM_PROVIDER.")
        if self.llm_provider == "fixture" and not self.test_mode:
            raise RuntimeError("Fixture model is allowed only with FLOWPILOT_TEST_MODE=true.")
        if self.allow_faults and not self.test_mode:
            raise RuntimeError("Fault injection requires FLOWPILOT_TEST_MODE=true.")
        if not 1 <= self.ollama_num_thread <= 64 or not 4096 <= self.ollama_num_ctx <= 131072:
            raise RuntimeError("OLLAMA_NUM_THREAD must be 1–64 and OLLAMA_NUM_CTX must be 4096–131072.")
        if self.lease_seconds < self.llm_timeout_seconds * (self.llm_max_retries + 1) + 15:
            self.lease_seconds = self.llm_timeout_seconds * (self.llm_max_retries + 1) + 30
        for url in [self.public_base_url, self.llm_base_url, self.n8n_webhook_url]:
            parsed = urlparse(url)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
                raise RuntimeError("Service URLs must be HTTP(S) URLs without embedded credentials, query strings or fragments.")
