from datetime import date
from decimal import Decimal

import pytest

from app.import_normalization import normalize_import_row, normalize_status, parse_date, parse_money


@pytest.mark.parametrize(("raw", "expected"), [
    ("â‚¹1,299", "1299.00"),
    ("Rs. 1299/-", "1299.00"),
    ("Rs1,299.50", "1299.50"),
    ("1,29,900", "129900.00"),
    ("1299.00", "1299.00"),
    ("(500)", "500.00"),
    ("  ₹  1,299.995  ", "1300.00"),
    ("10000000", "10000000.00"),
])
def test_indian_money_formats_and_half_up(raw, expected):
    assert parse_money(raw) == Decimal(expected)


@pytest.mark.parametrize("raw", ["abc", "-1", "( -500 )", "10000000.01", "Rs. 12x", "--5"])
def test_money_rejects_text_negative_and_over_limit(raw):
    with pytest.raises(ValueError):
        parse_money(raw)


def test_money_blank_required_and_optional():
    assert parse_money("") == Decimal("0.00")
    with pytest.raises(ValueError, match="required"):
        parse_money("", required=True)


@pytest.mark.parametrize(("serial", "expected"), [
    ("1", date(1900, 1, 1)),
    ("59", date(1900, 2, 28)),
    ("61", date(1900, 3, 1)),
    ("46238.75", date(2026, 8, 4)),
])
def test_excel_1900_serial_dates(serial, expected):
    assert parse_date(serial)[0] == expected


def test_excel_leap_year_quirk_rejects_nonexistent_february_29():
    with pytest.raises(ValueError, match="nonexistent"):
        parse_date("60")


def test_day_first_month_first_and_ambiguous_flag():
    day_first, ambiguous = parse_date("08/11/2026", "dmy")
    month_first, also_ambiguous = parse_date("08/11/2026", "mdy")
    assert day_first == date(2026, 11, 8) and ambiguous
    assert month_first == date(2026, 8, 11) and also_ambiguous


@pytest.mark.parametrize(("raw", "expected"), [
    ("2026-11-08", date(2026, 11, 8)),
    ("8/11/2026", date(2026, 11, 8)),
    ("8-11-26", date(2026, 11, 8)),
    ("8.11.2026", date(2026, 11, 8)),
    ("8 Nov 2026", date(2026, 11, 8)),
    ("8-Nov-26", date(2026, 11, 8)),
    ("November 8, 2026", date(2026, 11, 8)),
])
def test_supported_date_formats(raw, expected):
    assert parse_date(raw)[0] == expected


@pytest.mark.parametrize(("raw", "expected"), [("01/02/69", date(2069, 2, 1)), ("01/02/70", date(1970, 2, 1))])
def test_two_digit_year_pivot(raw, expected):
    assert parse_date(raw)[0] == expected


@pytest.mark.parametrize("raw", ["31/04/2026", "2026-02-29", "32-Nov-26", "not a date"])
def test_impossible_and_unrecognized_dates_fail(raw):
    with pytest.raises(ValueError):
        parse_date(raw)


@pytest.mark.parametrize("field", ["review_status", "form_status", "payment_status"])
@pytest.mark.parametrize("raw", ["done", " YES ", "y", "true", "reviewed", "posted", "submitted", "received", "paid", "refunded", "completed", "✓", "✅", "✅ Done", "âœ“", "âœ…"])
def test_complete_status_synonyms_map_by_field(field, raw):
    expected = {"review_status": "done", "form_status": "submitted", "payment_status": "received"}[field]
    assert normalize_status(field, raw) == expected


@pytest.mark.parametrize("raw", ["pending", "no", "n", "false", "waiting", "not yet", "", "❌", "âŒ"])
def test_pending_status_synonyms(raw):
    assert all(normalize_status(field, raw) == "pending" for field in ("review_status", "form_status", "payment_status"))


def test_disputed_is_payment_only_and_unknown_status_can_be_mapped():
    assert normalize_status("payment_status", "Disputed") == "disputed"
    assert normalize_status("review_status", "disputed") == "unrecognized"
    assert normalize_status("review_status", "seller waiting", {"review_status": {"Seller Waiting": "done"}}) == "done"


