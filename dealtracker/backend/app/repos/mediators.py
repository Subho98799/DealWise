from __future__ import annotations

import uuid

from sqlalchemy import and_, func, insert, literal, or_, select, update
from sqlalchemy.orm import Session

from app.models import Deal, Mediator
from app.repos.base import CURRENT_USER_ID
from app.repos.deals import COMPLETED

OWN = Mediator.user_id == CURRENT_USER_ID
ACTIVE = Mediator.deleted_at.is_(None)


class MediatorRepo:
    def __init__(self, session: Session):
        self._s = session

    def _one(self, stmt) -> Mediator | None:
        return self._s.scalars(stmt, execution_options={"populate_existing": True}).one_or_none()

    def create(self, name: str, contact: str | None = None, id: uuid.UUID | None = None,
               written_at=None) -> Mediator:
        values = {"name": name, "contact": contact, "user_id": CURRENT_USER_ID, "client_updated_at": written_at}
        if id:
            values["id"] = id
        return self._one(insert(Mediator).values(**values).returning(Mediator))

    def get(self, mediator_id: uuid.UUID, include_deleted: bool = False) -> Mediator | None:
        conds = [Mediator.id == mediator_id, OWN] + ([] if include_deleted else [ACTIVE])
        return self._one(select(Mediator).where(*conds))

    def find_by_name(self, name: str) -> Mediator | None:
        return self._one(select(Mediator).where(func.lower(Mediator.name) == name.strip().lower(), OWN, ACTIVE))

    def update(self, mediator_id: uuid.UUID, values: dict) -> Mediator | None:
        return self._one(update(Mediator).where(Mediator.id == mediator_id, OWN).values(**values)
                         .returning(Mediator))

    def list(self) -> list[Mediator]:
        return list(self._s.scalars(select(Mediator).where(OWN, ACTIVE).order_by(func.lower(Mediator.name))))

    def list_with_stats(self, top: int | None = None) -> list[tuple[Mediator, object, int]]:
        pending = func.coalesce(
            func.sum(Deal.refund_amount).filter(Deal.payment_status != "received"), literal(0))
        open_count = func.count(Deal.id).filter(~COMPLETED)
        stmt = (
            select(Mediator, pending.label("pending"), open_count.label("open"))
            .outerjoin(Deal, and_(Deal.mediator_id == Mediator.id, Deal.deleted_at.is_(None),
                                  Deal.user_id == CURRENT_USER_ID))
            .where(OWN, ACTIVE)
            .group_by(Mediator.id)
        )
        stmt = stmt.order_by(pending.desc(), func.lower(Mediator.name)).limit(top) if top else \
            stmt.order_by(func.lower(Mediator.name))
        return [tuple(r) for r in self._s.execute(stmt).all()]

    def changed_page(self, since, cursor, limit: int) -> list[Mediator]:
        stmt = select(Mediator).where(OWN)
        stmt = stmt.where(Mediator.updated_at > since) if since else stmt.where(ACTIVE)
        if cursor:
            timestamp, kind, record_id = cursor
            if kind == "deal":
                stmt = stmt.where(Mediator.updated_at >= timestamp)
            else:
                stmt = stmt.where(or_(Mediator.updated_at > timestamp,
                                      and_(Mediator.updated_at == timestamp, Mediator.id > record_id)))
        return list(self._s.scalars(stmt.order_by(Mediator.updated_at, Mediator.id).limit(limit)))
