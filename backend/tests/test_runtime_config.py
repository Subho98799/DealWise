import os
import subprocess
import sys
from pathlib import Path


def test_app_starts_without_migration_database_url(tmp_path):
    backend = str(Path(__file__).resolve().parents[1])
    env = os.environ.copy()
    env.pop("MIGRATION_DATABASE_URL", None)
    env.update({
        "ENV": "dev",
        "DATABASE_URL": "postgresql+psycopg://app_user:unused@localhost/dealtracker_test",
        "GOOGLE_CLIENT_ID": "test-client.apps.googleusercontent.com",
        "GOOGLE_CLIENT_SECRET": "unused",
        "SESSION_SECRET": "test-session-secret-with-at-least-32-chars",
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
