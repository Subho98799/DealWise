from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_pg_url(url: str) -> str:
    """Accept postgres:// and postgresql:// (as Neon/Render give them) and force the psycopg 3 driver."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

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
    def _pg_driver(cls, v: str) -> str:
        return normalize_pg_url(v)

    @field_validator("FRONTEND_URL")
    @classmethod
    def _strip_slash(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("FRONTEND_URL must start with http:// or https://")
        return v.rstrip("/")

    @property
    def is_prod(self) -> bool:
        return self.ENV == "prod"

    @property
    def admin_emails(self) -> set[str]:
        return {e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()}


@lru_cache
def get_settings() -> Settings:
    # Raises a pydantic ValidationError naming every missing variable -> the app refuses to start.
    return Settings()  # type: ignore[call-arg]
