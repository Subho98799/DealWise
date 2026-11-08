import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, insert
from sqlalchemy.orm import Session
from starlette.responses import Response

from app.config import SESSION_COOKIE, get_settings
from app.models import UserSession

SESSION_TTL = timedelta(days=30)
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


def delete_session(db: Session, raw: str) -> None:
    db.execute(delete(UserSession).where(UserSession.token_hash == hash_token(raw)))


def set_session_cookie(response: Response, raw: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        raw,
        max_age=int(SESSION_TTL.total_seconds()),
        path="/",
        httponly=True,
        secure=get_settings().is_prod,
        samesite="lax",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        SESSION_COOKIE, path="/", httponly=True, secure=get_settings().is_prod, samesite="lax"
    )
