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


class TopMediator(BaseModel):
    id: uuid.UUID
    name: str
    pending_refund_amount: MoneyOut
    open_deal_count: int


class SummaryOut(BaseModel):
    total_paid: MoneyOut
    refund_pending_amount: MoneyOut
    refund_received_amount: MoneyOut
    net_profit: MoneyOut
    open_deals: int
    urgent_count: int
    overdue_count: int
    top_mediators: list[TopMediator]
