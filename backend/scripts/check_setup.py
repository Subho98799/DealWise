"""check_setup: verifies your configuration without printing any secret. Exit code 1 if anything fails."""
import os
import sys
import uuid

from _common import BACKEND, env

results: list[tuple[bool, str]] = []


def check(ok: bool, msg: str) -> bool:
    results.append((ok, msg))
    print(f"{'PASS' if ok else 'FAIL'}  {msg}")
    return ok


os.chdir(BACKEND)
from pydantic import ValidationError  # noqa: E402

from app.config import Settings, db_name, explain, normalize_pg_url  # noqa: E402

REQUIRED = ["ENV", "DATABASE_URL", "MIGRATION_DATABASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
            "SESSION_SECRET", "FRONTEND_URL", "TEST_DATABASE_URL"]
missing = [n for n in REQUIRED if not env(n)]
check(not missing, "all required variables are present" + (f" (missing: {', '.join(missing)})" if missing else ""))

settings = None
try:
    settings = Settings()  # type: ignore[call-arg]
    check(True, "all variables are well-formed")
except ValidationError as e:
    check(False, "some variables are malformed:\n" + explain(e))

if settings:
    import sqlalchemy as sa
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    try:
        eng = sa.create_engine(settings.DATABASE_URL, connect_args={"prepare_threshold": None})
        with eng.connect() as c:
            who = c.execute(sa.text("SELECT current_user")).scalar_one()
            app_database = c.execute(sa.text("SELECT current_database()")).scalar_one()
            check(who == "app_user", f"DATABASE_URL connects as app_user (got {who!r})")
            sup, byp = c.execute(sa.text(
                "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")).one()
            check(not sup and not byp, f"app_user is not superuser and has no BYPASSRLS (super={sup}, bypassrls={byp})")
            head = ScriptDirectory.from_config(Config(str(BACKEND / "alembic.ini"))).get_current_head()
            migration_url = env("MIGRATION_DATABASE_URL")
            if migration_url:
                migration_engine = sa.create_engine(
                    migration_url, connect_args={"prepare_threshold": None}
                )
                try:
                    with migration_engine.connect() as migration_connection:
                        migration_user = migration_connection.execute(
                            sa.text("SELECT current_user")
                        ).scalar_one()
                        migration_database = migration_connection.execute(
                            sa.text("SELECT current_database()")
                        ).scalar_one()
                        cur = migration_connection.execute(
                            sa.text("SELECT version_num FROM alembic_version")
                        ).scalar_one()
                    check(migration_user != "app_user",
                          "MIGRATION_DATABASE_URL connects with the owner/migration role")
                    check(migration_database == app_database,
                          "MIGRATION_DATABASE_URL and DATABASE_URL point to the same database")
                except Exception:
                    cur = None
                    check(False, "cannot read migration revision using MIGRATION_DATABASE_URL; check owner URL")
                finally:
                    migration_engine.dispose()
            else:
                cur = None
                check(False, "MIGRATION_DATABASE_URL is required to check the migration revision")
            check(cur == head, f"migrations are at the latest revision (db={cur}, latest={head}); "
                               "if not, run the migrate command")
            if cur == head:
                c.rollback()
                trans = c.begin()
                try:
                    zero = c.execute(sa.text("SELECT count(*) FROM deals")).scalar_one()
                    check(zero == 0, f"RLS: with no user set, deals returns 0 rows (got {zero})")
                    ids = []
                    for n in ("a", "b"):
                        ids.append(c.execute(sa.text(
                            "INSERT INTO users (google_sub, email) VALUES (:s, 'check@invalid') RETURNING id"),
                            {"s": f"check-setup-{n}-{uuid.uuid4()}"}).scalar_one())
                    setu = sa.text("SELECT set_config('app.current_user_id', :u, true)")
                    c.execute(setu, {"u": str(ids[0])})
                    did = c.execute(sa.text("INSERT INTO deals (user_id, product, date_taken) "
                                            "VALUES (:u, 'check', current_date) RETURNING id"), {"u": ids[0]}).scalar_one()
                    c.execute(setu, {"u": str(ids[1])})
                    seen = c.execute(sa.text("SELECT count(*) FROM deals WHERE id = :d"), {"d": did}).scalar_one()
                    check(seen == 0, "RLS: a deal inserted for user A is invisible to user B")
                finally:
                    trans.rollback()  # leaves nothing behind
    except Exception as e:  # noqa: BLE001
        check(False, f"cannot connect with DATABASE_URL ({type(e).__name__}); check host, password, sslmode=require")

test_url = env("TEST_DATABASE_URL")
if test_url:
    name = db_name(normalize_pg_url(test_url))
    same = settings is not None and normalize_pg_url(test_url) == settings.DATABASE_URL
    check("test" in name.lower() and not same,
          f"TEST_DATABASE_URL points at a database whose name contains 'test' (got {name!r})")

gid = env("GOOGLE_CLIENT_ID") or ""
check(gid.endswith(".apps.googleusercontent.com") and len(gid) > 40,
      "GOOGLE_CLIENT_ID looks like a Google web client ID (…apps.googleusercontent.com)")
secret = env("GOOGLE_CLIENT_SECRET") or ""
check(secret.startswith("GOCSPX-"), "GOOGLE_CLIENT_SECRET looks like a Google client secret (starts with GOCSPX-)")

front = (env("FRONTEND_URL") or "http://localhost:5173").rstrip("/")
print("\nRegister these in Google Cloud > Credentials > your OAuth client:")
print(f"  Authorized JavaScript origin: {front}")
print(f"  Authorized redirect URI:      {front}/api/auth/google/callback")

failed = sum(1 for ok, _ in results if not ok)
print(f"\n{len(results) - failed} passed, {failed} failed")
sys.exit(1 if failed else 0)
