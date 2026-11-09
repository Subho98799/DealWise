import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import (AwareDatetime, BaseModel, BeforeValidator, ConfigDict, Field,
                      PlainSerializer, field_validator)

from app.rules import ACTIONS, valid_timezones


def _no_float(v: Any) -> Any:
    if isinstance(v, float):
        raise ValueError("send money as a decimal string like \"1299.00\", not a float")
    return v


def _money_str(d: Decimal) -> str:
    return str(Decimal(d).quantize(Decimal("0.01")))


# Money: numeric(12,2) in DB, decimal STRING in JSON, never float.
Money = Annotated[Decimal, BeforeValidator(_no_float), Field(ge=0, le=10_000_000, decimal_places=2),
                  PlainSerializer(_money_str, return_type=str)]
MoneyOut = Annotated[Decimal, PlainSerializer(_money_str, return_type=str)]
DealType = Literal["review", "rating_only", "review_photo", "review_video", "other"]
Name = Annotated[str, Field(min_length=1, max_length=120)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorOut(BaseModel):
    error: ErrorBody


class HealthOut(BaseModel):
    status: str


class MeOut(BaseModel):
    id: uuid.UUID
    name: str | None
    email: str
    avatar_url: str | None
    role: str
    alert_days: int
    timezone: str


class SettingsIn(Strict):
    alert_days: int | None = Field(default=None, ge=0, le=14)
    timezone: str | None = None

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str | None) -> str | None:
        if v is not None and v not in valid_timezones():
            raise ValueError("unknown timezone, use an IANA name like Asia/Kolkata")
        return v


class MediatorIn(Strict):
    name: Name
    contact: str | None = Field(default=None, max_length=200)


class MediatorPatch(Strict):
    name: Name | None = None
    contact: str | None = Field(default=None, max_length=200)


class MediatorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    contact: str | None
    created_at: datetime
    updated_at: datetime


class MediatorStatsOut(MediatorOut):
    pending_refund_amount: MoneyOut
    open_deal_count: int


class _DealFields(Strict):
    product: str | None = Field(default=None, min_length=1, max_length=200)
    platform: str | None = Field(default=None, max_length=100)
    mediator_id: uuid.UUID | None = None
    mediator_name: Name | None = None
    deal_type: DealType | None = None
    date_taken: date | None = None
    amount_paid: Money | None = None
    less_amount: Money | None = None
    refund_amount: Money | None = None
    commission: Money | None = None
    review_deadline: date | None = None
    refund_form_deadline: date | None = None
    review_status: Literal["pending", "done"] | None = None
    form_status: Literal["pending", "submitted"] | None = None
    payment_status: Literal["pending", "received", "disputed"] | None = None
    payment_received_on: date | None = None
    notes: str | None = Field(default=None, max_length=2000)


class DealIn(_DealFields):
    client_id: uuid.UUID | None = None
    product: str = Field(min_length=1, max_length=200)


class DealPatch(_DealFields):
    """Only fields present in the request are changed (model_fields_set)."""


class ActionIn(Strict):
    action: Literal[ACTIONS]  # type: ignore[valid-type]
    payment_received_on: date | None = None


class DealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    client_id: uuid.UUID | None
    product: str
    platform: str | None
    mediator_id: uuid.UUID | None
    mediator_name: str | None
    deal_type: str
    date_taken: date
    amount_paid: MoneyOut
    less_amount: MoneyOut
    refund_amount: MoneyOut
    commission: MoneyOut
    review_deadline: date | None
    refund_form_deadline: date | None
    review_status: str
    form_status: str
    payment_status: str
    payment_received_on: date | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    net_amount: MoneyOut
    is_urgent: bool
    is_overdue: bool
    urgency_reason: str | None


class DealPage(BaseModel):
    items: list[DealOut]
    next_cursor: str | None


class SyncOp(Strict):
    op_id: uuid.UUID
    type: Literal["deal", "mediator"]
    op: Literal["upsert", "delete"]
    id: uuid.UUID | None = None
    client_id: uuid.UUID | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    client_updated_at: AwareDatetime

    @field_validator("data")
    @classmethod
    def _bounded_data(cls, value: dict[str, Any]) -> dict[str, Any]:
        pending: list[tuple[Any, int]] = [(value, 1)]
        total_keys = 0
        while pending:
            item, depth = pending.pop()
            if depth > 4:
                raise ValueError("sync operation data cannot be nested more than 4 levels")
            if isinstance(item, dict):
                total_keys += len(item)
                if total_keys > 50:
                    raise ValueError("sync operation data cannot contain more than 50 keys")
                for key, child in item.items():
                    if len(key) > 128:
                        raise ValueError("sync operation data keys cannot exceed 128 characters")
                    if isinstance(child, str) and len(child) > 2000:
                        raise ValueError("sync operation strings cannot exceed 2000 characters")
                    if isinstance(child, (dict, list)):
                        pending.append((child, depth + 1))
            elif isinstance(item, list):
                if len(item) > 100:
                    raise ValueError("sync operation arrays cannot contain more than 100 values")
                for child in item:
                    if isinstance(child, str) and len(child) > 2000:
                        raise ValueError("sync operation strings cannot exceed 2000 characters")
                    if isinstance(child, (dict, list)):
                        pending.append((child, depth + 1))
        return value


