from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, insert, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import Deal, ImportJob, Mediator
from app.repos.base import CURRENT_USER_ID


class ImportRepo:
    def __init__(self, session: Session):
        self._s = session

    def _job(self, stmt) -> ImportJob | None:
        return self._s.scalars(stmt, execution_options={"populate_existing": True}).one_or_none()

    def get_job(self, job_id: uuid.UUID) -> ImportJob | None:
        return self._job(select(ImportJob).where(
            ImportJob.id == job_id, ImportJob.user_id == CURRENT_USER_ID,
        ))

    def get_by_import_id(self, import_id: uuid.UUID) -> ImportJob | None:
        return self._job(select(ImportJob).where(
            ImportJob.import_id == import_id, ImportJob.user_id == CURRENT_USER_ID,
        ))

    def list_jobs(self, limit: int = 100) -> list[ImportJob]:
        return list(self._s.scalars(select(ImportJob).where(
            ImportJob.user_id == CURRENT_USER_ID,
        ).order_by(ImportJob.created_at.desc(), ImportJob.id).limit(limit)))

    def create_job(self, values: dict) -> tuple[ImportJob, bool]:
        stmt = pg_insert(ImportJob).values(
            **values, user_id=CURRENT_USER_ID,
        ).on_conflict_do_nothing(
            index_elements=[ImportJob.user_id, ImportJob.import_id],
        ).returning(ImportJob)
        created = self._job(stmt)
        if created:
            return created, True
        existing = self.get_by_import_id(values["import_id"])
        if existing is None:
            raise RuntimeError("Import job conflict could not be resolved.")
        return existing, False

    def update_job(self, job_id: uuid.UUID, values: dict) -> ImportJob | None:
        return self._job(update(ImportJob).where(
            ImportJob.id == job_id, ImportJob.user_id == CURRENT_USER_ID,
        ).values(**values).returning(ImportJob))

    def existing_deal_values(self) -> list[tuple]:
        stmt = (
            select(Deal.product, Deal.date_taken, Deal.amount_paid, Deal.mediator_name, Mediator.name)
            .outerjoin(Mediator, (Mediator.id == Deal.mediator_id) & (Mediator.user_id == Deal.user_id))
            .where(Deal.user_id == CURRENT_USER_ID, Deal.deleted_at.is_(None))
        )
        return list(self._s.execute(stmt).all())

    def insert_deal_batch(self, values: list[dict]) -> None:
        if values:
            owned_values = [{**row, "user_id": CURRENT_USER_ID} for row in values]
            self._s.execute(insert(Deal).values(owned_values))

    def undo_deals(self, job_id: uuid.UUID, created_at: datetime) -> tuple[int, int]:
        active = [
            Deal.user_id == CURRENT_USER_ID,
            Deal.import_job_id == job_id,
            Deal.deleted_at.is_(None),
        ]
        edited = self._s.execute(select(func.count()).select_from(Deal).where(
            *active, Deal.updated_at > created_at,
        )).scalar_one()
        result = self._s.execute(update(Deal).where(*active).values(
            deleted_at=func.now(), client_updated_at=func.now(),
        ))
        return result.rowcount or 0, edited

    def soft_delete_orphan_mediators(self, mediator_ids: list[uuid.UUID]) -> int:
        if not mediator_ids:
            return 0
        active_deals = select(Deal.id).where(
            Deal.user_id == CURRENT_USER_ID,
            Deal.mediator_id == Mediator.id,
            Deal.deleted_at.is_(None),
        ).exists()
        result = self._s.execute(update(Mediator).where(
            Mediator.user_id == CURRENT_USER_ID,
            Mediator.id.in_(mediator_ids),
            Mediator.deleted_at.is_(None),
            ~active_deals,
        ).values(deleted_at=func.now(), client_updated_at=func.now()))
        return result.rowcount or 0
