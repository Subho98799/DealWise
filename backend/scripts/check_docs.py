"""Doc freshness: every FastAPI route and every Alembic migration must appear in docs/IMPLEMENTATION.md."""
import os
import sys

from _common import BACKEND, ROOT

for k, v in {"ENV": "dev", "DATABASE_URL": "postgresql+psycopg://x:x@localhost/x_test",
             "MIGRATION_DATABASE_URL": "postgresql+psycopg://x:x@localhost/x_test",
             "GOOGLE_CLIENT_ID": "docs-check.apps.googleusercontent.com", "GOOGLE_CLIENT_SECRET": "x",
             "SESSION_SECRET": "x" * 32, "FRONTEND_URL": "http://localhost:5173"}.items():
    os.environ[k] = v  # no DB connection is made; this only builds the route table
os.chdir(BACKEND)

from app.config import Settings  # noqa: E402

Settings.model_config["env_file"] = None

from fastapi.routing import APIRoute  # noqa: E402

from app.main import app  # noqa: E402

doc = (ROOT / "docs" / "IMPLEMENTATION.md").read_text()
missing = [f"| {m} | `{r.path}` |" for r in app.routes if isinstance(r, APIRoute)
           for m in sorted(r.methods) if f"| {m} | `{r.path}` |" not in doc]
missing += [f"migration {p.name}" for p in sorted((BACKEND / "alembic" / "versions").glob("*.py"))
            if p.name not in doc]
if missing:
    print("docs/IMPLEMENTATION.md is out of date. Add:\n  " + "\n  ".join(missing))
    sys.exit(1)
print("docs are fresh: all routes and migrations are documented")
