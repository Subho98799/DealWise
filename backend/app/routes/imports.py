import re
import uuid

from fastapi import APIRouter, Depends, Response

from app.auth.deps import Me
from app.config import get_settings
from app.db import UserDB
from app.schemas import ImportCommitIn, ImportJobOut, ImportPreviewOut, ImportRequest, ImportUndoOut
from app.security import import_rate_limiter
from app.services import imports as svc

router = APIRouter(prefix="/api/import", tags=["import"])


def _preview_rate_limit(user: Me) -> None:
    if get_settings().RATE_LIMIT_ENABLED:
        import_rate_limiter.consume(user.id, "preview", 30, 60 * 60)


def _commit_rate_limit(user: Me) -> None:
    if get_settings().RATE_LIMIT_ENABLED:
        import_rate_limiter.consume(user.id, "commit", 10, 60 * 60)


@router.post("/preview", response_model=ImportPreviewOut, dependencies=[Depends(_preview_rate_limit)])
def import_preview(body: ImportRequest, user: Me, db: UserDB):
    return svc.preview(db, body.rows, body.options, user)


@router.post("/commit", response_model=ImportJobOut, dependencies=[Depends(_commit_rate_limit)])
def import_commit(body: ImportCommitIn, user: Me, db: UserDB):
    return svc.commit(db, body, user)


@router.get("/jobs", response_model=list[ImportJobOut])
def import_jobs(_: Me, db: UserDB):
    return svc.list_jobs(db)


@router.get("/jobs/{job_id}", response_model=ImportJobOut)
def import_job(job_id: uuid.UUID, _: Me, db: UserDB):
    return svc.get_job(db, job_id)


@router.get("/jobs/{job_id}/errors.csv")
def import_errors_csv(job_id: uuid.UUID, db: UserDB):
    csv_content, filename = svc.errors_csv(db, job_id)
    safe_filename = re.sub(r"[^A-Za-z0-9._-]", "_", filename)[:80] or "import-errors"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}-errors.csv"'},
    )


@router.post("/jobs/{job_id}/undo", response_model=ImportUndoOut)
def undo_import(job_id: uuid.UUID, _: Me, db: UserDB):
    return svc.undo(db, job_id)