class SyncPushIn(Strict):
    ops: list[SyncOp] = Field(max_length=100)


class SyncResult(BaseModel):
    op_id: uuid.UUID
    status: Literal["applied", "duplicate", "rejected"]
    reason: str | None = None
    id: uuid.UUID | None = None


class SyncPushOut(BaseModel):
    results: list[SyncResult]


class SyncDeleted(BaseModel):
    deals: list[uuid.UUID]
    mediators: list[uuid.UUID]


class SyncChangesOut(BaseModel):
    server_time: datetime
    deals: list[DealOut]
    mediators: list[MediatorOut]
    deleted: SyncDeleted
    next_cursor: str | None


class TopMediator(BaseModel):
    id: uuid.UUID
    name: str
    pending_refund_amount: MoneyOut
    open_deal_count: int


class SummaryOut(BaseModel):
    total_paid: MoneyOut
    refund_pending_amount: MoneyOut
    refund_received_amount: MoneyOut
    gain_loss: MoneyOut
    open_deals: int
    urgent_count: int
    overdue_count: int
    top_mediators: list[TopMediator]


IMPORT_FIELDS = {
    "product", "platform", "mediator", "deal_type", "date_taken", "amount_paid", "less_amount",
    "refund_amount", "commission", "review_deadline", "refund_form_deadline", "review_status",
    "form_status", "payment_status", "payment_received_on", "notes",
}


class ImportStatusDefaults(Strict):
    review_status: Literal["pending", "done"] | None = None
    form_status: Literal["pending", "submitted"] | None = None
    payment_status: Literal["pending", "received", "disputed"] | None = None


class ImportDefaults(Strict):
    platform: str | None = Field(default=None, max_length=100)
    mediator: str | None = Field(default=None, max_length=100)
    deal_type: str | None = Field(default=None, max_length=100)
    date_taken: str | None = Field(default=None, max_length=100)
    review_status: Literal["pending", "done"] | None = None
    form_status: Literal["pending", "submitted"] | None = None
    payment_status: Literal["pending", "received", "disputed"] | None = None
    statuses: ImportStatusDefaults | None = None


class ImportOptions(Strict):
    date_order: Literal["dmy", "mdy"] = "dmy"
    duplicate_policy: Literal["skip", "import"] = "skip"
    value_maps: dict[str, dict[str, str]] = Field(default_factory=dict)
    defaults: ImportDefaults = Field(default_factory=ImportDefaults)

    @field_validator("value_maps")
    @classmethod
    def _status_maps(cls, maps: dict[str, dict[str, str]]) -> dict[str, dict[str, str]]:
        allowed = {
            "review_status": {"pending", "done"},
            "form_status": {"pending", "submitted"},
            "payment_status": {"pending", "received", "disputed"},
        }
        if any(field not in allowed or any(value not in allowed[field] for value in field_maps.values())
               for field, field_maps in maps.items()):
            raise ValueError("value_maps must map known status fields to allowed statuses")
        return maps


class ImportRequest(Strict):
    rows: list[dict[str, str | None]] = Field(min_length=1, max_length=5000)
    options: ImportOptions = Field(default_factory=ImportOptions)

    @field_validator("rows")
    @classmethod
    def _mapped_fields(cls, rows: list[dict[str, str | None]]) -> list[dict[str, str | None]]:
        if any(field not in IMPORT_FIELDS for row in rows for field in row):
            raise ValueError("rows may contain only mapped import target fields")
        return rows


class ImportCommitIn(ImportRequest):
    import_id: uuid.UUID
    filename: str | None = Field(default=None, max_length=255)


class ImportPreviewRow(BaseModel):
    row_number: int
    status: Literal["ok", "duplicate", "error"]
    will_import: bool
    duplicate_of: int | None = None
    duplicate_reason: str | None = None
    existing_deal_id: uuid.UUID | None = None
    values: dict[str, Any]
    errors: list[dict[str, str]]
    warnings: list[dict[str, str]]


class ImportPreviewCounts(BaseModel):
    total: int
    will_import: int
    duplicates: int
    errors: int


class ImportMediatorMatch(BaseModel):
    input_name: str
    existing_name: str


class ImportReconciliation(BaseModel):
    total_paid: str
    total_refund: str
    total_gain_loss: str
    pending_refund: str


class ImportPreviewOut(BaseModel):
    rows: list[ImportPreviewRow]
    counts: ImportPreviewCounts
    unrecognized_status_values: dict[str, list[str]]
    mediators_to_create: list[str]
    existing_mediators: list[ImportMediatorMatch]
    reconciliation: ImportReconciliation


class ImportJobOut(BaseModel):
    id: uuid.UUID
    import_id: uuid.UUID
    filename: str | None
    status: Literal["committed", "undone", "failed"]
    rows_total: int
    rows_imported: int
    rows_skipped_duplicate: int
    rows_failed: int
    mediators_created: int
    total_paid: MoneyOut
    total_refund: MoneyOut
    errors: list[dict[str, Any]]
    options: dict[str, Any]
    created_at: datetime
    undone_at: datetime | None


class ImportUndoOut(BaseModel):
    job: ImportJobOut
    deleted_deals: int
    deleted_mediators: int
    edited_deals_warning: int
    warning: str
