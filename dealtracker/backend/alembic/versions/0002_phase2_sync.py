"""add user settings, mediator sync columns, deal mediator snapshot, sync_ops (Phase 2)

Revision ID: 0002
Revises: 0001
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

CURRENT_USER = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"


def upgrade() -> None:
    op.execute(
        f"""
        ALTER TABLE users
          ADD COLUMN alert_days smallint NOT NULL DEFAULT 2 CHECK (alert_days BETWEEN 0 AND 14),
          ADD COLUMN timezone text NOT NULL DEFAULT 'Asia/Kolkata';

        -- client_updated_at: time of the last accepted write, as stated by the writing device
        -- (server time for direct API writes). Last-write-wins compares against this column.
        ALTER TABLE deals ADD COLUMN mediator_name text, ADD COLUMN client_updated_at timestamptz;
        CREATE INDEX ix_deals_user_updated_at ON deals (user_id, updated_at);

        ALTER TABLE mediators
          ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
          ADD COLUMN deleted_at timestamptz,
          ADD COLUMN client_updated_at timestamptz;
        CREATE TRIGGER trg_mediators_updated_at BEFORE UPDATE ON mediators
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        DROP INDEX uq_mediators_user_lower_name;
        CREATE UNIQUE INDEX uq_mediators_user_lower_name ON mediators (user_id, lower(name))
          WHERE deleted_at IS NULL;
        CREATE INDEX ix_mediators_user_updated_at ON mediators (user_id, updated_at);

        -- op_id idempotency for POST /api/sync/push (only applied ops are recorded)
        CREATE TABLE sync_ops (
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          op_id uuid NOT NULL,
          record_id uuid,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, op_id)
        );
        ALTER TABLE sync_ops ENABLE ROW LEVEL SECURITY;
        ALTER TABLE sync_ops FORCE ROW LEVEL SECURITY;
        CREATE POLICY sync_ops_owner_isolation ON sync_ops FOR ALL
          USING (user_id = {CURRENT_USER}) WITH CHECK (user_id = {CURRENT_USER});

        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON sync_ops TO app_user;
          END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS sync_ops;
        DROP INDEX IF EXISTS ix_mediators_user_updated_at;
        DROP INDEX IF EXISTS uq_mediators_user_lower_name;
        CREATE UNIQUE INDEX uq_mediators_user_lower_name ON mediators (user_id, lower(name));
        DROP TRIGGER IF EXISTS trg_mediators_updated_at ON mediators;
        ALTER TABLE mediators DROP COLUMN client_updated_at, DROP COLUMN deleted_at, DROP COLUMN updated_at;
        DROP INDEX IF EXISTS ix_deals_user_updated_at;
        ALTER TABLE deals DROP COLUMN client_updated_at, DROP COLUMN mediator_name;
        ALTER TABLE users DROP COLUMN timezone, DROP COLUMN alert_days;
        """
    )
