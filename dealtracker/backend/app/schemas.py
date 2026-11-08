import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Money = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
DealType = Literal["review", "rating_only", "review_photo", "review_video", "other"]


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


# extra="forbid": a client can never smuggle user_id (or any unknown field) into a write.
class MediatorCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    contact: str | None = Field(default=None, max_length=200)


class MediatorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    contact: str | None
    created_at: datetime


class DealCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_id: uuid.UUID | None = None
    product: str = Field(min_length=1, max_length=300)
    platform: str | None = Field(default=None, max_length=100)
    mediator_id: uuid.UUID | None = None
    deal_type: DealType = "review"
    date_taken: date
    amount_paid: Money = Decimal("0")
    refund_amount: Money = Decimal("0")
    commission: Money = Decimal("0")
    review_deadline: date | None = None
    refund_form_deadline: date | None = None
    notes: str | None = Field(default=None, max_length=2000)


class DealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    client_id: uuid.UUID | None
    product: str
    platform: str | None
    mediator_id: uuid.UUID | None
    deal_type: str
    date_taken: date
    amount_paid: Decimal
    refund_amount: Decimal
    commission: Decimal
    review_deadline: date | None
    refund_form_deadline: date | None
    review_status: str
    form_status: str
    payment_status: str
    payment_received_on: date | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
