"""Guard: refuse to run tests against any database whose name does not contain 'test'."""
from app.config import db_name, normalize_pg_url


class UnsafeTestDatabase(SystemExit):
    pass


def assert_test_database(url: str) -> None:
    name = db_name(normalize_pg_url(url))
    if "test" not in name.lower():
        raise UnsafeTestDatabase(
            f"REFUSING to run tests: database {name!r} does not contain 'test'. "
            "Point TEST_DATABASE_URL at a separate test database or Neon branch."
        )
