"""Deal/mediator use-cases on top of the repos. Raises AppError; never touches tables directly."""
import uuid
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import clock, rules
from app.auth.deps import CurrentUser
from app.errors import AppError
from app.models import Deal, Mediator
from app.repos import DealRepo, MediatorRepo
from app.schemas import DealIn, DealOut, DealPatch, MediatorIn, MediatorPatch

COMPUTED = ("net_amount", "is_urgent", "is_overdue", "urgency_reason")
STATE_FIELDS = ("date_taken", "review_deadline", "refund_form_deadline", "payment_status", "payment_received_on")


@dataclass(frozen=True)
class Ctx:
    today: date
    alert_days: int

    @classmethod
    def of(cls, user: CurrentUser) -> "Ctx":
        return cls(rules.today_in(user.timezone, clock.now()), user.alert_days)


def present(deal: Deal, ctx: Ctx) -> DealOut:
    u = rules.evaluate(deal.review_status, deal.review_deadline, deal.form_status,
                       deal.refund_form_deadline, ctx.today, ctx.alert_days)
    base = {k: getattr(deal, k) for k in DealOut.model_fields if k not in COMPUTED}
    return DealOut(
        **base,
        net_amount=rules.net_amount(deal.amount_paid, deal.refund_amount, deal.commission),
        is_urgent=u.is_urgent, is_overdue=u.is_overdue, urgency_reason=u.reason,
    )


def _rule(fn, *args):
    try:
        return fn(*args)
    except rules.RuleError as e:
        raise AppError(422 if e.code == "validation_error" else 409, e.code, e.message) from None


def _resolve_mediator(meds: MediatorRepo, mediator_id, mediator_name) -> Mediator | None:
    if mediator_id:
        m = meds.get(mediator_id)
        if m:
            return m
        if not mediator_name:
            raise AppError(422, "mediator_not_found", "That mediator does not exist.")
    if mediator_name:
        return meds.find_by_name(mediator_name) or meds.create(mediator_name.strip())
    return None


def create_deal(s: Session, data: DealIn, ctx: Ctx, id: uuid.UUID | None = None,
                written_at: datetime | None = None) -> tuple[Deal, bool]:
    deals, meds = DealRepo(s), MediatorRepo(s)
    if data.client_id:
        existing = deals.get_by_client_id(data.client_id)
        if existing:
            return existing, False
    values = data.model_dump(exclude_none=True, exclude={"mediator_name", "mediator_id"})
    values.setdefault("date_taken", ctx.today)
    m = _resolve_mediator(meds, data.mediator_id, data.mediator_name)
    if m:
        values.update(mediator_id=m.id, mediator_name=m.name)
    _rule(rules.validate_deal, values)
    values["client_updated_at"] = written_at or clock.now()
    if id:
        values["id"] = id
    try:
        with s.begin_nested():
            deal = deals.create(values)
    except IntegrityError:
        raise AppError(409, "id_conflict", "A record with this id already exists.") from None
    if deal is None:  # lost a race on the same client_id
        return deals.get_by_client_id(data.client_id), False
    return deal, True


def update_deal(s: Session, deal: Deal, patch: DealPatch, written_at: datetime | None = None) -> Deal:
    deals, meds = DealRepo(s), MediatorRepo(s)
    changes = {k: getattr(patch, k) for k in patch.model_fields_set if k not in ("mediator_id", "mediator_name")}
    if "product" in changes and not changes["product"]:
        raise AppError(422, "validation_error", "product is required")
    for k in ("deal_type", "date_taken", "amount_paid", "refund_amount", "commission",
              "review_status", "form_status", "payment_status"):
        if k in changes and changes[k] is None:
            raise AppError(422, "validation_error", f"{k} cannot be null")
    if {"mediator_id", "mediator_name"} & patch.model_fields_set:
        m = _resolve_mediator(meds, patch.mediator_id, patch.mediator_name)
        changes.update(mediator_id=m.id if m else None, mediator_name=m.name if m else None)
    if changes.get("payment_status") and changes["payment_status"] != "received":
        changes.setdefault("payment_received_on", None)
    merged = {k: changes.get(k, getattr(deal, k)) for k in STATE_FIELDS}
    _rule(rules.validate_deal, merged)
    return deals.update(deal.id, {**changes, "client_updated_at": written_at or clock.now()})


def deal_action(s: Session, deal: Deal, action: str, ctx: Ctx, received_on: date | None) -> Deal:
    state = {k: getattr(deal, k) for k in ("review_status", "form_status", "payment_status")}
    changes = _rule(rules.apply_action, state, action, ctx.today, received_on)
    return DealRepo(s).update(deal.id, {**changes, "client_updated_at": clock.now()})


def create_mediator(s: Session, data: MediatorIn, id: uuid.UUID | None = None,
                    written_at: datetime | None = None) -> Mediator:
    meds = MediatorRepo(s)
    if meds.find_by_name(data.name):
        raise AppError(409, "name_exists", f"A mediator named {data.name!r} already exists.")
    try:
        with s.begin_nested():
            return meds.create(data.name, data.contact, id, written_at or clock.now())
    except IntegrityError:
        raise AppError(409, "id_conflict", "A record with this id already exists.") from None


def update_mediator(s: Session, m: Mediator, patch: MediatorPatch, written_at: datetime | None = None) -> Mediator:
    meds = MediatorRepo(s)
    changes = {k: getattr(patch, k) for k in patch.model_fields_set}
    if "name" in changes:
        if not changes["name"]:
            raise AppError(422, "validation_error", "name is required")
        other = meds.find_by_name(changes["name"])
        if other and other.id != m.id:
            raise AppError(409, "name_exists", f"A mediator named {changes['name']!r} already exists.")
    updated = meds.update(m.id, {**changes, "client_updated_at": written_at or clock.now()})
    if "name" in changes:
        DealRepo(s).rename_mediator(m.id, changes["name"])
    return updated


def delete_deal(s: Session, deal: Deal, written_at: datetime | None = None) -> None:
    DealRepo(s).update(deal.id, {"deleted_at": clock.now(), "client_updated_at": written_at or clock.now()})


def delete_mediator(s: Session, m: Mediator, written_at: datetime | None = None) -> None:
    MediatorRepo(s).update(m.id, {"deleted_at": clock.now(), "client_updated_at": written_at or clock.now()})
