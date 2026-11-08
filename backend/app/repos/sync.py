import uuid
from datetime import datetime

from sqlalchemy import delete, func, insert, select, text
from sqlalchemy.orm import Session

from app.models import SyncOpRecord
from app.repos.base import CURRENT_USER_ID


class SyncRepo:
    def __init__(self, session: Session):
        self._s = session

    def get_op(self, op_id: uuid.UUID) -> SyncOpRecord | None:
        return self._s.scalars(select(SyncOpRecord).where(
            SyncOpRecord.op_id == op_id, SyncOpRecord.user_id == CURRENT_USER_ID)).one_or_none()

    def record_op(self, op_id: uuid.UUID, record_id: uuid.UUID | None) -> None:
        self._s.execute(insert(SyncOpRecord).values(user_id=CURRENT_USER_ID, op_id=op_id, record_id=record_id))

    def db_now(self) -> datetime:
        return self._s.execute(select(func.now())).scalar_one()

    def savepoint(self):
        return self._s.begin_nested()

    def delete_old_applied_ops(self, limit: int = 500) -> int:
        """Bounded per-user cleanup of applied idempotency records older than 30 days."""
        expired = select(SyncOpRecord.op_id).where(
            SyncOpRecord.user_id == CURRENT_USER_ID,
            SyncOpRecord.created_at < func.now() - text("interval '30 days'"),
        ).order_by(SyncOpRecord.created_at).limit(limit)
        result = self._s.execute(delete(SyncOpRecord).where(
            SyncOpRecord.user_id == CURRENT_USER_ID,
            SyncOpRecord.op_id.in_(expired),
        ))
        return result.rowcount or 0
