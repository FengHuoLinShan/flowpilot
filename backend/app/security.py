from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from collections import defaultdict, deque
from urllib.parse import urlparse

from fastapi import Request

from .errors import FlowError

COOKIE = "flowpilot_session"


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def sign_session(settings):
    payload = {"sub": "admin", "exp": int(time.time()) + settings.session_ttl_seconds,
               "csrf": secrets.token_urlsafe(24), "nonce": secrets.token_hex(8)}
    encoded = b64(json.dumps(payload, separators=(",", ":")).encode())
    signature = b64(hmac.new(settings.session_secret.encode(), encoded.encode(), hashlib.sha256).digest())
    return encoded + "." + signature, payload


def read_session(request: Request) -> dict | None:
    token = request.cookies.get(COOKIE)
    if not token or len(token) > 2000:
        return None
    try:
        encoded, signature = token.split(".", 1)
        expected = b64(hmac.new(request.app.state.settings.session_secret.encode(), encoded.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        data = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        if data.get("sub") != "admin" or data.get("exp", 0) <= time.time():
            return None
        return data
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        return None


def origin_check(request: Request):
    origin = request.headers.get("origin")
    if origin:
        expected = urlparse(request.app.state.settings.public_base_url)
        got = urlparse(origin)
        if (got.scheme, got.netloc) != (expected.scheme, expected.netloc):
            raise FlowError("ORIGIN_REJECTED", "Cross-origin writes are not allowed.", status=403)


def require_admin(request: Request):
    session = read_session(request)
    if not session:
        raise FlowError("AUTH_REQUIRED", "Sign in to the FlowPilot console.", status=401)
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin_check(request)
        supplied = request.headers.get("x-csrf-token", "")
        if not supplied or not hmac.compare_digest(supplied, session["csrf"]):
            raise FlowError("CSRF_REJECTED", "The session's CSRF token is required for this action.", status=403)
    return request.app.state.services


def require_internal(request: Request):
    supplied = request.headers.get("x-flowpilot-internal", "")
    if not supplied or not hmac.compare_digest(supplied.encode(), request.app.state.settings.internal_key.encode()):
        raise FlowError("INTERNAL_AUTH_REQUIRED", "Workflow authentication is required.", status=401)
    return request.app.state.services


def require_webhook(request: Request):
    supplied = request.headers.get("x-webhook-key", "")
    if not supplied or not hmac.compare_digest(supplied.encode(), request.app.state.settings.webhook_key.encode()):
        raise FlowError("WEBHOOK_AUTH_REQUIRED", "A valid X-Webhook-Key header is required.", status=401)
    return request.app.state.services


class RateLimiter:
    """Single-process abuse guard; deployments with multiple API replicas need shared limits."""
    def __init__(self):
        self._entries = defaultdict(deque)

    def check(self, key: str, *, limit: int, seconds: int = 60):
        instant = time.monotonic()
        queue = self._entries[key]
        while queue and queue[0] <= instant - seconds:
            queue.popleft()
        if len(queue) >= limit:
            raise FlowError("RATE_LIMITED", "Too many requests. Wait before trying again.", status=429)
        queue.append(instant)
        if len(self._entries) > 10000:
            for old_key in list(self._entries)[:1000]:
                old = self._entries[old_key]
                if not old or old[-1] < instant - 600:
                    self._entries.pop(old_key, None)
