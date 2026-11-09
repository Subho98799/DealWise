import logging

from fastapi import FastAPI
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.auth.routes import router as auth_router
from app.config import APP_NAME, OAUTH_COOKIE, get_settings
from app.errors import register_error_handlers
from app.routes import deals, health, imports, me, mediators, sync
from app.schemas import ErrorOut
from app.security import (AccessLogMiddleware, CSRFMiddleware, RequestBodyLimitMiddleware,
                          SecurityHeadersMiddleware, limiter)

settings = get_settings()  # fail fast on missing configuration
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)  # never log outbound OAuth request lines

app = FastAPI(
    title=f"{APP_NAME} API",
    docs_url=None if settings.is_prod else "/api/docs",
    openapi_url=None if settings.is_prod else "/api/openapi.json",
    redoc_url=None,
    responses={400: {"model": ErrorOut}, 401: {"model": ErrorOut}, 403: {"model": ErrorOut}},
)
app.state.limiter = limiter
register_error_handlers(app)

# Starlette runs the LAST added middleware first.
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    SessionMiddleware,  # only for the short OAuth handshake (state + nonce + next)
    secret_key=settings.SESSION_SECRET,
    session_cookie=OAUTH_COOKIE,
    max_age=600,
    path="/api/auth",
    same_site="lax",
    https_only=settings.is_prod,
)
app.add_middleware(CSRFMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(AccessLogMiddleware)
app.add_middleware(RequestBodyLimitMiddleware)

app.include_router(health.router)
app.include_router(auth_router)
app.include_router(me.router)
app.include_router(mediators.router)
app.include_router(deals.router)
app.include_router(sync.router)
app.include_router(imports.router)
