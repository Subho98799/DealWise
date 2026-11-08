from datetime import datetime

from fastapi import APIRouter, Query
from pydantic import AwareDatetime, TypeAdapter, ValidationError

from app.auth.deps import Me
from app.db import UserDB
from app.errors import AppError
from app.repos import DealRepo, MediatorRepo
from app.schemas import SummaryOut, SyncChangesOut, SyncPushIn, SyncPushOut, TopMediator
from app.services import deals as svc
from app.services import sync as sync_svc

router = APIRouter(prefix="/api", tags=["sync"])
_ts = TypeAdapter(AwareDatetime)


@router.get("/sync/changes", response_model=SyncChangesOut)
def sync_changes(user: Me, db: UserDB, since: str | None = Query(default=None, max_length=64)):
    parsed: datetime | None = None
    if since:
        try:
            parsed = _ts.validate_python(since)
        except ValidationError:
            raise AppError(400, "invalid_since", "since must be an ISO timestamp with timezone.") from None
    return sync_svc.changes(db, parsed, svc.Ctx.of(user))


@router.post("/sync/push", response_model=SyncPushOut)
def sync_push(body: SyncPushIn, user: Me, db: UserDB):
    return SyncPushOut(results=sync_svc.push(db, body.ops, svc.Ctx.of(user)))


@router.get("/summary", response_model=SummaryOut)
def summary(user: Me, db: UserDB):
    ctx = svc.Ctx.of(user)
    top = [TopMediator(id=m.id, name=m.name, pending_refund_amount=p, open_deal_count=c)
           for m, p, c in MediatorRepo(db).list_with_stats(top=5)]
    return SummaryOut(**DealRepo(db).summary(ctx.today, ctx.alert_days), top_mediators=top)
