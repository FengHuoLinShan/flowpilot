from __future__ import annotations

import csv
import hmac
import io
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, File, Form, Header, Query, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import Field, ValidationError
from sqlalchemy import text

from .config import Settings
from .errors import FlowError
from .llm import LLMClient
from .schemas import (CorrectionInput, DecisionInput, DraftEdit, EventInput, Extraction,
                      FailureInput, InternalInput, LeadPatch, LoginInput, SettingsPatch, StrictModel, TaskPatch)
from .security import (COOKIE, RateLimiter, origin_check, read_session, require_admin,
                       require_internal, require_webhook, sign_session)
from .service_base import audit
from .services import Services


class DemoInput(StrictModel):
    batch_key: str | None = Field(None, max_length=100)


class ResolveInput(StrictModel):
    outcome: Literal["confirmed_sent", "confirmed_not_sent"]
    reason: str = Field(min_length=3, max_length=1000)


class PublicLeadInput(StrictModel):
    name: str | None = None
    company: str | None = None
    email: str | None = None
    phone: str | None = None
    message: str
    requirement: str | None = None
    budget: float | None = None
    currency: str = "CNY"
    website: str = Field(default="", max_length=200)


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = cfg
        app.state.services = Services(cfg)
        app.state.rate_limiter = RateLimiter()
        yield
        app.state.services.close()

    app = FastAPI(title="FlowPilot Business Automation API", version="1.0.0", lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware("http")
    async def boundaries(request: Request, call_next):
        if request.method in {"POST", "PATCH", "PUT"}:
            length = request.headers.get("content-length", "0")
            if not length.isdigit() or int(length) > 2_000_000:
                return JSONResponse({"detail": "Request body is too large.", "error_code": "BODY_TOO_LARGE"}, status_code=413)
            chunks = []
            consumed = 0
            async for chunk in request.stream():
                consumed += len(chunk)
                if consumed > 2_000_000:
                    return JSONResponse({"detail": "Request body is too large.", "error_code": "BODY_TOO_LARGE"}, status_code=413)
                chunks.append(chunk)
            # Starlette's BaseHTTPMiddleware replays a cached body to downstream
            # routing. Enforce the bound while streaming, before joining chunks.
            request._body = b"".join(chunks)
        try:
            response = await call_next(request)
        except Exception as exc:
            # SQL/transport exceptions can embed bind parameters or credentials.
            # Catch before the ASGI server formats an unsanitized traceback.
            import logging
            import traceback
            locations = [f"{Path(frame.filename).name}:{frame.lineno}:{frame.name}" for frame in traceback.extract_tb(exc.__traceback__)[-6:]]
            logging.error("API failure type=%s locations=%s", type(exc).__name__, locations)
            response = JSONResponse({"detail": "The request could not be completed. Check service availability and retry safely using the same event key.",
                                     "error_code": "INTERNAL_ERROR", "retryable": True}, status_code=500)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(FlowError)
    async def flow_error(request, exc):
        return JSONResponse({"detail": exc.message, "message": exc.message, "error_code": exc.code, "retryable": exc.retryable}, status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # Pydantic's default error includes the rejected input. Strip it, including
        # accidental password/API-key inputs, before returning or logging errors.
        errors = [{"field": ".".join(str(x) for x in error["loc"]), "message": error["msg"]} for error in exc.errors()]
        return JSONResponse({"detail": "Input validation failed.", "error_code": "INVALID_INPUT", "errors": errors}, status_code=422)

    @app.exception_handler(ValidationError)
    async def model_validation_error(request, exc):
        errors = [{"field": ".".join(str(x) for x in error["loc"]), "message": error["msg"]} for error in exc.errors(include_input=False)]
        return JSONResponse({"detail": "Input validation failed.", "error_code": "INVALID_INPUT", "errors": errors}, status_code=422)

    @app.get("/healthz")
    def health(request: Request):
        try:
            with request.app.state.services.db.session() as session:
                session.execute(text("SELECT 1"))
            return {"status": "ok", "database": "ready"}
        except Exception:
            return JSONResponse({"status": "unhealthy", "database": "unavailable"}, status_code=503)

    @app.get("/api/session")
    def session_route(request: Request):
        session = read_session(request)
        return {"authenticated": bool(session), "user": {"name": "FlowPilot 管理员", "role": "admin"} if session else None,
                "csrf_token": session["csrf"] if session else None}

    @app.post("/api/login")
    def login(payload: LoginInput, request: Request, response: Response):
        origin_check(request)
        ip = request.client.host if request.client else "unknown"
        request.app.state.rate_limiter.check("login:" + ip, limit=12, seconds=300)
        if not hmac.compare_digest(payload.password.encode(), cfg.admin_password.encode()):
            raise FlowError("LOGIN_FAILED", "Password is incorrect.", status=401)
        token, session = sign_session(cfg)
        response.set_cookie(COOKIE, token, httponly=True, secure=cfg.public_base_url.startswith("https://"),
                            samesite="strict", max_age=cfg.session_ttl_seconds, path="/")
        return {"authenticated": True, "user": {"name": "FlowPilot 管理员", "role": "admin"}, "csrf_token": session["csrf"]}

    @app.post("/api/logout")
    def logout(response: Response, service=Depends(require_admin)):
        response.delete_cookie(COOKIE, path="/")
        return {"ok": True}

    @app.get("/api/dashboard")
    def dashboard(service=Depends(require_admin)):
        return service.dashboard()

    @app.get("/api/public/form")
    def public_form(request: Request):
        effective = request.app.state.services.effective_settings()
        return {"company_name": effective.company_name, "enabled": cfg.public_form_enabled, "test_mode": cfg.test_mode}

    @app.post("/api/public/leads", status_code=202)
    def public_submit(payload: PublicLeadInput, request: Request, idempotency_key: Annotated[str | None, Header()] = None):
        if not cfg.public_form_enabled:
            raise FlowError("PUBLIC_FORM_DISABLED", "The public intake form is disabled.", status=404)
        origin_check(request)
        ip = request.client.host if request.client else "unknown"
        request.app.state.rate_limiter.check("public:" + ip, limit=10)
        if payload.website:
            raise FlowError("PUBLIC_FORM_REJECTED", "Submission was rejected.", status=400)
        data = payload.model_dump(exclude={"website"})
        data.update({"source": "form", "is_test": cfg.test_mode})
        result = request.app.state.services.ingest(data, idempotency_key, source="form")
        return {"event_id": result["event"]["id"], "received": True, "duplicate": result["duplicate"], "is_test": cfg.test_mode}

    @app.post("/api/events", status_code=202)
    def create_event(payload: EventInput, service=Depends(require_admin), idempotency_key: Annotated[str | None, Header()] = None):
        return service.ingest(payload, idempotency_key)

    @app.get("/api/events")
    def list_events(service=Depends(require_admin), status: str | None = None, q: str | None = Query(None, max_length=200),
                    is_test: bool | None = None, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
        return service.list_events(status=status, q=q, is_test=is_test, limit=limit, offset=offset)

    @app.get("/api/events/{event_id}")
    def event_detail(event_id: str, service=Depends(require_admin)):
        return service.event_detail(event_id)

    @app.post("/api/events/{event_id}/correct")
    def correct_event(event_id: str, payload: CorrectionInput, service=Depends(require_admin)):
        return service.correct_event(event_id, payload.fields, payload.reason)

    @app.post("/api/webhooks/leads", status_code=202)
    def webhook(payload: EventInput, request: Request, service=Depends(require_webhook), idempotency_key: Annotated[str | None, Header()] = None):
        request.app.state.rate_limiter.check("webhook", limit=120)
        return service.ingest(payload, idempotency_key, source="api")

    @app.post("/api/import/csv")
    async def import_csv(file: UploadFile = File(...), is_test: bool = Form(False), service=Depends(require_admin)):
        raw = await file.read(1_000_001)
        if len(raw) > 1_000_000:
            raise FlowError("CSV_TOO_LARGE", "CSV files must be no larger than 1 MB.", status=413)
        try:
            text_content = raw.decode("utf-8-sig")
            reader = csv.DictReader(io.StringIO(text_content))
            if not reader.fieldnames or "message" not in reader.fieldnames:
                raise FlowError("CSV_COLUMNS_INVALID", "CSV requires a message column; see the downloadable sample.")
            if len(set(reader.fieldnames)) != len(reader.fieldnames) or set(reader.fieldnames) - set(EventInput.model_fields):
                raise FlowError("CSV_COLUMNS_INVALID", "CSV contains duplicate or unsupported columns.")
            rows = []
            for index, row in enumerate(reader):
                if index >= 500:
                    raise FlowError("CSV_ROW_LIMIT", "CSV import is limited to 500 rows per request.")
                if None in row:
                    raise FlowError("CSV_ROW_INVALID", "A CSV row has more values than its header.")
                cleaned = {k: (None if v is None or v.strip() == "" else v.strip()) for k, v in row.items()}
                cleaned["is_test"], cleaned["source"] = is_test, "csv"
                if not cleaned.get("currency"):
                    cleaned["currency"] = "CNY"
                if not cleaned.get("message"):
                    cleaned["message"] = ""
                rows.append(cleaned)
        except UnicodeDecodeError:
            raise FlowError("CSV_ENCODING_INVALID", "CSV must be encoded as UTF-8.") from None
        except csv.Error:
            raise FlowError("CSV_PARSE_FAILED", "The file is not valid CSV.") from None
        return service.batch_ingest(rows, source="csv")

    @app.post("/api/demo/run")
    def demo(payload: DemoInput, service=Depends(require_admin)):
        location = Path(cfg.demo_data_path)
        if not location.is_file():
            location = Path(__file__).resolve().parents[2] / "data" / "leads.json"
        if not location.is_file():
            raise FlowError("DEMO_DATA_MISSING", "Demo lead data was not mounted. Configure DEMO_DATA_PATH.", status=503)
        rows = json.loads(location.read_text(encoding="utf-8"))
        if isinstance(rows, dict):
            rows = rows.get("leads", [])
        if not isinstance(rows, list) or not 20 <= len(rows) <= 500:
            raise FlowError("DEMO_DATA_INVALID", "The demo dataset must contain 20 to 500 leads.", status=503)
        for row in rows:
            row["is_test"], row["source"] = True, "demo"
        return service.batch_ingest(rows, source="demo", batch_key=payload.batch_key)

    @app.get("/api/executions")
    def list_executions(service=Depends(require_admin), status: str | None = None,
                        limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
        return service.list_executions(status=status, limit=limit, offset=offset)

    @app.get("/api/executions/{run_id}")
    def execution_detail(run_id: str, service=Depends(require_admin)):
        return service.execution_detail(run_id)

    @app.post("/api/executions/{run_id}/retry")
    def retry(run_id: str, service=Depends(require_admin)):
        return service.retry_execution(run_id)

    @app.get("/api/crm/{kind}")
    def crm(kind: str, service=Depends(require_admin), limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
        return service.list_crm(kind, limit=limit, offset=offset)

    @app.patch("/api/crm/leads/{lead_id}")
    def update_lead(lead_id: str, payload: LeadPatch, service=Depends(require_admin)):
        return service.update_lead(lead_id, payload.model_dump())

    @app.patch("/api/crm/tasks/{task_id}")
    def update_task(task_id: str, payload: TaskPatch, service=Depends(require_admin)):
        return service.update_task(task_id, payload.status)

    @app.get("/api/approvals")
    def approvals(service=Depends(require_admin), status: str | None = None,
                  limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
        return service.list_approvals(status=status, limit=limit, offset=offset)

    @app.patch("/api/approvals/{approval_id}")
    def edit_approval(approval_id: str, payload: DraftEdit, service=Depends(require_admin)):
        return service.edit_approval(approval_id, payload.model_dump(mode="json"))

    @app.post("/api/approvals/{approval_id}/decision")
    def decision(approval_id: str, payload: DecisionInput, service=Depends(require_admin)):
        return service.decide_approval(approval_id, payload.model_dump())

    @app.get("/api/outbox")
    def outbox(service=Depends(require_admin), limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
        return service.list_outbox(limit=limit, offset=offset)

    @app.post("/api/outbox/{outbox_id}/resolve")
    def resolve_outbox(outbox_id: str, payload: ResolveInput, service=Depends(require_admin)):
        return service.reconcile_outbox(outbox_id, payload.outcome, payload.reason)

    @app.get("/api/settings")
    def get_settings(service=Depends(require_admin)):
        return service.public_settings()

    @app.patch("/api/settings")
    def patch_settings(payload: SettingsPatch, service=Depends(require_admin)):
        return service.update_settings(payload.model_dump(exclude_unset=True))

    @app.post("/api/settings/model/test")
    def test_model(request: Request, service=Depends(require_admin)):
        request.app.state.rate_limiter.check("model-probe", limit=5)
        effective = service.effective_settings()
        if effective.llm_provider == "fixture":
            return {"ok": True, "provider": "fixture", "model": "explicit-test-fixture", "message": "Fixture adapter is enabled for test events. This is not a real model connectivity test."}
        result = LLMClient(effective)._call(Extraction, {"task": "extract_lead", "customer": {
            "name": "Example Customer", "company": "Example Company", "email": "customer@example.com",
            "message": "We want CRM automation for our B2B sales team; budget and implementation date are not yet decided."
        }}, is_test=True)
        return {"ok": True, "provider": effective.llm_provider, "model": effective.llm_model,
                "message": "The real model endpoint returned a schema-valid extraction.", "schema_valid": True}

    @app.post("/api/internal/executions/{run_id}/claim")
    def claim(run_id: str, payload: InternalInput, service=Depends(require_internal)):
        return service.claim(run_id, **payload.model_dump())

    @app.post("/api/internal/executions/{run_id}/steps/{step}")
    def step(run_id: str, step: str, payload: InternalInput, service=Depends(require_internal)):
        return service.run_step(run_id, step, **payload.model_dump())

    @app.post("/api/internal/executions/{run_id}/failure")
    def failure(run_id: str, payload: FailureInput, service=Depends(require_internal)):
        return service.record_failure(run_id, **payload.model_dump())

    return app


# Import is side-effect-free: production credential/database validation occurs only
# during application startup, so factory-based tests need no global environment edits.
app = create_app()
