import sys
from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Single source of truth for naming (rename = edit these lines; see docs/IMPLEMENTATION.md).
APP_NAME = "DealTracker"
APP_SLUG = "dealtracker"
COOKIE_PREFIX = "dt"
SESSION_COOKIE = f"{COOKIE_PREFIX}_session"
OAUTH_COOKIE = f"{COOKIE_PREFIX}_oauth"
CSRF_HEADER = "X-Requested-With"
CSRF_HEADER_VALUE = APP_SLUG

HINTS = {
    "ENV": "dev on your laptop, prod on Render",
    "DATABASE_URL": "app_user POOLED Neon URL, e.g. postgresql+psycopg://app_user:<pw>@ep-x-pooler.<region>.aws.neon.tech/neondb?sslmode=require",
    "MIGRATION_DATABASE_URL": "owner DIRECT Neon URL (no -pooler), e.g. postgresql+psycopg://neondb_owner:<pw>@ep-x.<region>.aws.neon.tech/neondb?sslmode=require",
    "GOOGLE_CLIENT_ID": "from Google Cloud > Credentials, ends with .apps.googleusercontent.com",
    "GOOGLE_CLIENT_SECRET": "from the same Google OAuth client (starts with GOCSPX-)",
    "SESSION_SECRET": 'at least 32 random characters: python -c "import secrets; print(secrets.token_urlsafe(48))"',
    "FRONTEND_URL": "the address you open in the browser, e.g. http://localhost:5173 or https://<app>.vercel.app",
}


def normalize_pg_url(url: str) -> str:
    """Accept postgres:// and postgresql:// (as Neon/Render give them) and force the psycopg 3 driver."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def db_name(url: str) -> str:
    return urlsplit(url).path.lstrip("/")


def _check_pg_url(v: str) -> str:
    v = normalize_pg_url(v.strip())
    parts = urlsplit(v)
    if parts.scheme != "postgresql+psycopg" or not parts.hostname or not parts.path.strip("/"):
        raise ValueError("must look like postgresql+psycopg://user:password@host/dbname")
    if parts.hostname.endswith("neon.tech") and "sslmode=require" not in parts.query:
        raise ValueError("Neon URLs must end with ?sslmode=require")
    return v


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    ENV: Literal["dev", "prod"]
    DATABASE_URL: str = Field(min_length=1)
    MIGRATION_DATABASE_URL: str = Field(min_length=1)
    GOOGLE_CLIENT_ID: str = Field(min_length=1)
    GOOGLE_CLIENT_SECRET: str = Field(min_length=1)
    SESSION_SECRET: str = Field(min_length=32)
    FRONTEND_URL: str = Field(min_length=1)
    ADMIN_EMAILS: str = ""
    RATE_LIMIT_ENABLED: bool = True

    @field_validator("DATABASE_URL", "MIGRATION_DATABASE_URL")
    @classmethod
    def _pg(cls, v: str) -> str:
        return _check_pg_url(v)

    @field_validator("GOOGLE_CLIENT_ID")
    @classmethod
    def _gid(cls, v: str) -> str:
        if not v.endswith(".apps.googleusercontent.com"):
            raise ValueError("must end with .apps.googleusercontent.com")
        return v

    @field_validator("FRONTEND_URL")
    @classmethod
    def _strip_slash(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("must start with http:// or https://")
        return v.rstrip("/")

    @property
    def is_prod(self) -> bool:
        return self.ENV == "prod"

    @property
    def admin_emails(self) -> set[str]:
        return {e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()}


def explain(exc: ValidationError) -> str:
    lines = [f"{APP_NAME} cannot start: fix these environment variables (backend/.env or host settings):"]
    for err in exc.errors():
        name = str(err["loc"][0]) if err["loc"] else "?"
        problem = "is missing or empty" if err["type"] in ("missing", "string_too_short") else err["msg"]
        if name == "SESSION_SECRET" and err["type"] == "string_too_short":
            problem = "is missing or shorter than 32 characters"
        lines.append(f"  - {name} {problem}. Put: {HINTS.get(name, 'see backend/.env.example')}")
    return "\n".join(lines)


@lru_cache
def get_settings() -> Settings:
    try:
        return Settings()  # type: ignore[call-arg]
    except ValidationError as exc:
        print(explain(exc), file=sys.stderr)
        raise SystemExit(1) from None
