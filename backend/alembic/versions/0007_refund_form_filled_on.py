"""Record the date the refund form was actually filled and sent."""
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE deals ADD COLUMN refund_form_filled_on date;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE deals DROP COLUMN refund_form_filled_on;")
