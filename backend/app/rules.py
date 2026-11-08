"""Pure business rules (no I/O). Mirrored in frontend/src/lib/rules.ts; SQL twins live in app/repos/deals.py."""
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from functools import lru_cache
from zoneinfo import ZoneInfo, available_timezones

ACTIONS = ("review_done", "form_submitted", "payment_received", "reopen_review", "reopen_form", "reopen_payment")
STATUSES = ("open", "review_pending", "form_pending", "payment_pending", "completed")


class RuleError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code, self.message = code, message


@lru_cache
def valid_timezones() -> frozenset[str]:
    return frozenset(available_timezones())


def today_in(tz: str, now: datetime) -> date:
    return now.astimezone(ZoneInfo(tz)).date()


@dataclass(frozen=True)
class Urgency:
    is_urgent: bool
    is_overdue: bool
    reason: str | None  # review_overdue | form_overdue | review_due_soon | form_due_soon
    due: date | None


def evaluate(review_status: str, review_deadline: date | None, form_status: str,
             form_deadline: date | None, today: date, alert_days: int) -> Urgency:
    """Urgent: a pending step's deadline <= today + alert_days. Overdue: deadline < today. Overdue implies urgent."""
    horizon = today + timedelta(days=alert_days)
    pending = [(d, kind) for d, kind, st in ((review_deadline, "review", review_status == "pending"),
                                             (form_deadline, "form", form_status == "pending")) if st and d]
    hits = sorted((d, k) for d, k in pending if d <= horizon)
    if not hits:
        return Urgency(False, False, None, None)
    d, kind = hits[0]
    overdue = d < today
    return Urgency(True, overdue, f"{kind}_{'overdue' if overdue else 'due_soon'}", d)


def is_completed(review_status: str, form_status: str, payment_status: str) -> bool:
    return review_status == "done" and form_status == "submitted" and payment_status == "received"


def net_amount(amount_paid, refund_amount, commission):
    return refund_amount + commission - amount_paid


def validate_deal(state: dict) -> None:
    taken = state.get("date_taken")
    for field in ("review_deadline", "refund_form_deadline"):
        d = state.get(field)
        if d and taken and d < taken:
            raise RuleError("validation_error", f"{field} cannot be before date_taken")
    if state.get("payment_received_on") and state.get("payment_status") != "received":
        raise RuleError("validation_error", "payment_received_on requires payment_status 'received'")


def apply_action(state: dict, action: str, today: date, received_on: date | None = None) -> dict:
    """Returns the column changes for a one-tap action, or raises RuleError for an invalid transition."""
    rs, fs, ps = state["review_status"], state["form_status"], state["payment_status"]

    def bad(msg: str):
        raise RuleError("invalid_transition", msg)

    if action == "review_done":
        if rs != "pending":
            bad("Review is already done.")
        return {"review_status": "done"}
    if action == "form_submitted":
        if fs != "pending":
            bad("Refund form is already submitted.")
        if rs != "done":
            bad("Mark the review done before submitting the refund form.")
        return {"form_status": "submitted"}
    if action == "payment_received":
        if ps == "received":
            bad("Payment is already received.")
        if fs != "submitted":
            bad("Submit the refund form before marking payment received.")
        return {"payment_status": "received", "payment_received_on": received_on or today}
    if action == "reopen_review":
        if rs != "done":
            bad("Review is not done.")
        if fs == "submitted":
            bad("Reopen the refund form first.")
        return {"review_status": "pending"}
    if action == "reopen_form":
        if fs != "submitted":
            bad("Refund form is not submitted.")
        if ps == "received":
            bad("Reopen the payment first.")
        return {"form_status": "pending"}
    if action == "reopen_payment":
        if ps != "received":
            bad("Payment is not received.")
        return {"payment_status": "pending", "payment_received_on": None}
    bad(f"Unknown action {action!r}.")
    return {}