@pytest.mark.parametrize(("raw", "expected"), [
    ("review", "review"), ("rating", "rating_only"), ("rating only", "rating_only"),
    ("photo review", "review_photo"), ("video review", "review_video"), ("other", "other"),
    ("custom label", "review"),
])
def test_deal_type_mapping_and_default(raw, expected):
    row = normalize_import_row({"product": "x", "amount_paid": "1", "date_taken": "2026-11-08", "deal_type": raw})
    assert row.values["deal_type"] == expected


def test_text_cleanup_platform_case_and_length_limit():
    row = normalize_import_row({
        "product": "  Mixer\t  500W\x00 ", "platform": "aMaZoN", "mediator": "  Ravi  Kumar ",
        "amount_paid": "1,299", "date_taken": "2026-11-08", "notes": "hello",
    }, today=date(2026, 11, 8))
    assert row.values["product"] == "Mixer 500W"
    assert row.values["platform"] == "Amazon"
    assert row.values["mediator_name"] == "Ravi Kumar"
    assert row.values["notes"] == "hello"
    unknown_platform = normalize_import_row({"product": "x", "platform": "  Other Market ", "amount_paid": "1", "date_taken": "2026-11-08"})
    assert unknown_platform.values["platform"] == "Other Market"
    too_long = normalize_import_row({"product": "x" * 201, "amount_paid": "1", "date_taken": "2026-11-08"})
    assert any(error["field"] == "product" and "200" in error["reason"] for error in too_long.errors)
    long_notes = normalize_import_row({"product": "x", "amount_paid": "1", "date_taken": "2026-11-08", "notes": "n" * 2001})
    assert any(error["field"] == "notes" and "2000" in error["reason"] for error in long_notes.errors)
    long_platform = normalize_import_row({"product": "x", "platform": "p" * 101, "amount_paid": "1", "date_taken": "2026-11-08"})
    long_mediator = normalize_import_row({"product": "x", "mediator": "m" * 101, "amount_paid": "1", "date_taken": "2026-11-08"})
    assert any(error["field"] == "platform" for error in long_platform.errors)
    assert any(error["field"] == "mediator" for error in long_mediator.errors)


def test_unmapped_or_blank_date_requires_default():
    row = normalize_import_row({"product": "x", "amount_paid": "1"})
    assert row.values["date_taken"] is None
    assert any(error["field"] == "date_taken" for error in row.errors)


def test_default_date_statuses_deal_type_and_warnings():
    row = normalize_import_row({
        "product": "Camera", "amount_paid": "200", "refund_amount": "100",
        "deal_type": "photo review", "review_status": "Awaiting seller",
    }, defaults={"date_taken": "2026-11-08", "statuses": {"form_status": "submitted"}}, today=date(2026, 11, 8))
    assert row.values["date_taken"] == date(2026, 11, 8)
    assert row.values["deal_type"] == "review_photo"
    assert row.values["form_status"] == "submitted"
    assert row.unrecognized_statuses == {"review_status": "Awaiting seller"}
    assert any(error["field"] == "review_status" for error in row.errors)
    assert any(warning["field"] == "refund_amount" for warning in row.warnings)
    zero_refund = normalize_import_row({"product": "x", "amount_paid": "1", "date_taken": "2026-11-08"}, today=date(2026, 11, 8))
    assert any("zero" in warning["reason"] for warning in zero_refund.warnings)


def test_deadline_before_taken_future_and_old_dates_are_diagnostics():
    before = normalize_import_row({"product": "x", "amount_paid": "1", "date_taken": "2026-11-08", "review_deadline": "2026-11-07"}, today=date(2026, 11, 8))
    assert any(error["field"] == "review_deadline" for error in before.errors)
    future = normalize_import_row({"product": "x", "amount_paid": "1", "date_taken": "2026-11-09"}, today=date(2026, 11, 8))
    old = normalize_import_row({"product": "x", "amount_paid": "1", "date_taken": "2020-11-07"}, today=date(2026, 11, 8))
    assert any("future" in warning["reason"] for warning in future.warnings)
    assert any("five years" in warning["reason"] for warning in old.warnings)
