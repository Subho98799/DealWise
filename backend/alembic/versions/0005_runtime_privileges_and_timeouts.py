"""Restrict app_user table grants and set runtime database timeouts."""
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
            REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM app_user;
            EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM app_user';
            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
              users, sessions, mediators, deals, sync_ops, import_jobs TO app_user;
            EXECUTE 'ALTER ROLE app_user SET statement_timeout = ''15s''';
            EXECUTE 'ALTER ROLE app_user SET idle_in_transaction_session_timeout = ''30s''';
          END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
            EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user';
            EXECUTE 'ALTER ROLE app_user RESET statement_timeout';
            EXECUTE 'ALTER ROLE app_user RESET idle_in_transaction_session_timeout';
          END IF;
        END
        $$;
        """
    )
