import uuid
from dataclasses import dataclass, replace
from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy import delete, select, update

from app.auth.sessions import (
    SESSION_TTL,
    TOUCH_INTERVAL,
    hash_token,
    set_session_cookie,
    utcnow,
)
from app.config import SESSION_COOKIE
from app.errors import AppError
from app.models import User, UserSession


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    session_id: uuid.UUID
    email: str
    name: str | None
    avatar_url: str | None
    role: str
    alert_days: int
    timezone: str

    def with_settings(self, **changes) -> "CurrentUser":
        return replace(self, **changes)


def _unauthorized(message: str = "Please log in.") -> AppError:
    return AppError(401, "not_authenticated", message)


def current_user(request: Request, response: Response) -> CurrentUser:
    raw = request.cookies.get(SESSION_COOKIE)
    if not raw:
        raise _unauthorized()

    from app.db import SessionLocal  # local import: app.db imports this module

    now = utcnow()
    expired = False
    with SessionLocal.begin() as db:
        row = db.execute(
            select(UserSession, User)
            .join(User, User.id == UserSession.user_id)
            .where(UserSession.token_hash == hash_token(raw))
        ).first()
        if row is None:
            raise _unauthorized()
        sess, user = row
        if sess.expires_at <= now:
            db.execute(delete(UserSession).where(UserSession.id == sess.id))
            expired = True
        elif sess.last_seen_at is None or now - sess.last_seen_at >= TOUCH_INTERVAL:
            db.execute(
                update(UserSession)
                .where(UserSession.id == sess.id)
                .values(last_seen_at=now, expires_at=now + SESSION_TTL)
            )
            db.execute(update(User).where(User.id == user.id).values(last_active_at=now))
            set_session_cookie(response, raw)  # sliding expiry for the cookie too
    if expired:
        raise _unauthorized("Session expired, please log in again.")

    return CurrentUser(
        id=user.id,
        session_id=sess.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        role=user.role,
        alert_days=user.alert_days,
        timezone=user.timezone,
    )


Me = Annotated[CurrentUser, Depends(current_user)]
