"""Create/refresh the app_user role from scripts/create_app_role.sql. Usage: create_role.py [--test]

Connects as the OWNER (MIGRATION_DATABASE_URL, or TEST_MIGRATION_DATABASE_URL with --test).
The password comes from APP_USER_PASSWORD or an interactive prompt; it is never printed or saved.
"""
import getpass
import sys

import psycopg
from psycopg import sql

from _common import ROOT, env, psycopg_url

var = "TEST_MIGRATION_DATABASE_URL" if "--test" in sys.argv else "MIGRATION_DATABASE_URL"
url = env(var)
if not url:
    sys.exit(f"{var} is not set. Put the OWNER (direct) connection string in backend/.env.")
pw = env("APP_USER_PASSWORD") or getpass.getpass("New password for app_user (input hidden): ")
if len(pw) < 16:
    sys.exit("Use a password of at least 16 characters (Neon rejects weak passwords).")

with psycopg.connect(psycopg_url(url)) as conn:
    literal = sql.Literal(pw).as_string(conn)
    template = (ROOT / "scripts" / "create_app_role.sql").read_text()
    conn.execute(template.replace("'__APP_USER_PASSWORD__'", literal))
print(f"OK: app_user created/updated on the database from {var}. Now use that password in DATABASE_URL.")
