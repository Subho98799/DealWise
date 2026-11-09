from decimal import Decimal

import pytest

from app.rules import legacy_refund_values


@pytest.mark.parametrize(
    ("paid", "old_refund", "old_commission", "less", "commission"),
    [
        ("1100.00", "1000.00", "0.00", "100.00", "0.00"),
        ("1100.00", "1100.00", "0.00", "0.00", "0.00"),
        ("1100.00", "1200.00", "25.00", "0.00", "125.00"),
        ("0.00", "0.00", "0.00", "0.00", "0.00"),
    ],
)
def test_0004_backfill_preserves_old_total(paid, old_refund, old_commission, less, commission):
    amount_paid = Decimal(paid)
    refund_amount = Decimal(old_refund)
    prior_commission = Decimal(old_commission)
    less_amount, adjusted_commission = legacy_refund_values(
        amount_paid, refund_amount, prior_commission,
    )

    assert less_amount == Decimal(less)
    assert adjusted_commission == Decimal(commission)
    assert amount_paid - less_amount + adjusted_commission == refund_amount + prior_commission
