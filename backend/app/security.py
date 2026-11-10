import logging
import time
from collections import defaultdict, deque
from threading import Lock
from typing import Hashable
from uuid import UUID

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import CSRF_HEADER, CSRF_HEADER_VALUE, get_settings
from app.errors import error_response

AUTH_RATE_LIMIT = "20/minute"
USER_RATE_LIMIT = 120
SYNC_PUSH_RATE_LIMIT = 30
GLOBAL_REQUEST_BODY_LIMIT = 5 * 1024 * 1024
DEFAULT_REQUEST_BODY_LIMIT = 1024 * 1024
SYNC_PUSH_BODY_LIMIT = 512 * 1024
IMPORT_BODY_LIMIT = 5 * 1024 * 1024

# Same policy is served for the SPA by vercel.json. Google avatars are the only external images.
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https://*.googleusercontent.com; font-src 'self'; "
    "connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; "
    "base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Auth endpoint limits use forwarded client IPs; authenticated limits use the resolved user ID.
# All limiters are in-memory per instance; forwarded-IP trust still needs deployment verification.
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],
    enabled=get_settings().RATE_LIMIT_ENABLED,
)

access_log = logging.getLogger("dealbook.access")


class UserWindowRateLimiter:
    """Small per-process sliding window keyed by authenticated user and operation."""

    def __init__(self):
        self._events: dict[tuple[Hashable, str], deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def consume(self, user_id: UUID, operation: str, limit: int, window: float,
                now: float | None = None, message: str = "Too many requests, slow down.") -> None:
        current = time.monotonic() if now is None else now
        key = (user_id, operation)
        with self._lock:
            events = self._events[key]
            while events and current - events[0] >= window:
                events.popleft()
            if len(events) >= limit:
                from app.errors import AppError

                raise AppError(429, "rate_limited", message)
            events.append(current)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()


import_rate_limiter = UserWindowRateLimiter()
user_rate_limiter = UserWindowRateLimiter()


class _RequestBodyTooLarge(Exception):
    pass


class RequestBodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int = GLOBAL_REQUEST_BODY_LIMIT):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if scope["type"] != "http" or not path.startswith("/api/"):
            await self.app(scope, receive, send)
            return

        if path.startswith("/api/import"):
            endpoint_limit = IMPORT_BODY_LIMIT
        elif path == "/api/sync/push":
            endpoint_limit = SYNC_PUSH_BODY_LIMIT
        else:
            endpoint_limit = DEFAULT_REQUEST_BODY_LIMIT
        limit = min(self.max_bytes, endpoint_limit)

        headers = dict(scope.get("headers", []))
        try:
            if int(headers.get(b"content-length", b"0")) > limit:
                await self._too_large(scope, receive, send, path, limit)
                return
        except ValueError:
            pass

        size = 0

        async def limited_receive() -> Message:
            nonlocal size
            message = await receive()
            if message["type"] == "http.request":
                size += len(message.get("body", b""))
                if size > limit:
                    raise _RequestBodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _RequestBodyTooLarge:
            await self._too_large(scope, receive, send, path, limit)

    @staticmethod
    async def _too_large(scope: Scope, receive: Receive, send: Send, path: str, limit: int) -> None:
        from starlette.responses import JSONResponse

        message = (
            "Import requests are limited to 5 MB."
            if path.startswith("/api/import")
            else f"Request bodies are limited to {limit // 1024} KB for this endpoint."
        )
        response = JSONResponse(
            status_code=413,
            content={"error": {"code": "request_too_large", "message": message}},
        )
        await response(scope, receive, send)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        h = response.headers
        h["X-Content-Type-Options"] = "nosniff"
        h["Referrer-Policy"] = "strict-origin-when-cross-origin"
        h["X-Frame-Options"] = "DENY"
        h["Content-Security-Policy"] = CONTENT_SECURITY_POLICY
        h.setdefault("Cache-Control", "no-store")
        if get_settings().is_prod:
            h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


class CSRFMiddleware(BaseHTTPMiddleware):
    """Browsers cannot send a custom header cross-site without a CORS preflight, which we never allow."""

    async def dispatch(self, request: Request, call_next):
        if request.method in UNSAFE_METHODS and request.headers.get(CSRF_HEADER) != CSRF_HEADER_VALUE:
            return error_response(403, "csrf_failed", "Missing X-Requested-With header.")
        return await call_next(request)


class AccessLogMiddleware(BaseHTTPMiddleware):
    """Logs method, path (no query string: it carries OAuth codes) and status. Never headers or cookies."""

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        ms = (time.perf_counter() - start) * 1000
        access_log.info("%s %s %s %.0fms", request.method, request.url.path, response.status_code, ms)
        return response
