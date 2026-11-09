"""Pure parsing and validation for spreadsheet import cells."""
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_FLOOR, ROUND_HALF_UP
from typing import Any, Mapping

from app.rules import legacy_refund_values


MAX_MONEY = Decimal("10000000")
CENT = Decimal("0.01")
TEXT_LIMITS = {"product": 200, "platform": 100, "mediator": 100, "notes": 2000}
PLATFORMS = ("Amazon", "Flipkart", "Myntra", "Meesho", "Ajio", "Nykaa")
STATUS_VALUES = {
    "review_status": {"pending", "done"},
    "form_status": {"pending", "submitted"},
    "payment_status": {"pending", "received", "disputed"},
}
_KNOWN_PLATFORMS = {name.casefold(): name for name in PLATFORMS}
_CURRENCY_PREFIX = re.compile(r"^(?:₹|â‚¹|rs\.?|inr)\s*", re.IGNORECASE)
_NUMERIC_DATE = re.compile(r"^(\d{1,2})([/.-])(\d{1,2})\2(\d{2}|\d{4})$")
_SERIAL = re.compile(r"^(?:\d+(?:\.\d*)?|\.\d+)$")
_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7,
    "july": 7, "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


@dataclass(frozen=True)
class RowNormalization:
    values: dict[str, Any]
    errors: list[dict[str, str]]
    warnings: list[dict[str, str]]
    unrecognized_statuses: dict[str, str]
    ambiguous_dates: dict[str, str]


def _clean_text(value: Any) -> str:
    raw = "" if value is None else str(value)
    cleaned = "".join(
        " " if unicodedata.category(char) == "Cc" and char.isspace()
        else "" if unicodedata.category(char).startswith("C")
        else char
        for char in raw
    )
    return re.sub(r"\s+", " ", cleaned).strip()


def normalize_text(field: str, value: Any) -> tuple[str | None, str | None]:
    """Trim, collapse whitespace, remove controls, and report over-length text."""
    cleaned = _clean_text(value)
    if not cleaned:
        return None, None
    limit = TEXT_LIMITS.get(field)
    if limit is not None and len(cleaned) > limit:
        return cleaned, f"{field} must be at most {limit} characters"
    if field == "platform":
        cleaned = _KNOWN_PLATFORMS.get(cleaned.casefold(), cleaned)
    return cleaned, None


def parse_money(value: Any, *, required: bool = False) -> Decimal:
    """Parse rupee values exactly, round half up to paise, and enforce the deal limit."""
    raw = _clean_text(value)
    if not raw:
        if required:
            raise ValueError("amount is required")
        return Decimal("0.00")

    parenthesized = raw.startswith("(") and raw.endswith(")")
    if raw.startswith("(") != raw.endswith(")"):
        raise ValueError("amount must be a number")
    if parenthesized:
        raw = raw[1:-1].strip()
    raw = _CURRENCY_PREFIX.sub("", raw.strip())
    raw = re.sub(r"/-\s*$", "", raw).strip()
    raw = raw.replace(" ", "").replace(",", "")
    if not raw or not re.fullmatch(r"(?:\d+(?:\.\d*)?|\.\d+)", raw):
        raise ValueError("amount must be a non-negative number")
    try:
        amount = Decimal(raw)
    except InvalidOperation:
        raise ValueError("amount must be a non-negative number") from None
    if amount < 0:
        raise ValueError("amount cannot be negative")
    if amount > MAX_MONEY:
        raise ValueError("amount cannot exceed 10000000")
    rounded = amount.quantize(CENT, rounding=ROUND_HALF_UP)
    if rounded > MAX_MONEY:
        raise ValueError("amount cannot exceed 10000000")
    return rounded


def _expand_year(year_text: str) -> int:
    year = int(year_text)
    if len(year_text) == 2:
        return 2000 + year if year <= 69 else 1900 + year
    return year


def _month_date(day: int, month_text: str, year_text: str) -> date:
    month = _MONTHS.get(month_text.casefold())
    if month is None:
        raise ValueError("date has an unknown month")
    return date(_expand_year(year_text), month, day)


