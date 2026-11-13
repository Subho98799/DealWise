"""Guard: refuse to run tests against the app database.

A test database is safe when its name contains 'test', or when it lives on a
separate host (for example a different Neon branch served from its own
endpoint) whose database name is still 'neondb'.
"""
from urllib.parse import urlsplit

from app.config import db_name, normalize_pg_url


class UnsafeTestDatabase(SystemExit):
    pass


def _host(url: str) -> str:
    return (urlsplit(url).hostname or "").lower().replace("-pooler.", ".")


def is_separate_database(url: str, app_url: str | None) -> bool:
    if not app_url:
        return False
    return bool(_host(url)) and _host(url) != _host(app_url)


def assert_test_database(url: str, app_url: str | None = None) -> None:
    normalized = normalize_pg_url(url)
    name = db_name(normalized)
    if "test" in name.lower():
        return
    if is_separate_database(normalized, app_url):
        return
    raise UnsafeTestDatabase(
        f"REFUSING to run tests: database {name!r} does not contain 'test' and is not on a separate host from DATABASE_URL. "
        "Point TEST_DATABASE_URL at a test database, or at a separate Neon branch endpoint."
    )
