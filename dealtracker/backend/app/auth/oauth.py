from urllib.parse import urlsplit

from authlib.integrations.starlette_client import OAuth

from app.config import get_settings

GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"

oauth = OAuth()
oauth.register(
    name="google",
    client_id=get_settings().GOOGLE_CLIENT_ID,
    client_secret=get_settings().GOOGLE_CLIENT_SECRET,
    server_metadata_url=GOOGLE_DISCOVERY_URL,
    client_kwargs={"scope": "openid email profile"},
)


def redirect_uri() -> str:
    # REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    # It must equal exactly what is registered in Google Cloud: FRONTEND_URL + /api/auth/google/callback
    return f"{get_settings().FRONTEND_URL}/api/auth/google/callback"


def is_safe_next(value: str | None) -> bool:
    """Only same-site relative paths like /settings. Rejects //evil.com, /\\evil.com, http://..., etc."""
    if not value or len(value) > 512 or not value.startswith("/"):
        return False
    if value.startswith("//") or "\\" in value:
        return False
    if any(ord(c) < 32 or ord(c) == 127 for c in value):
        return False
    parts = urlsplit(value)
    return not parts.scheme and not parts.netloc
