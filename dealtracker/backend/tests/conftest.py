"""Test setup. Runs against a real Postgres: migrations as the owner, the app and isolation tests as app_user."""
import os
import uuid
from contextlib import contextmanager
from pathlib import Path

# Configure BEFORE importing the app. DB URLs are forced so tests can never touch the dev database.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://app_user:app_user_local_dev@localhost:5432/dealtracker_test",
)
os.environ["MIGRATION_DATABASE_URL"] = os.environ.get(
    "TEST_MIGRATION_DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/dealtracker_test",
)
os.environ["ENV"] = "dev"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("SESSION_SECRET", "test-session-secret-at-least-32-characters-long")
os.environ["FRONTEND_URL"] = "http://localhost:5173"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.config import normalize_pg_url  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
CSRF = {"X-Requested-With": "dealtracker"}


@pytest.fixture(scope="session", autouse=True)
def migrated_db():
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(scope="session")
def owner_engine(migrated_db):
    eng = create_engine(normalize_pg_url(os.environ["MIGRATION_DATABASE_URL"]), poolclass=NullPool)
    yield eng
    eng.dispose()


@pytest.fixture(autouse=True)
def clean_tables(owner_engine):
    with owner_engine.begin() as conn:
        conn.execute(text("TRUNCATE users CASCADE"))
    yield


@pytest.fixture
def app_session_factory():
    from app.db import SessionLocal

    return SessionLocal


@pytest.fixture
def user_ctx(app_session_factory):
    """Open a transaction as app_user with app.current_user_id set to the given user."""
    from app.db import set_user_context

    @contextmanager
    def _ctx(user_id: uuid.UUID | None):
        with app_session_factory() as s, s.begin():
            if user_id is not None:
                set_user_context(s, user_id)
            yield s

    return _ctx


@pytest.fixture
def make_user():
    """Creates a user through the real auth service and returns (user_id, raw_session_token)."""
    from app.auth import service
    from app.auth.sessions import hash_token
    from app.db import SessionLocal

    def _make(sub: str) -> tuple[uuid.UUID, str]:
        raw = service.login_user(sub, f"{sub}@example.com", sub.title(), None, "pytest")
        with SessionLocal() as s:
            uid = s.execute(
                text("SELECT user_id FROM sessions WHERE token_hash = :h"), {"h": hash_token(raw)}
            ).scalar_one()
        return uid, raw

    return _make


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app, follow_redirects=False) as c:
        yield c
