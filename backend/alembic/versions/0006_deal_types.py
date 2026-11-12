"""Add only-order and negative-review deal types."""
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE deals DROP CONSTRAINT deals_deal_type_check;
        ALTER TABLE deals ADD CONSTRAINT deals_deal_type_check
          CHECK (deal_type IN (
            'review', 'rating_only', 'review_photo', 'review_video',
            'only_order', 'negative_review', 'other'
          ));
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE deals SET deal_type = 'other'
          WHERE deal_type IN ('only_order', 'negative_review');
        ALTER TABLE deals DROP CONSTRAINT deals_deal_type_check;
        ALTER TABLE deals ADD CONSTRAINT deals_deal_type_check
          CHECK (deal_type IN ('review', 'rating_only', 'review_photo', 'review_video', 'other'));
        """
    )
