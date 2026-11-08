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
DEFAULT_RATE_LIMIT = "120/minute"

# Same policy is served for the SPA by vercel.json. Google avatars are the only external images.
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https://*.googleusercontent.com; font-src 'self'; "
    "connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; "
    "base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# TODO(rate-limit): limits are in-memory PER INSTANCE and key on the client IP taken from forwarded
# headers (uvicorn --proxy-headers --forwarded-allow-ips='*'), which a client can spoof. Known limitation,
# see docs/ARCHITECTURE.md "Known limitations". Fix later with a shared store + trusted proxy list.
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[DEFAULT_RATE_LIMIT],
    enabled=get_settings().RATE_LIMIT_ENABLED,
)

access_log = logging.getLogger("dealtracker.access")


class UserWindowRateLimiter:
    """Small per-process sliding window keyed by authenticated user and operation."""

    def __init__(self):
        self._events: dict[tuple[Hashable, str], deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def consume(self, user_id: UUID, operation: str, limit: int, window: float,
                now: float | None = None) -> None:
        current = time.monotonic() if now is None else now
        key = (user_id, operation)
        with self._lock:
            events = self._events[key]
            while events and current - events[0] >= window:
                events.popleft()
            if len(events) >= limit:
                from app.errors import AppError

                raise AppError(429, "rate_limited", "Too many import requests, slow down.")
            events.append(current)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()


import_rate_limiter = UserWindowRateLimiter()


class ImportBodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int = 5 * 1024 * 1024):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope.get("path", "").startswith("/api/import"):
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        try:
            if int(headers.get(b"content-length", b"0")) > self.max_bytes:
                await self._too_large(scope, receive, send)
                return
        except ValueError:
            pass

        size = 0

        async def limited_receive() -> Message:
            nonlocal size
            message = await receive()
            if message["type"] == "http.request":
                size += len(message.get("body", b""))
                if size > self.max_bytes:
                    raise OverflowError("import request body too large")
            return message

        try:
            await self.app(scope, limited_receive, send)
        except OverflowError as exc:
            if str(exc) != "import request body too large":
                raise
            await self._too_large(scope, receive, send)

    @staticmethod
    async def _too_large(scope: Scope, receive: Receive, send: Send) -> None:
        from starlette.responses import JSONResponse

        response = JSONResponse(
            status_code=413,
            content={"error": {"code": "request_too_large", "message": "Import requests are limited to 5 MB."}},
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
