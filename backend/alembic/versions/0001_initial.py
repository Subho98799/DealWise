"""initial schema: users, sessions, mediators, deals + row-level security

Revision ID: 0001
Revises:
Create Date: 2026-06-01
"""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

CURRENT_USER = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"


def _rls(table: str) -> str:
    return f"""
    ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
    CREATE POLICY {table}_owner_isolation ON {table}
      FOR ALL
      USING (user_id = {CURRENT_USER})
      WITH CHECK (user_id = {CURRENT_USER});
    """


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE users (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          google_sub text NOT NULL UNIQUE,
          email text NOT NULL,
          name text,
          avatar_url text,
          role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
          created_at timestamptz NOT NULL DEFAULT now(),
          last_active_at timestamptz
        );

        CREATE TABLE sessions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash text NOT NULL UNIQUE,
          created_at timestamptz NOT NULL DEFAULT now(),
          expires_at timestamptz NOT NULL,
          last_seen_at timestamptz,
          user_agent text
        );
        CREATE INDEX ix_sessions_user_id ON sessions (user_id);
        CREATE INDEX ix_sessions_expires_at ON sessions (expires_at);

        CREATE TABLE mediators (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name text NOT NULL CHECK (btrim(name) <> ''),
          contact text,
          created_at timestamptz NOT NULL DEFAULT now(),
          -- target of the composite FK from deals, so a deal can only point at its owner's mediator
          CONSTRAINT uq_mediators_id_user UNIQUE (id, user_id)
        );
        CREATE UNIQUE INDEX uq_mediators_user_lower_name ON mediators (user_id, lower(name));

        CREATE TABLE deals (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          client_id uuid,
          product text NOT NULL,
          platform text,
          mediator_id uuid,
          deal_type text NOT NULL DEFAULT 'review'
            CHECK (deal_type IN ('review', 'rating_only', 'review_photo', 'review_video', 'other')),
          date_taken date NOT NULL,
          amount_paid numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
          refund_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
          commission numeric(12,2) NOT NULL DEFAULT 0 CHECK (commission >= 0),
          review_deadline date,
          refund_form_deadline date,
          review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'done')),
          form_status text NOT NULL DEFAULT 'pending' CHECK (form_status IN ('pending', 'submitted')),
          payment_status text NOT NULL DEFAULT 'pending'
            CHECK (payment_status IN ('pending', 'received', 'disputed')),
          payment_received_on date,
          notes text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          deleted_at timestamptz,
          CONSTRAINT fk_deals_mediator_same_user FOREIGN KEY (mediator_id, user_id)
            REFERENCES mediators (id, user_id) ON DELETE SET NULL (mediator_id)
        );
        CREATE INDEX ix_deals_user_payment_status ON deals (user_id, payment_status);
        CREATE INDEX ix_deals_user_review_deadline_pending ON deals (user_id, review_deadline)
          WHERE review_status = 'pending';
        CREATE INDEX ix_deals_user_form_deadline_pending ON deals (user_id, refund_form_deadline)
          WHERE form_status = 'pending';
        CREATE INDEX ix_deals_user_date_taken ON deals (user_id, date_taken DESC);
        CREATE UNIQUE INDEX uq_deals_user_client_id ON deals (user_id, client_id)
          WHERE client_id IS NOT NULL;
        CREATE INDEX ix_deals_mediator ON deals (mediator_id) WHERE mediator_id IS NOT NULL;

        CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          NEW.updated_at = now();
          RETURN NEW;
        END
        $$;
        CREATE TRIGGER trg_deals_updated_at BEFORE UPDATE ON deals
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        """
    )
    op.execute(_rls("mediators"))
    op.execute(_rls("deals"))
    # Belt and braces: also grant explicitly in case default privileges were set by another role.
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, mediators, deals TO app_user;
          END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS deals;
        DROP TABLE IF EXISTS mediators;
        DROP TABLE IF EXISTS sessions;
        DROP TABLE IF EXISTS users;
        DROP FUNCTION IF EXISTS set_updated_at();
        """
    )
