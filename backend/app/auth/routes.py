import logging
import secrets

from authlib.integrations.base_client.errors import OAuthError
from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import RedirectResponse

from app.auth import service
from app.auth.oauth import is_safe_next, oauth, pkce_challenge, redirect_uri
from app.auth.sessions import clear_session_cookie, set_session_cookie
from app.config import get_settings, session_cookie_name
from app.errors import AppError
from app.security import AUTH_RATE_LIMIT, limiter

log = logging.getLogger("dealtracker.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])


def _fail(code: str) -> RedirectResponse:
    return RedirectResponse(f"{get_settings().FRONTEND_URL}/login?error={code}", status_code=302)


@router.get("/google/login")
@limiter.limit(AUTH_RATE_LIMIT)
async def google_login(request: Request, next: str = Query(default="/")):
    if not is_safe_next(next):
        raise AppError(400, "invalid_next", "next must be a relative path starting with '/'.")
    request.session.clear()
    request.session["next"] = next
    code_verifier = secrets.token_urlsafe(32)
    request.session["code_verifier"] = code_verifier
    # Authlib stores state + nonce in the short-lived handshake session cookie.
    return await oauth.google.authorize_redirect(
        request,
        redirect_uri(),
        code_challenge=pkce_challenge(code_verifier),
        code_challenge_method="S256",
    )


@router.get("/google/callback")
@limiter.limit(AUTH_RATE_LIMIT)
async def google_callback(request: Request):
    if request.query_params.get("error"):
        request.session.clear()
        return _fail("access_denied")
    code_verifier = request.session.get("code_verifier")
    if not isinstance(code_verifier, str):
        request.session.clear()
        return _fail("oauth_failed")
    try:
        # Validates state, exchanges the PKCE-bound code, verifies the ID token and nonce.
        token = await oauth.google.authorize_access_token(request, code_verifier=code_verifier)
    except OAuthError as exc:
        log.warning("oauth callback failed: %s", exc.error)
        request.session.clear()
        return _fail("oauth_failed")

    info = token.get("userinfo") or {}
    next_path = request.session.get("next", "/")
    request.session.clear()

    if info.get("email_verified") is not True or not info.get("sub") or not info.get("email"):
        return _fail("email_unverified")

    raw = service.login_user(
        google_sub=str(info["sub"]),
        email=str(info["email"]).lower(),
        name=info.get("name"),
        avatar_url=info.get("picture"),
        user_agent=request.headers.get("user-agent"),
    )
    target = next_path if is_safe_next(next_path) else "/"
    response = RedirectResponse(f"{get_settings().FRONTEND_URL}{target}", status_code=302)
    set_session_cookie(response, raw)
    return response


@router.post("/logout", status_code=204)
@limiter.limit(AUTH_RATE_LIMIT)
async def logout(request: Request):
    raw = request.cookies.get(session_cookie_name())
    if raw:
        service.logout(raw)
    response = Response(status_code=204)
    clear_session_cookie(response)
    return response