def parse_date(value: Any, date_order: str = "dmy") -> tuple[date, bool]:
    """Parse supported dates; return (date, ambiguous_numeric_order)."""
    if date_order not in {"dmy", "mdy"}:
        raise ValueError("date order must be dmy or mdy")
    raw = _clean_text(value)
    if not raw:
        raise ValueError("date is required")

    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        try:
            return date.fromisoformat(raw), False
        except ValueError:
            raise ValueError("date is impossible") from None

    numeric = _NUMERIC_DATE.fullmatch(raw)
    if numeric:
        first, _, second, year_text = numeric.groups()
        first, second = int(first), int(second)
        ambiguous = first <= 12 and second <= 12 and first != second
        day, month = (first, second) if date_order == "dmy" else (second, first)
        try:
            return date(_expand_year(year_text), month, day), ambiguous
        except ValueError:
            raise ValueError("date is impossible") from None

    # Excel's 1900 system includes the nonexistent 1900-02-29 at serial 60.
    if _SERIAL.fullmatch(raw):
        serial = Decimal(raw)
        day_number = int(serial.to_integral_value(rounding=ROUND_FLOOR))
        if day_number == 60:
            raise ValueError("Excel serial 60 is the nonexistent date 1900-02-29")
        if day_number < 0:
            raise ValueError("Excel serial date cannot be negative")
        base = date(1899, 12, 31) if day_number < 60 else date(1899, 12, 30)
        try:
            return base + timedelta(days=day_number), False
        except OverflowError:
            raise ValueError("Excel serial date is out of range") from None

    month_patterns = (
        r"^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2}|\d{4})$",
        r"^(\d{1,2})-([A-Za-z]+)-(\d{2}|\d{4})$",
        r"^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{2}|\d{4})$",
    )
    for pattern in month_patterns:
        match = re.fullmatch(pattern, raw)
        if match:
            first, month_text, year_text = match.groups()
            if first.isalpha():
                month_text, first = first, month_text
            try:
                return _month_date(int(first), month_text, year_text), False
            except ValueError:
                raise ValueError("date is impossible or unrecognized") from None
    raise ValueError("date format is not recognized")


def normalize_status(field: str, value: Any, value_maps: Mapping[str, Any] | None = None) -> str:
    """Return an allowed field status or 'unrecognized' for a value needing user mapping."""
    if field not in STATUS_VALUES:
        raise ValueError("unknown status field")
    raw_untrimmed = "" if value is None else str(value).strip().casefold()
    if raw_untrimmed in {"❌", "âŒ".casefold()}:
        return "pending"
    raw = _clean_text(value)
    if not raw:
        return "pending"
    key = raw.casefold()
    compact = re.sub(r"\s+", "", key)
    emoji_tolerant = _status_key(raw)
    pending = {"pending", "no", "n", "false", "waiting", "notyet", "âŒ".casefold()}
    complete = {
        "done", "yes", "y", "true", "reviewed", "posted", "submitted", "received",
        "paid", "refunded", "completed", "✓", "✅", "âœ“", "âœ…",
    }
    if key in pending or compact in pending or emoji_tolerant in pending:
        return "pending"
    if key in complete or compact in complete or emoji_tolerant in complete:
        return {"review_status": "done", "form_status": "submitted", "payment_status": "received"}[field]
    if field == "payment_status" and key == "disputed":
        return "disputed"

    if value_maps:
        field_maps = value_maps.get(field, value_maps)
        if isinstance(field_maps, Mapping):
            for source, target in field_maps.items():
                if _status_key(source) == _status_key(raw) and target in STATUS_VALUES[field]:
                    return target
    return "unrecognized"


def _status_key(value: Any) -> str:
    raw = str(value).casefold().strip()
    if raw in {"âœ“", "âœ…", "âŒ".casefold()}:
        return raw
    # Keep letters and digits, ignoring emoji and other symbol marks around a status.
    return "".join(char for char in raw if unicodedata.category(char)[0] in {"L", "N"})


def _default_status(defaults: Mapping[str, Any], field: str) -> Any:
    statuses = defaults.get("statuses", {})
    if isinstance(statuses, Mapping) and field in statuses:
        return statuses[field]
    return defaults.get(field)


def _five_years_before(day: date) -> date:
    try:
        return day.replace(year=day.year - 5)
    except ValueError:
        return day.replace(year=day.year - 5, day=28)


