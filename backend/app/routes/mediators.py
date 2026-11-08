import uuid

from fastapi import APIRouter, Response

from app.db import UserDB
from app.errors import AppError
from app.repos import MediatorRepo
from app.schemas import MediatorIn, MediatorOut, MediatorPatch, MediatorStatsOut
from app.services import deals as svc

router = APIRouter(prefix="/api/mediators", tags=["mediators"])


def _load(db: UserDB, mediator_id: uuid.UUID):
    m = MediatorRepo(db).get(mediator_id)
    if m is None:
        raise AppError(404, "not_found", "Mediator not found.")
    return m


@router.get("", response_model=list[MediatorStatsOut])
def list_mediators(db: UserDB):
    return [MediatorStatsOut(**MediatorOut.model_validate(m).model_dump(), pending_refund_amount=p,
                             open_deal_count=c) for m, p, c in MediatorRepo(db).list_with_stats()]


@router.post("", response_model=MediatorOut, status_code=201)
def create_mediator(body: MediatorIn, db: UserDB):
    return svc.create_mediator(db, body)


@router.patch("/{mediator_id}", response_model=MediatorOut)
def patch_mediator(mediator_id: uuid.UUID, body: MediatorPatch, db: UserDB):
    return svc.update_mediator(db, _load(db, mediator_id), body)


@router.delete("/{mediator_id}", status_code=204)
def delete_mediator(mediator_id: uuid.UUID, db: UserDB):
    svc.delete_mediator(db, _load(db, mediator_id))
    return Response(status_code=204)
