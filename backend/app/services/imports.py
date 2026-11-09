"""Import preview, idempotent commit, export, and undo use-cases."""
import csv
import io
import re
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app import clock, rules
from app.auth.deps import CurrentUser
from app.errors import AppError
from app.import_normalization import RowNormalization, normalize_import_row
from app.models import ImportJob, Mediator
from app.repos import ImportRepo, MediatorRepo
from app.schemas import (
    ImportCommitIn,
    ImportJobOut,
    ImportMediatorMatch,
    ImportOptions,
    ImportPreviewCounts,
    ImportPreviewOut,
    ImportPreviewRow,
    ImportReconciliation,
    ImportUndoOut,
)

ERROR_LIMIT = 1000
BATCH_SIZE = 500
UNDO_WINDOW = timedelta(days=30)
MAX_JOB_TOTAL = Decimal("9999999999.99")


@dataclass
class PreparedRow:
    row_number: int
    result: RowNormalization
    status: str
    will_import: bool
    duplicate_of: int | None = None
    duplicate_reason: str | None = None
    existing_deal_id: uuid.UUID | None = None
    mediator_key: str = ""
    original_mediator_name: str | None = None


def _product_key(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).casefold()


def _mediator_key(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKC", value or "").casefold()
    compact = "".join(char for char in normalized if char.isalnum())
    return compact or normalized.strip()


def _deal_key(product: str, date_taken: date, amount_paid: Decimal, mediator_name: str | None) -> tuple:
    return _product_key(product), date_taken, amount_paid, _mediator_key(mediator_name)


def _money(value: Decimal | None) -> str | None:
    return f"{value:.2f}" if value is not None else None


def _public_values(result: RowNormalization) -> dict[str, Any]:
    values = {}
    for key, value in result.values.items():
        if isinstance(value, Decimal):
            values[key] = _money(value)
        elif isinstance(value, date):
            values[key] = value.isoformat()
        else:
            values[key] = value
    return values


def _options(options: ImportOptions) -> dict:
    return options.model_dump(mode="json", exclude_none=True)


def _prepare(
    session: Session,
    rows: list[dict[str, str | None]],
    options: ImportOptions,
    user: CurrentUser,
) -> tuple[list[PreparedRow], dict[str, Mediator], dict[str, str], list[ImportMediatorMatch]]:
    today = rules.today_in(user.timezone, clock.now())
    defaults = options.defaults.model_dump(exclude_none=True)
    normalized = [normalize_import_row(
        row,
        date_order=options.date_order,
        value_maps=options.value_maps,
        defaults=defaults,
        today=today,
    ) for row in rows]

    repo = ImportRepo(session)
    existing_mediators = MediatorRepo(session).list()
    mediator_by_key = {_mediator_key(m.name): m for m in existing_mediators}
    existing_deal_keys = {}
    for deal_id, product, taken, amount, mediator_name, joined_name in repo.existing_deal_values():
        existing_deal_keys.setdefault(
            _deal_key(product, taken, amount, mediator_name or joined_name), deal_id,
        )

    prepared: list[PreparedRow] = []
    seen: dict[tuple, int] = {}
    for index, result in enumerate(normalized, start=1):
        values = result.values
        mediator_name = values.get("mediator_name")
        mediator_key = _mediator_key(mediator_name)
        entry = PreparedRow(index, result, "error", False, mediator_key=mediator_key,
                            original_mediator_name=mediator_name)
        if result.errors:
            prepared.append(entry)
            continue
        key = _deal_key(values["product"], values["date_taken"], values["amount_paid"], mediator_name)
        duplicate_of = seen.get(key)
        existing_deal_id = existing_deal_keys.get(key)
        if duplicate_of is not None:
            entry.status = "duplicate"
            entry.duplicate_of = duplicate_of
            entry.duplicate_reason = f"Matches row {duplicate_of} in this file"
        elif existing_deal_id:
            entry.status = "duplicate"
            entry.duplicate_reason = "Matches an existing deal"
            entry.existing_deal_id = existing_deal_id
        else:
            entry.status = "ok"
        seen.setdefault(key, index)
        entry.will_import = entry.status != "duplicate" or options.duplicate_policy == "import"
        prepared.append(entry)

    to_create: dict[str, str] = {}
    matches: dict[str, ImportMediatorMatch] = {}
    for entry in prepared:
        if not entry.will_import or not entry.mediator_key:
            continue
        name = entry.original_mediator_name or ""
        existing = mediator_by_key.get(entry.mediator_key)
        if existing:
            values = entry.result.values
            values["mediator_id"] = existing.id
            values["mediator_name"] = existing.name
            matches.setdefault(entry.mediator_key, ImportMediatorMatch(
                input_name=name, existing_name=existing.name,
            ))
        else:
            canonical = to_create.setdefault(entry.mediator_key, name)
            entry.result.values["mediator_name"] = canonical
            entry.result.values["mediator_id"] = None

    return prepared, mediator_by_key, to_create, list(matches.values())


def _preview_response(
    prepared: list[PreparedRow],
    to_create: dict[str, str],
    matches: list[ImportMediatorMatch],
) -> ImportPreviewOut:
    rows = [ImportPreviewRow(
        row_number=entry.row_number,
        status=entry.status,
        will_import=entry.will_import,
        duplicate_of=entry.duplicate_of,
        duplicate_reason=entry.duplicate_reason,
        existing_deal_id=entry.existing_deal_id,
        values=_public_values(entry.result),
        errors=entry.result.errors,
        warnings=entry.result.warnings,
    ) for entry in prepared]
    eligible = [entry.result.values for entry in prepared if entry.will_import]
    paid = sum((values["amount_paid"] for values in eligible), Decimal("0.00"))
    refund = sum((values["refund_amount"] for values in eligible), Decimal("0.00"))
    pending = sum((values["refund_amount"] for values in eligible
                   if values["payment_status"] != "received"), Decimal("0.00"))
    gain_loss = sum((values["commission"] - values["less_amount"] for values in eligible),
                    Decimal("0.00"))
    unknown: dict[str, set[str]] = {}
    for entry in prepared:
        for field, value in entry.result.unrecognized_statuses.items():
            unknown.setdefault(field, set()).add(value)
    return ImportPreviewOut(
        rows=rows,
        counts=ImportPreviewCounts(
            total=len(prepared),
            will_import=sum(entry.will_import for entry in prepared),
            duplicates=sum(entry.status == "duplicate" for entry in prepared),
            errors=sum(entry.status == "error" for entry in prepared),
        ),
        unrecognized_status_values={field: sorted(values, key=str.casefold) for field, values in unknown.items()},
        mediators_to_create=list(to_create.values()),
        existing_mediators=matches,
        reconciliation=ImportReconciliation(
            total_paid=_money(paid) or "0.00",
            total_refund=_money(refund) or "0.00",
            total_gain_loss=_money(gain_loss) or "0.00",
            pending_refund=_money(pending) or "0.00",
        ),
    )


def preview(session: Session, rows: list[dict[str, str | None]], options: ImportOptions,
            user: CurrentUser) -> ImportPreviewOut:
    prepared, _, to_create, matches = _prepare(session, rows, options, user)
    return _preview_response(prepared, to_create, matches)


def _job_out(job: ImportJob) -> ImportJobOut:
    options = dict(job.options or {})
    options.pop("internal_created_mediator_ids", None)
    return ImportJobOut(
        id=job.id,
        import_id=job.import_id,
        filename=job.filename,
        status=job.status,
        rows_total=job.rows_total,
        rows_imported=job.rows_imported,
        rows_skipped_duplicate=job.rows_skipped_duplicate,
        rows_failed=job.rows_failed,
        mediators_created=job.mediators_created,
        total_paid=job.total_paid,
        total_refund=job.total_refund,
        errors=job.errors,
        options=options,
        created_at=job.created_at,
        undone_at=job.undone_at,
    )


def commit(session: Session, body: ImportCommitIn, user: CurrentUser) -> ImportJobOut:
    repo = ImportRepo(session)
    existing = repo.get_by_import_id(body.import_id)
    if existing:
        return _job_out(existing)

    prepared, existing_mediators, to_create, _ = _prepare(session, body.rows, body.options, user)
    importable = [entry for entry in prepared if entry.will_import]
    duplicates = sum(entry.status == "duplicate" for entry in prepared)
    errors = [
        {"row": entry.row_number, "field": issue["field"], "reason": issue["reason"]}
        for entry in prepared for issue in entry.result.errors
    ][:ERROR_LIMIT]
    paid = sum((entry.result.values["amount_paid"] for entry in importable), Decimal("0.00"))
    refund = sum((entry.result.values["refund_amount"] for entry in importable), Decimal("0.00"))
    if paid > MAX_JOB_TOTAL or refund > MAX_JOB_TOTAL:
        raise AppError(422, "import_total_too_large", "Import totals exceed the database limit for an import job.")
    options = _options(body.options)
    options["internal_created_mediator_ids"] = []
    values = {
        "import_id": body.import_id,
        "filename": _clean_filename(body.filename),
        "status": "failed" if not importable and errors else "committed",
        "rows_total": len(prepared),
        "rows_imported": len(importable),
        "rows_skipped_duplicate": duplicates if body.options.duplicate_policy == "skip" else 0,
        "rows_failed": sum(entry.status == "error" for entry in prepared),
        "mediators_created": len(to_create),
        "total_paid": paid,
        "total_refund": refund,
        "errors": errors,
        "options": options,
    }
    job, created = repo.create_job(values)
    if not created:
        return _job_out(job)

    med_repo = MediatorRepo(session)
    created_mediators: dict[str, Mediator] = {}
    created_ids: list[uuid.UUID] = []
    written_at = clock.now()
    for key, name in to_create.items():
        mediator = med_repo.create(name, written_at=written_at)
        created_mediators[key] = mediator
        created_ids.append(mediator.id)

    batch: list[dict] = []
    for entry in importable:
        deal_values = dict(entry.result.values)
        deal_values.pop("refund_amount", None)
        deal_values.setdefault("mediator_id", None)
        key = entry.mediator_key
        if key and key in existing_mediators:
            mediator = existing_mediators[key]
            deal_values["mediator_id"] = mediator.id
            deal_values["mediator_name"] = mediator.name
        elif key and key in created_mediators:
            mediator = created_mediators[key]
            deal_values["mediator_id"] = mediator.id
            deal_values["mediator_name"] = mediator.name
        deal_values.update(
            client_id=uuid.uuid5(body.import_id, f"row:{entry.row_number}"),
            import_job_id=job.id,
            client_updated_at=written_at,
        )
        batch.append(deal_values)
        if len(batch) == BATCH_SIZE:
            repo.insert_deal_batch(batch)
            batch = []
    if batch:
        repo.insert_deal_batch(batch)

    stored_options = {**options, "internal_created_mediator_ids": [str(item) for item in created_ids]}
    updated_job = repo.update_job(job.id, {"options": stored_options})
    return _job_out(updated_job or job)


def _clean_filename(filename: str | None) -> str | None:
    if not filename:
        return None
    value = filename.replace("\\", "/").split("/")[-1]
    value = "".join(char for char in value if char.isprintable() and char not in "\r\n")
    return value[:255] or None


def get_job(session: Session, job_id: uuid.UUID) -> ImportJobOut:
    job = ImportRepo(session).get_job(job_id)
    if job is None:
        raise AppError(404, "not_found", "Import job not found.")
    return _job_out(job)


def list_jobs(session: Session) -> list[ImportJobOut]:
    return [_job_out(job) for job in ImportRepo(session).list_jobs()]


def safe_csv_cell(value: Any) -> str:
    text = "" if value is None else str(value)
    return f"'{text}" if text.startswith(("=", "+", "-", "@")) else text


def errors_csv(session: Session, job_id: uuid.UUID) -> tuple[str, str]:
    job = ImportRepo(session).get_job(job_id)
    if job is None:
        raise AppError(404, "not_found", "Import job not found.")
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(("row", "field", "reason"))
    for error in job.errors:
        writer.writerow(tuple(safe_csv_cell(error.get(key)) for key in ("row", "field", "reason")))
    return output.getvalue(), job.filename or "import-errors"


def undo(session: Session, job_id: uuid.UUID) -> ImportUndoOut:
    repo = ImportRepo(session)
    job = repo.get_job(job_id)
    if job is None:
        raise AppError(404, "not_found", "Import job not found.")
    if job.status == "undone":
        raise AppError(409, "already_undone", "This import was already undone.")
    if job.status != "committed":
        raise AppError(409, "cannot_undo", "This import did not commit any deals.")
    if clock.now() - job.created_at > UNDO_WINDOW:
        raise AppError(409, "undo_expired", "Imports can only be undone within 30 days.")

    deleted_deals, edited = repo.undo_deals(job.id, job.created_at)
    mediator_ids = [uuid.UUID(value) for value in (job.options or {}).get("internal_created_mediator_ids", [])]
    deleted_mediators = repo.soft_delete_orphan_mediators(mediator_ids)
    updated = repo.update_job(job.id, {"status": "undone", "undone_at": clock.now()})
    if updated is None:
        raise AppError(404, "not_found", "Import job not found.")
    return ImportUndoOut(
        job=_job_out(updated),
        deleted_deals=deleted_deals,
        deleted_mediators=deleted_mediators,
        edited_deals_warning=edited,
        warning=f"{edited} deals were edited since import.",
    )
