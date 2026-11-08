"""Offline sync: pull changes since a cursor, push a batch of idempotent ops (last-write-wins)."""
from datetime import datetime, timedelta

from pydantic import ValidationError
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.errors import AppError
from app.repos import DealRepo, MediatorRepo, SyncRepo
from app.schemas import (DealIn, DealPatch, MediatorIn, MediatorOut, MediatorPatch, SyncChangesOut,
                         SyncDeleted, SyncOp, SyncResult)
from app.services import deals as svc

# Pull re-sends rows changed in the last minute before the cursor, so a write whose transaction
# started before the previous pull but committed after it is never missed. Clients upsert, so repeats are harmless.
PULL_OVERLAP = timedelta(seconds=60)


def changes(s: Session, since: datetime | None, ctx: svc.Ctx) -> SyncChangesOut:
    server_time = SyncRepo(s).db_now()
    after = since - PULL_OVERLAP if since else None
    deals = DealRepo(s).changed_since(after)
    meds = MediatorRepo(s).changed_since(after)
    return SyncChangesOut(
        server_time=server_time,
        deals=[svc.present(d, ctx) for d in deals if d.deleted_at is None],
        mediators=[MediatorOut.model_validate(m) for m in meds if m.deleted_at is None],
        deleted=SyncDeleted(deals=[d.id for d in deals if d.deleted_at is not None],
                            mediators=[m.id for m in meds if m.deleted_at is not None]),
    )


def _rejected(op: SyncOp, reason: str) -> SyncResult:
    return SyncResult(op_id=op.op_id, status="rejected", reason=reason)


def _is_stale(op: SyncOp, rec) -> bool:
    """Last-write-wins on the writer's clock: older than the last accepted write loses."""
    return op.client_updated_at < (rec.client_updated_at or rec.updated_at)


def _stale(op: SyncOp, rec) -> SyncResult | None:
    if rec.deleted_at is not None:
        return _rejected(op, "deleted: this record was deleted on another device")
    if _is_stale(op, rec):
        return _rejected(op, "stale: a newer version exists on the server")
    return None


def _apply_deal(s: Session, op: SyncOp, ctx: svc.Ctx) -> SyncResult:
    repo = DealRepo(s)
    rec = repo.get(op.id, include_deleted=True) if op.id else None
    if rec is None and op.client_id:
        rec = repo.get_by_client_id(op.client_id)
    if op.op == "delete":
        if rec is None or rec.deleted_at is not None:
            return SyncResult(op_id=op.op_id, status="applied", id=rec.id if rec else op.id)
        if _is_stale(op, rec):
            return _rejected(op, "stale: a newer version exists on the server")
        svc.delete_deal(s, rec, op.client_updated_at)
        return SyncResult(op_id=op.op_id, status="applied", id=rec.id)
    if rec is None:
        data = DealIn.model_validate({**op.data, "client_id": op.client_id or op.id})
        deal, _ = svc.create_deal(s, data, ctx, id=op.id, written_at=op.client_updated_at)
        return SyncResult(op_id=op.op_id, status="applied", id=deal.id)
    if (bad := _stale(op, rec)) is not None:
        return bad
    deal = svc.update_deal(s, rec, DealPatch.model_validate(op.data), op.client_updated_at)
    return SyncResult(op_id=op.op_id, status="applied", id=deal.id)


def _apply_mediator(s: Session, op: SyncOp) -> SyncResult:
    repo = MediatorRepo(s)
    rec = repo.get(op.id, include_deleted=True) if op.id else None
    if op.op == "delete":
        if rec is None or rec.deleted_at is not None:
            return SyncResult(op_id=op.op_id, status="applied", id=op.id)
        if _is_stale(op, rec):
            return _rejected(op, "stale: a newer version exists on the server")
        svc.delete_mediator(s, rec, op.client_updated_at)
        return SyncResult(op_id=op.op_id, status="applied", id=rec.id)
    if rec is None:
        data = MediatorIn.model_validate(op.data)
        same = repo.find_by_name(data.name)
        if same:  # created on another device with the same name: client remaps to this id
            return SyncResult(op_id=op.op_id, status="duplicate", reason="name_exists", id=same.id)
        return SyncResult(op_id=op.op_id, status="applied", id=svc.create_mediator(s, data, op.id, op.client_updated_at).id)
    if (bad := _stale(op, rec)) is not None:
        return bad
    return SyncResult(op_id=op.op_id, status="applied",
                      id=svc.update_mediator(s, rec, MediatorPatch.model_validate(op.data),
                                                        op.client_updated_at).id)


def push(s: Session, ops: list[SyncOp], ctx: svc.Ctx) -> list[SyncResult]:
    sync = SyncRepo(s)
    results = []
    for op in ops:
        prev = sync.get_op(op.op_id)
        if prev:
            results.append(SyncResult(op_id=op.op_id, status="duplicate", id=prev.record_id))
            continue
        try:
            with sync.savepoint():
                res = _apply_deal(s, op, ctx) if op.type == "deal" else _apply_mediator(s, op)
                if res.status == "applied":
                    sync.record_op(op.op_id, res.id)
        except ValidationError as e:
            err = e.errors()[0]
            res = _rejected(op, f"{'.'.join(map(str, err['loc']))}: {err['msg']}")
        except AppError as e:
            res = _rejected(op, f"{e.code}: {e.message}")
        except DBAPIError as e:
            res = _rejected(op, f"database: {type(e.orig).__name__}")
        results.append(res)
    return results
