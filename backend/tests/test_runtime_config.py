import os
import subprocess
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings


def _settings(secret):
    return Settings(
        _env_file=None,
        ENV="dev",
        DATABASE_URL="postgresql+psycopg://app_user:unused@localhost/dealtracker_test",
        GOOGLE_CLIENT_ID="test-client.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET="unused",
        SESSION_SECRET=secret,
        FRONTEND_URL="http://localhost:5173",
    )


def test_app_starts_without_migration_database_url(tmp_path):
    backend = str(Path(__file__).resolve().parents[1])
    env = os.environ.copy()
    env.pop("MIGRATION_DATABASE_URL", None)
    env.update({
        "ENV": "dev",
        "DATABASE_URL": "postgresql+psycopg://app_user:unused@localhost/dealtracker_test",
        "GOOGLE_CLIENT_ID": "test-client.apps.googleusercontent.com",
        "GOOGLE_CLIENT_SECRET": "unused",
        "SESSION_SECRET": "a7f21c0941e64f3c9b308ac58e712d6f",
        "FRONTEND_URL": "http://localhost:5173",
        "PYTHONPATH": backend,
    })
    result = subprocess.run(
        [sys.executable, "-c", "from app.main import app; assert app.title == 'DealTracker API'"],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


def test_session_secret_requires_length_and_rejects_placeholders():
    assert _settings("a7f21c0941e64f3c9b308ac58e712d6f").SESSION_SECRET
    for secret in ("short", "x" * 32, "change-me-" + "x" * 24, "test-session-secret-" + "x" * 20):
        with pytest.raises(ValidationError):
            _settings(secret)
