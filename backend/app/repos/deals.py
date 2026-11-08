from __future__ import annotations

import base64
import json
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import Date, and_, case, cast, func, literal, or_, select, tuple_, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import Deal
from app.repos.base import CURRENT_USER_ID

OWN = Deal.user_id == CURRENT_USER_ID
ACTIVE = Deal.deleted_at.is_(None)
FAR = cast(literal("9999-12-31"), Date)

# SQL twins of app/rules.py (keep in sync; tests compare them).
COMPLETED = and_(Deal.review_status == "done", Deal.form_status == "submitted",
                 Deal.payment_status == "received")
def _pending_deadline():
    review = case((Deal.review_status == "pending", Deal.review_deadline))
    form = case((Deal.form_status == "pending", Deal.refund_form_deadline))
    return func.coalesce(func.least(review, form), FAR)


NEXT_DEADLINE = _pending_deadline()

STATUS_FILTERS = {
    "open": ~COMPLETED,
    "review_pending": Deal.review_status == "pending",
    "form_pending": Deal.form_status == "pending",
    "payment_pending": Deal.payment_status != "received",
    "completed": COMPLETED,
}


def urgent_expr(today: date, alert_days: int):
    horizon = today + timedelta(days=alert_days)
    return or_(and_(Deal.review_status == "pending", Deal.review_deadline <= horizon),
               and_(Deal.form_status == "pending", Deal.refund_form_deadline <= horizon))


def overdue_expr(today: date):
    return or_(and_(Deal.review_status == "pending", Deal.review_deadline < today),
               and_(Deal.form_status == "pending", Deal.refund_form_deadline < today))


# sort -> (key columns, descending?, parsers for cursor values)
SORTS = {
    "urgency": ([NEXT_DEADLINE, Deal.id], False, [date.fromisoformat, uuid.UUID]),
    "newest": ([Deal.date_taken, Deal.created_at, Deal.id], True,
               [date.fromisoformat, datetime.fromisoformat, uuid.UUID]),
    "amount": ([Deal.amount_paid, Deal.id], True, [Decimal, uuid.UUID]),
}


class BadCursor(ValueError):
    pass


def _encode(values) -> str:
    return base64.urlsafe_b64encode(json.dumps([str(v) for v in values]).encode()).decode()


def _decode(cursor: str, parsers) -> list:
    try:
        raw = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        if len(raw) != len(parsers):
            raise ValueError
        return [p(v) for p, v in zip(parsers, raw)]
    except Exception as exc:
        raise BadCursor("invalid cursor") from exc


class DealRepo:
    def __init__(self, session: Session):
        self._s = session

    def _one(self, stmt) -> Deal | None:
        return self._s.scalars(stmt, execution_options={"populate_existing": True}).one_or_none()

    def create(self, values: dict) -> Deal | None:
        """Insert; returns None if a deal with the same client_id already exists for this user."""
        stmt = (
            pg_insert(Deal)
            .values(**values, user_id=CURRENT_USER_ID)
            .on_conflict_do_nothing(index_elements=[Deal.user_id, Deal.client_id],
                                    index_where=Deal.client_id.isnot(None))
            .returning(Deal)
        )
        return self._one(stmt)

    def get(self, deal_id: uuid.UUID, include_deleted: bool = False) -> Deal | None:
        conds = [Deal.id == deal_id, OWN] + ([] if include_deleted else [ACTIVE])
        return self._one(select(Deal).where(*conds))

    def get_by_client_id(self, client_id: uuid.UUID) -> Deal | None:
        return self._one(select(Deal).where(Deal.client_id == client_id, OWN))

    def update(self, deal_id: uuid.UUID, values: dict) -> Deal | None:
        return self._one(update(Deal).where(Deal.id == deal_id, OWN).values(**values).returning(Deal))

    def rename_mediator(self, mediator_id: uuid.UUID, name: str) -> None:
        self._s.execute(update(Deal).where(Deal.mediator_id == mediator_id, OWN, ACTIVE)
                        .values(mediator_name=name))

    def list(self, *, status=None, mediator_id=None, platform=None, q=None, date_from=None,
             date_to=None, sort="urgency", limit=50, cursor=None) -> tuple[list[Deal], str | None]:
        cols, desc, parsers = SORTS[sort]
        stmt = select(Deal, *cols).where(OWN, ACTIVE)
        if status:
            stmt = stmt.where(STATUS_FILTERS[status])
        if mediator_id:
            stmt = stmt.where(Deal.mediator_id == mediator_id)
        if platform:
            stmt = stmt.where(func.lower(Deal.platform) == platform.lower())
        if q:
            like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            stmt = stmt.where(or_(Deal.product.ilike(like), Deal.notes.ilike(like)))
        if date_from:
            stmt = stmt.where(Deal.date_taken >= date_from)
        if date_to:
            stmt = stmt.where(Deal.date_taken <= date_to)
        if cursor:
            vals = _decode(cursor, parsers)
            key = tuple_(*cols)
            stmt = stmt.where(key < tuple_(*vals) if desc else key > tuple_(*vals))
        stmt = stmt.order_by(*[c.desc() if desc else c.asc() for c in cols]).limit(limit + 1)
        rows = self._s.execute(stmt).all()
        nxt = _encode(rows[limit - 1][1:]) if len(rows) > limit else None
        return [r[0] for r in rows[:limit]], nxt

    def changed_page(self, since: datetime | None, cursor: tuple[datetime, str, uuid.UUID] | None,
                     limit: int) -> list[Deal]:
        stmt = select(Deal).where(OWN)
        stmt = stmt.where(Deal.updated_at > since) if since else stmt.where(ACTIVE)
        if cursor:
            timestamp, kind, record_id = cursor
            if kind == "deal":
                stmt = stmt.where(or_(Deal.updated_at > timestamp,
                                      and_(Deal.updated_at == timestamp, Deal.id > record_id)))
            else:
                stmt = stmt.where(Deal.updated_at > timestamp)
        return list(self._s.scalars(stmt.order_by(Deal.updated_at, Deal.id).limit(limit)))

    def summary(self, today: date, alert_days: int) -> dict:
        not_received = Deal.payment_status != "received"
        received = Deal.payment_status == "received"
        zero = literal(Decimal("0"))
        row = self._s.execute(
            select(
                func.coalesce(func.sum(Deal.amount_paid), zero).label("total_paid"),
                func.coalesce(func.sum(Deal.refund_amount).filter(not_received), zero).label("refund_pending_amount"),
                func.coalesce(func.sum(Deal.refund_amount).filter(received), zero).label("refund_received_amount"),
                func.coalesce(func.sum(Deal.refund_amount + Deal.commission - Deal.amount_paid)
                              .filter(received), zero).label("net_profit"),
                func.count().filter(~COMPLETED).label("open_deals"),
                func.count().filter(urgent_expr(today, alert_days)).label("urgent_count"),
                func.count().filter(overdue_expr(today)).label("overdue_count"),
            ).where(OWN, ACTIVE)
        ).one()
        return dict(row._mapping)
