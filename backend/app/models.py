import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (Computed, Date, DateTime, ForeignKey, ForeignKeyConstraint, Numeric,
                        SmallInteger, Text, UniqueConstraint, func, text)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    type_annotation_map = {
        str: Text,
        datetime: DateTime(timezone=True),
        date: Date,
        Decimal: Numeric(12, 2),
        uuid.UUID: UUID(as_uuid=True),
    }


def _pk() -> Mapped[uuid.UUID]:
    return mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))


def _created() -> Mapped[datetime]:
    return mapped_column(server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _pk()
    google_sub: Mapped[str] = mapped_column(unique=True)
    email: Mapped[str]
    name: Mapped[str | None]
    avatar_url: Mapped[str | None]
    role: Mapped[str] = mapped_column(server_default="user")
    created_at: Mapped[datetime] = _created()
    last_active_at: Mapped[datetime | None]
    alert_days: Mapped[int] = mapped_column(SmallInteger, server_default="2")
    timezone: Mapped[str] = mapped_column(server_default="Asia/Kolkata")


class UserSession(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(unique=True)
    created_at: Mapped[datetime] = _created()
    expires_at: Mapped[datetime]
    last_seen_at: Mapped[datetime | None]
    user_agent: Mapped[str | None]


class Mediator(Base):
    __tablename__ = "mediators"

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str]
    contact: Mapped[str | None]
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _created()
    deleted_at: Mapped[datetime | None]
    client_updated_at: Mapped[datetime | None]  # last-write-wins clock


class Deal(Base):
    __tablename__ = "deals"

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    client_id: Mapped[uuid.UUID | None]
    product: Mapped[str]
    platform: Mapped[str | None]
    # DB enforces a composite FK (mediator_id, user_id) -> mediators(id, user_id).
    mediator_id: Mapped[uuid.UUID | None]
    mediator_name: Mapped[str | None]  # snapshot, survives mediator soft delete
    deal_type: Mapped[str] = mapped_column(server_default="review")
    date_taken: Mapped[date]
    amount_paid: Mapped[Decimal] = mapped_column(server_default="0")
    less_amount: Mapped[Decimal] = mapped_column(server_default="0")
    refund_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), Computed("amount_paid - less_amount + commission", persisted=True),
    )
    commission: Mapped[Decimal] = mapped_column(server_default="0")
    review_deadline: Mapped[date | None]
    refund_form_deadline: Mapped[date | None]
    refund_form_filled_on: Mapped[date | None]
    review_status: Mapped[str] = mapped_column(server_default="pending")
    form_status: Mapped[str] = mapped_column(server_default="pending")
    payment_status: Mapped[str] = mapped_column(server_default="pending")
    payment_received_on: Mapped[date | None]
    notes: Mapped[str | None]
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _created()
    deleted_at: Mapped[datetime | None]
    client_updated_at: Mapped[datetime | None]  # last-write-wins clock
    import_job_id: Mapped[uuid.UUID | None]

    __table_args__ = (
        ForeignKeyConstraint(
            ["import_job_id", "user_id"],
            ["import_jobs.id", "import_jobs.user_id"],
            ondelete="SET NULL (import_job_id)",
        ),
    )


class ImportJob(Base):
    __tablename__ = "import_jobs"
    __table_args__ = (
        UniqueConstraint("id", "user_id"),
        UniqueConstraint("user_id", "import_id"),
    )

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    import_id: Mapped[uuid.UUID]
    filename: Mapped[str | None]
    status: Mapped[str]
    rows_total: Mapped[int]
    rows_imported: Mapped[int]
    rows_skipped_duplicate: Mapped[int]
    rows_failed: Mapped[int]
    mediators_created: Mapped[int]
    total_paid: Mapped[Decimal]
    total_refund: Mapped[Decimal]
    errors: Mapped[list] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    options: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = _created()
    undone_at: Mapped[datetime | None]


class SyncOpRecord(Base):
    __tablename__ = "sync_ops"

    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    op_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    record_id: Mapped[uuid.UUID | None]
    created_at: Mapped[datetime] = _created()
