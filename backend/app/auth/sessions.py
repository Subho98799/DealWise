import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, insert, or_, select
from sqlalchemy.orm import Session
from starlette.responses import Response

from app.config import get_settings, session_cookie_name
from app.models import UserSession

SESSION_TTL = timedelta(days=30)
ABSOLUTE_SESSION_TTL = timedelta(days=90)
TOUCH_INTERVAL = timedelta(minutes=10)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_token() -> str:
    return secrets.token_urlsafe(32)  # 32 random bytes


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def create_session(db: Session, user_id: uuid.UUID, user_agent: str | None) -> str:
    raw = new_token()
    now = utcnow()
    db.execute(
        insert(UserSession).values(
            user_id=user_id,
            token_hash=hash_token(raw),
            expires_at=now + SESSION_TTL,
            last_seen_at=now,
            user_agent=(user_agent or "")[:255] or None,
        )
    )
    return raw


def cleanup_expired_sessions(db: Session, limit: int = 100) -> int:
    now = utcnow()
    expired = select(UserSession.id).where(
        or_(
            UserSession.expires_at <= now,
            UserSession.created_at <= now - ABSOLUTE_SESSION_TTL,
        )
    ).order_by(UserSession.created_at, UserSession.id).limit(limit)
    result = db.execute(delete(UserSession).where(UserSession.id.in_(expired)))
    return result.rowcount or 0


def delete_session(db: Session, raw: str) -> None:
    db.execute(delete(UserSession).where(UserSession.token_hash == hash_token(raw)))


def set_session_cookie(response: Response, raw: str, max_age: int | None = None) -> None:
    response.set_cookie(
        session_cookie_name(),
        raw,
        max_age=max_age if max_age is not None else int(SESSION_TTL.total_seconds()),
        path="/",
        httponly=True,
        secure=get_settings().is_prod,
        samesite="lax",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        session_cookie_name(), path="/", httponly=True, secure=get_settings().is_prod, samesite="lax"
    )