def normalize_import_row(
    row: Mapping[str, Any],
    *,
    date_order: str = "dmy",
    value_maps: Mapping[str, Any] | None = None,
    defaults: Mapping[str, Any] | None = None,
    today: date | None = None,
) -> RowNormalization:
    """Convert one target-field-keyed row into deal values and row-local diagnostics."""
    defaults = defaults or {}
    today = today or date.today()
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    unrecognized: dict[str, str] = {}
    ambiguous: dict[str, str] = {}
    values: dict[str, Any] = {}

    def issue(field: str, reason: str, *, warning: bool = False) -> None:
        (warnings if warning else errors).append({"field": field, "reason": reason})

    def text_field(field: str, source: str | None = None, default: Any = None) -> str | None:
        raw = row.get(source or field)
        if not _clean_text(raw):
            raw = default
        value, error = normalize_text(field, raw)
        if error:
            issue(field, error)
        return value

    values["product"] = text_field("product")
    if not values["product"]:
        issue("product", "product is required")
    values["platform"] = text_field("platform", default=defaults.get("platform"))
    values["mediator_name"] = text_field("mediator", source="mediator", default=defaults.get("mediator"))
    values["notes"] = text_field("notes")

    raw_deal_type = row.get("deal_type")
    if not _clean_text(raw_deal_type):
        raw_deal_type = defaults.get("deal_type")
    deal_type_text = _clean_text(raw_deal_type).casefold().replace("_", " ").replace("-", " ")
    values["deal_type"] = {
        "review": "review", "rating": "rating_only", "rating only": "rating_only",
        "photo review": "review_photo", "review photo": "review_photo", "photo": "review_photo",
        "video review": "review_video", "review video": "review_video", "video": "review_video",
        "other": "other",
    }.get(deal_type_text, "review")

    for field in ("amount_paid", "commission"):
        try:
            values[field] = parse_money(row.get(field), required=field == "amount_paid")
        except ValueError as exc:
            values[field] = None
            issue(field, str(exc))

    less_mapped = "less_amount" in row
    try:
        values["less_amount"] = parse_money(row.get("less_amount")) if less_mapped else Decimal("0.00")
    except ValueError as exc:
        values["less_amount"] = None
        issue("less_amount", str(exc))
    legacy_refund = None
    if "refund_amount" in row:
        try:
            legacy_refund = parse_money(row.get("refund_amount"))
        except ValueError as exc:
            issue("refund_amount", str(exc))

    paid = values.get("amount_paid")
    commission = values.get("commission")
    less_amount = values.get("less_amount")
    if less_mapped:
        if legacy_refund is not None and paid is not None and less_amount is not None and commission is not None:
            calculated = paid - less_amount + commission
            if calculated != legacy_refund:
                issue(
                    "refund_amount",
                    f"Mapped Less is used; its net refund is {calculated:.2f}, not {legacy_refund:.2f}.",
                    warning=True,
                )
    elif legacy_refund is not None and paid is not None and commission is not None:
        less_amount, commission = legacy_refund_values(paid, legacy_refund, commission)
        values["less_amount"] = less_amount
        values["commission"] = commission
        issue(
            "refund_amount",
            f"Legacy refund converted: Less = max(Paid - Refund, 0) = {less_amount:.2f}; "
            "any excess was added to Commission.",
            warning=True,
        )

    if paid is not None and values.get("less_amount") is not None and values.get("commission") is not None:
        if values["less_amount"] > paid:
            issue("less_amount", "Less cannot be more than the amount paid.")
            values["refund_amount"] = None
        else:
            values["refund_amount"] = paid - values["less_amount"] + values["commission"]
    else:
        values["refund_amount"] = None

    date_fields = ("date_taken", "review_deadline", "refund_form_deadline", "payment_received_on")
    for field in date_fields:
        raw = row.get(field)
        if field == "date_taken" and not _clean_text(raw):
            raw = defaults.get("date_taken")
        if not _clean_text(raw):
            values[field] = None
            if field == "date_taken":
                issue(field, "date_taken is required or a default date must be chosen")
            continue
        try:
            parsed, is_ambiguous = parse_date(raw, date_order)
            values[field] = parsed
            if is_ambiguous:
                ambiguous[field] = parsed.isoformat()
                issue(field, f"ambiguous date interpreted as {date_order.upper()}", warning=True)
        except ValueError as exc:
            values[field] = None
            issue(field, str(exc))

    for field in STATUS_VALUES:
        raw = row.get(field)
        if not _clean_text(raw):
            raw = _default_status(defaults, field)
        status = normalize_status(field, raw, value_maps)
        values[field] = status
        if status == "unrecognized":
            value = _clean_text(raw)
            unrecognized[field] = value
            issue(field, "status value needs a mapping")

    taken = values.get("date_taken")
    if taken:
        for field in ("review_deadline", "refund_form_deadline"):
            deadline = values.get(field)
            if deadline and deadline < taken:
                issue(field, f"{field} cannot be before date_taken")
        if taken > today:
            issue("date_taken", "date is in the future", warning=True)
        if taken < _five_years_before(today):
            issue("date_taken", "date is more than five years old", warning=True)
    if values.get("refund_amount") == Decimal("0.00"):
        issue("refund_amount", "net refund is zero", warning=True)

    return RowNormalization(values, errors, warnings, unrecognized, ambiguous)
