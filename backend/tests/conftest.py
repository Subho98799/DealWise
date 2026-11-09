"""Test setup. Everything runs as the restricted app_user against TEST_DATABASE_URL (name must contain "test").

Each test creates users with google_sub 'test-...' and deletes them (cascade) before and after.
"""
import os
import uuid
from contextlib import contextmanager
from pathlib import Path

from dotenv import dotenv_values

BACKEND = Path(__file__).resolve().parents[1]
_file = {k: v for k, v in dotenv_values(BACKEND / ".env").items() if v}


def _env(name: str) -> str | None:
    return os.environ.get(name) or _file.get(name)


from tests.safety import assert_test_database  # noqa: E402

TEST_DB = _env("TEST_DATABASE_URL")
if not TEST_DB:
    raise SystemExit("TEST_DATABASE_URL is not set (app_user URL of a database whose name contains 'test').")
assert_test_database(TEST_DB)

# The app under test must use the test database, whatever backend/.env says.
os.environ["DATABASE_URL"] = TEST_DB
os.environ["MIGRATION_DATABASE_URL"] = _env("TEST_MIGRATION_DATABASE_URL") or TEST_DB
os.environ["ENV"] = "dev"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["FRONTEND_URL"] = "http://localhost:5173"
for k, v in {"GOOGLE_CLIENT_ID": "test-client-id.apps.googleusercontent.com",
             "GOOGLE_CLIENT_SECRET": "test-client-secret",
             "SESSION_SECRET": "ci-test-7d3c09e27a9b45f4a8f07b3c15e6a102"}.items():
    os.environ[k] = v

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from alembic.script import ScriptDirectory  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

CSRF = {"X-Requested-With": "dealtracker"}


@pytest.fixture(scope="session", autouse=True)
def migrated_db():
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    if _env("TEST_MIGRATION_DATABASE_URL"):
        assert_test_database(_env("TEST_MIGRATION_DATABASE_URL"))
        os.environ["MIGRATION_DATABASE_URL"] = _env("TEST_MIGRATION_DATABASE_URL")
        command.upgrade(cfg, "head")  # additive only; never downgrades or drops
    from app.db import engine

    head = ScriptDirectory.from_config(cfg).get_current_head()
    with engine.connect() as c:
        who = c.execute(text("SELECT current_user")).scalar_one()
        current = c.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    if who != "app_user":
        raise SystemExit(f"Tests must connect as app_user, TEST_DATABASE_URL connects as {who!r}.")
    if current != head:
        raise SystemExit(f"Test database is at {current}, head is {head}: run the migrate script on it.")
    yield


def _cleanup():
    from app.db import engine

    with engine.begin() as c:
        c.execute(text("DELETE FROM users WHERE google_sub LIKE 'test-%'"))


@pytest.fixture(autouse=True)
def clean_tables():
    _cleanup()
    yield
    _cleanup()


@pytest.fixture
def app_engine():
    from app.db import engine

    return engine


@pytest.fixture
def app_session_factory():
    from app.db import SessionLocal

    return SessionLocal


@pytest.fixture
def user_ctx(app_session_factory):
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
    """Creates a user through the real auth service; returns (user_id, raw_session_token)."""
    from app.auth import service
    from app.auth.sessions import hash_token
    from app.db import SessionLocal

    def _make(sub: str) -> tuple[uuid.UUID, str]:
        raw = service.login_user(f"test-{sub}", f"{sub}@example.com", sub.title(), None, "pytest")
        with SessionLocal() as s:
            uid = s.execute(text("SELECT user_id FROM sessions WHERE token_hash = :h"),
                            {"h": hash_token(raw)}).scalar_one()
        return uid, raw

    return _make


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app, follow_redirects=False) as c:
        yield c


@pytest.fixture
def api(make_user):
    """api('alice') -> (TestClient logged in as alice with CSRF header, user_id)."""
    from app.config import CSRF_HEADER, CSRF_HEADER_VALUE, SESSION_COOKIE
    from app.main import app

    clients = []

    def _api(sub: str):
        uid, raw = make_user(sub)
        c = TestClient(app, follow_redirects=False, headers={CSRF_HEADER: CSRF_HEADER_VALUE})
        c.cookies.set(SESSION_COOKIE, raw)
        clients.append(c)
        return c, uid

    yield _api
    for c in clients:
        c.close()
