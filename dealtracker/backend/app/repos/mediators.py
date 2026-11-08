import uuid

from sqlalchemy import func, insert, select
from sqlalchemy.orm import Session

from app.models import Mediator
from app.repos.base import CURRENT_USER_ID
from app.schemas import MediatorCreate


class MediatorRepo:
    def __init__(self, session: Session):
        self._s = session

    def create(self, data: MediatorCreate) -> Mediator:
        stmt = (
            insert(Mediator)
            .values(**data.model_dump(), user_id=CURRENT_USER_ID)
            .returning(Mediator)
        )
        return self._s.scalars(stmt).one()

    def get(self, mediator_id: uuid.UUID) -> Mediator | None:
        stmt = select(Mediator).where(
            Mediator.id == mediator_id, Mediator.user_id == CURRENT_USER_ID
        )
        return self._s.scalars(stmt).one_or_none()

    def list(self) -> list[Mediator]:
        stmt = (
            select(Mediator)
            .where(Mediator.user_id == CURRENT_USER_ID)
            .order_by(func.lower(Mediator.name))
        )
        return list(self._s.scalars(stmt))
