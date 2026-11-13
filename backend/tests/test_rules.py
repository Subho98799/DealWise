from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app import rules
from app.schemas import DealIn, DealOut
from tests.safety import UnsafeTestDatabase, assert_test_database

T = date(2026, 6, 10)


def ev(rd=None, fd=None, rs="pending", fs="pending", alert=2):
    return rules.evaluate(rs, rd, fs, fd, T, alert)


def test_guard_refuses_non_test_database():
    app = "postgresql://app_user:x@ep-dawn-sky-bezgmz06-pooler.c-9.us-east-2.aws.neon.tech/neondb?sslmode=require"
    with pytest.raises(UnsafeTestDatabase):
        assert_test_database("postgresql://app_user:x@localhost/dealbook")
    with pytest.raises(UnsafeTestDatabase):
        assert_test_database("postgresql+psycopg://app_user:x@ep.neon.tech/neondb?sslmode=require")
    with pytest.raises(UnsafeTestDatabase):
        assert_test_database(app, app)
    with pytest.raises(UnsafeTestDatabase):
        assert_test_database(app.replace("-pooler", ""), app)
    assert_test_database("postgresql://app_user:x@localhost/dealbook_test")
    assert_test_database("postgresql://app_user:x@ep-ancient-moon-bebs0t2g-pooler.c-9.us-east-2.aws.neon.tech/neondb?sslmode=require", app)


@pytest.mark.parametrize("rd,urgent,overdue,reason", [
    (date(2026, 6, 9), True, True, "review_overdue"),     # yesterday
    (date(2026, 6, 10), True, False, "review_due_soon"),  # today
    (date(2026, 6, 11), True, False, "review_due_soon"),  # tomorrow
    (date(2026, 6, 12), True, False, "review_due_soon"),  # today + alert_days (boundary, inclusive)
    (date(2026, 6, 13), False, False, None),              # just outside
    (None, False, False, None),
])
def test_urgency_boundaries(rd, urgent, overdue, reason):
    u = ev(rd=rd)
    assert (u.is_urgent, u.is_overdue, u.reason) == (urgent, overdue, reason)


def test_done_steps_are_never_urgent_and_earliest_deadline_wins():
    assert not ev(rd=date(2026, 6, 1), rs="done").is_urgent
    assert not ev(fd=date(2026, 6, 1), fs="submitted").is_urgent
    u = ev(rd=date(2026, 6, 11), fd=date(2026, 6, 8))
    assert u.reason == "form_overdue" and u.due == date(2026, 6, 8)
    assert ev(rd=T, alert=0).is_urgent and not ev(rd=date(2026, 6, 11), alert=0).is_urgent


def test_today_uses_user_timezone_around_midnight_ist():
    before = datetime(2026, 6, 10, 18, 29, tzinfo=timezone.utc)  # 23:59 IST
    after = datetime(2026, 6, 10, 18, 31, tzinfo=timezone.utc)   # 00:01 IST next day
    assert rules.today_in("Asia/Kolkata", before) == date(2026, 6, 10)
    assert rules.today_in("Asia/Kolkata", after) == date(2026, 6, 11)
    assert rules.today_in("UTC", after) == date(2026, 6, 10)


def test_action_transitions():
    s = {"review_status": "pending", "form_status": "pending", "payment_status": "pending"}
    assert rules.apply_action(s, "review_done", T) == {"review_status": "done"}
    for bad in ("form_submitted", "payment_received", "reopen_review", "reopen_form", "reopen_payment", "nope"):
        with pytest.raises(rules.RuleError):
            rules.apply_action(s, bad, T)
    s = {"review_status": "done", "form_status": "pending", "payment_status": "disputed"}
    assert rules.apply_action(s, "form_submitted", T) == {"form_status": "submitted", "refund_form_filled_on": T}
    s = {"review_status": "done", "form_status": "submitted", "payment_status": "disputed"}
    assert rules.apply_action(s, "reopen_form", T) == {"form_status": "pending", "refund_form_filled_on": None}
    assert rules.apply_action(s, "payment_received", T) == {"payment_status": "received", "payment_received_on": T}
    with pytest.raises(rules.RuleError, match="Reopen the refund form first"):
        rules.apply_action(s, "reopen_review", T)
    done = {**s, "payment_status": "received"}
    assert rules.apply_action(done, "reopen_payment", T) == {"payment_status": "pending", "payment_received_on": None}
    assert rules.is_completed("done", "submitted", "received")


def test_money_is_exact_and_floats_rejected():
    d = DealIn(product="x", amount_paid="0.10", refund_amount="0.20", commission="0")
    assert rules.legacy_refund_values(d.amount_paid, d.refund_amount, d.commission) == (
        Decimal("0.00"), Decimal("0.10"),
    )
    assert rules.net_amount(Decimal("0.10"), Decimal("0.20")) == Decimal("0.10")
    assert DealIn(product="x", amount_paid=1299).amount_paid == Decimal("1299")
    for bad in (12.5, "1.234", "-1", "10000000.01"):
        with pytest.raises(ValidationError):
            DealIn(product="x", amount_paid=bad)
    with pytest.raises(ValidationError):
        DealIn(product="x" * 201)
    with pytest.raises(ValidationError):
        DealIn(product="x", user_id="00000000-0000-0000-0000-000000000000")
    assert DealIn(product="x", amount_paid="10000000.00").amount_paid == Decimal("10000000.00")


def test_less_cannot_exceed_amount_paid():
    with pytest.raises(rules.RuleError, match="Less cannot be more than the amount paid"):
        rules.validate_deal({"amount_paid": Decimal("99.00"), "less_amount": Decimal("100.00")})


def test_money_serializes_as_two_decimal_strings():
    assert DealOut.model_fields["amount_paid"]
    from app.schemas import _money_str
    assert _money_str(Decimal("0")) == "0.00" and _money_str(Decimal("1299.5")) == "1299.50"


def test_deadline_before_date_taken_rejected():
    with pytest.raises(rules.RuleError):
        rules.validate_deal({"date_taken": T, "review_deadline": date(2026, 6, 9)})
    rules.validate_deal({"date_taken": T, "review_deadline": T})


def test_filled_date_requires_submitted_form_and_cannot_precede_purchase():
    with pytest.raises(rules.RuleError, match="requires form_status"):
        rules.validate_deal({"date_taken": T, "form_status": "pending", "refund_form_filled_on": T})
    with pytest.raises(rules.RuleError, match="cannot be before date_taken"):
        rules.validate_deal({"date_taken": T, "form_status": "submitted", "refund_form_filled_on": date(2026, 6, 9)})
    rules.validate_deal({"date_taken": T, "form_status": "submitted", "refund_form_filled_on": T})
