import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Query, Response

from app.auth.deps import Me
from app.db import UserDB
from app.errors import AppError
from app.repos import BadCursor, DealRepo
from app.rules import STATUSES
from app.schemas import ActionIn, DealIn, DealOut, DealPage, DealPatch
from app.services import deals as svc

router = APIRouter(prefix="/api/deals", tags=["deals"])


def _load(db: UserDB, deal_id: uuid.UUID):
    deal = DealRepo(db).get(deal_id)
    if deal is None:
        raise AppError(404, "not_found", "Deal not found.")
    return deal


@router.get("", response_model=DealPage)
def list_deals(
    user: Me,
    db: UserDB,
    status: Literal[STATUSES] | None = None,  # type: ignore[valid-type]
    mediator_id: uuid.UUID | None = None,
    platform: str | None = Query(default=None, max_length=100),
    q: str | None = Query(default=None, max_length=100),
    date_from: date | None = None,
    date_to: date | None = None,
    sort: Literal["urgency", "newest", "amount"] = "urgency",
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = Query(default=None, max_length=500),
):
    try:
        items, nxt = DealRepo(db).list(status=status, mediator_id=mediator_id, platform=platform, q=q,
                                       date_from=date_from, date_to=date_to, sort=sort, limit=limit,
                                       cursor=cursor)
    except BadCursor:
        raise AppError(400, "invalid_cursor", "The cursor is invalid; restart from the first page.") from None
    ctx = svc.Ctx.of(user)
    return DealPage(items=[svc.present(d, ctx) for d in items], next_cursor=nxt)


@router.post("", response_model=DealOut, status_code=201)
def create_deal(body: DealIn, response: Response, user: Me, db: UserDB):
    ctx = svc.Ctx.of(user)
    deal, created = svc.create_deal(db, body, ctx)
    if not created:
        response.status_code = 200
    return svc.present(deal, ctx)


@router.get("/{deal_id}", response_model=DealOut)
def get_deal(deal_id: uuid.UUID, user: Me, db: UserDB):
    return svc.present(_load(db, deal_id), svc.Ctx.of(user))


@router.patch("/{deal_id}", response_model=DealOut)
def patch_deal(deal_id: uuid.UUID, body: DealPatch, user: Me,
               db: UserDB):
    return svc.present(svc.update_deal(db, _load(db, deal_id), body), svc.Ctx.of(user))


@router.delete("/{deal_id}", status_code=204)
def delete_deal(deal_id: uuid.UUID, db: UserDB):
    svc.delete_deal(db, _load(db, deal_id))
    return Response(status_code=204)


@router.post("/{deal_id}/action", response_model=DealOut)
def deal_action(deal_id: uuid.UUID, body: ActionIn, user: Me,
                db: UserDB):
    ctx = svc.Ctx.of(user)
    return svc.present(svc.deal_action(db, _load(db, deal_id), body.action, ctx, body.payment_received_on), ctx)
