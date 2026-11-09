"""Model deal deductions and derive the net refund (Phase 4)."""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        DECLARE
          overpaid_rows bigint;
          other_rows bigint;
        BEGIN
          SELECT count(*) INTO overpaid_rows FROM deals WHERE refund_amount > amount_paid;
          SELECT count(*) INTO other_rows FROM deals WHERE refund_amount <= amount_paid;
          RAISE NOTICE '0004 backfill: % rows had refund_amount > amount_paid; % rows had refund_amount <= amount_paid',
            overpaid_rows, other_rows;
        END
        $$;

        ALTER TABLE deals
          ADD COLUMN less_amount numeric(12,2) NOT NULL DEFAULT 0;
        UPDATE deals
          SET less_amount = GREATEST(amount_paid - refund_amount, 0),
              commission = commission + GREATEST(refund_amount - amount_paid, 0);
        ALTER TABLE deals
          ADD CONSTRAINT ck_deals_less_amount_bounds
          CHECK (less_amount >= 0 AND less_amount <= amount_paid);

        ALTER TABLE deals DROP COLUMN refund_amount;
        ALTER TABLE deals
          ADD COLUMN refund_amount numeric(12,2)
          GENERATED ALWAYS AS (amount_paid - less_amount + commission) STORED;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE deals DROP COLUMN refund_amount;
        ALTER TABLE deals ADD COLUMN refund_amount numeric(12,2) NOT NULL DEFAULT 0;
        -- The separate deduction is folded into the legacy refund; upgrading again cannot recover it.
        UPDATE deals SET refund_amount = amount_paid - less_amount;
        ALTER TABLE deals DROP COLUMN less_amount;
        """
    )
