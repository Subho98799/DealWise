import uuid

from sqlalchemy import text


TABLES = ("users", "sessions", "mediators", "deals", "sync_ops", "import_jobs")
REQUIRED_PRIVILEGES = ("SELECT", "INSERT", "UPDATE", "DELETE")
FORBIDDEN_PRIVILEGES = ("TRUNCATE", "REFERENCES", "TRIGGER")


def test_app_user_has_only_explicit_dml_table_privileges(app_engine):
    with app_engine.connect() as connection:
        assert not connection.execute(
            text("SELECT has_table_privilege('app_user', 'alembic_version', 'SELECT')")
        ).scalar_one()
        for table in TABLES:
            for privilege in REQUIRED_PRIVILEGES:
                allowed = connection.execute(
                    text("SELECT has_table_privilege('app_user', :table, :privilege)"),
                    {"table": table, "privilege": privilege},
                ).scalar_one()
                assert allowed, (table, privilege)
            for privilege in FORBIDDEN_PRIVILEGES:
                allowed = connection.execute(
                    text("SELECT has_table_privilege('app_user', :table, :privilege)"),
                    {"table": table, "privilege": privilege},
                ).scalar_one()
                assert not allowed, (table, privilege)


def test_per_request_transaction_applies_local_database_timeouts(app_session_factory):
    from app.db import set_user_context

    with app_session_factory() as session, session.begin():
        set_user_context(session, uuid.uuid4())
        timeouts = session.execute(text(
            "SELECT current_setting('statement_timeout'), "
            "current_setting('idle_in_transaction_session_timeout')"
        )).one()
    assert timeouts == ("15s", "30s")
