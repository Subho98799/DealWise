import logging
import time

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

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
