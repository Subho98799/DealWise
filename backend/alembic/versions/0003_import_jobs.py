"""add import jobs and deal import ownership (Phase 3)"""
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

CURRENT_USER = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE import_jobs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          import_id uuid NOT NULL,
          filename text,
          status text NOT NULL CHECK (status IN ('committed', 'undone', 'failed')),
          rows_total integer NOT NULL DEFAULT 0 CHECK (rows_total >= 0),
          rows_imported integer NOT NULL DEFAULT 0 CHECK (rows_imported >= 0),
          rows_skipped_duplicate integer NOT NULL DEFAULT 0 CHECK (rows_skipped_duplicate >= 0),
          rows_failed integer NOT NULL DEFAULT 0 CHECK (rows_failed >= 0),
          mediators_created integer NOT NULL DEFAULT 0 CHECK (mediators_created >= 0),
          total_paid numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_paid >= 0),
          total_refund numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_refund >= 0),
          errors jsonb NOT NULL DEFAULT '[]'::jsonb
            CHECK (jsonb_typeof(errors) = 'array' AND jsonb_array_length(errors) <= 1000),
          options jsonb NOT NULL DEFAULT '{{}}'::jsonb CHECK (jsonb_typeof(options) = 'object'),
          created_at timestamptz NOT NULL DEFAULT now(),
          undone_at timestamptz,
          CONSTRAINT uq_import_jobs_id_user UNIQUE (id, user_id),
          CONSTRAINT uq_import_jobs_user_import UNIQUE (user_id, import_id)
        );
        ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
        ALTER TABLE import_jobs FORCE ROW LEVEL SECURITY;
        CREATE POLICY import_jobs_owner_isolation ON import_jobs FOR ALL
          USING (user_id = {CURRENT_USER}) WITH CHECK (user_id = {CURRENT_USER});
        CREATE INDEX ix_import_jobs_user_created_at ON import_jobs (user_id, created_at DESC);

        ALTER TABLE deals ADD COLUMN import_job_id uuid;
        ALTER TABLE deals ADD CONSTRAINT fk_deals_import_job_same_user
          FOREIGN KEY (import_job_id, user_id) REFERENCES import_jobs(id, user_id)
          ON DELETE SET NULL (import_job_id);
        CREATE INDEX ix_deals_user_import_job ON deals (user_id, import_job_id);

        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON import_jobs TO app_user;
          END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS ix_deals_user_import_job;
        ALTER TABLE deals DROP CONSTRAINT IF EXISTS fk_deals_import_job_same_user;
        ALTER TABLE deals DROP COLUMN IF EXISTS import_job_id;
        DROP TABLE IF EXISTS import_jobs;
        """
    )
