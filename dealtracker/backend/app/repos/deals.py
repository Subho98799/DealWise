import uuid

from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.models import Deal
from app.repos.base import CURRENT_USER_ID
from app.schemas import DealCreate


class DealRepo:
    def __init__(self, session: Session):
        self._s = session

    def create(self, data: DealCreate) -> Deal:
        stmt = insert(Deal).values(**data.model_dump(), user_id=CURRENT_USER_ID).returning(Deal)
        return self._s.scalars(stmt).one()

    def get(self, deal_id: uuid.UUID) -> Deal | None:
        stmt = select(Deal).where(
            Deal.id == deal_id, Deal.user_id == CURRENT_USER_ID, Deal.deleted_at.is_(None)
        )
        return self._s.scalars(stmt).one_or_none()

    def list(self, limit: int = 100, offset: int = 0) -> list[Deal]:
        stmt = (
            select(Deal)
            .where(Deal.user_id == CURRENT_USER_ID, Deal.deleted_at.is_(None))
            .order_by(Deal.date_taken.desc(), Deal.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self._s.scalars(stmt))
