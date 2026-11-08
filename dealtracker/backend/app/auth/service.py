import uuid

from sqlalchemy import delete, func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.auth.sessions import create_session, delete_session
from app.db import SessionLocal
from app.models import User


def login_user(
    google_sub: str, email: str, name: str | None, avatar_url: str | None, user_agent: str | None
) -> str:
    """Upsert the user by google_sub and open a new session. Returns the raw session token."""
    with SessionLocal.begin() as db:
        stmt = (
            pg_insert(User)
            .values(
                google_sub=google_sub,
                email=email,
                name=name,
                avatar_url=avatar_url,
                last_active_at=func.now(),
            )
            .on_conflict_do_update(
                index_elements=[User.google_sub],
                set_={
                    "email": email,
                    "name": name,
                    "avatar_url": avatar_url,
                    "last_active_at": func.now(),
                },
            )
            .returning(User.id)
        )
        user_id = db.execute(stmt).scalar_one()
        return create_session(db, user_id, user_agent)


def logout(raw_token: str) -> None:
    with SessionLocal.begin() as db:
        delete_session(db, raw_token)


def delete_user(user_id: uuid.UUID) -> None:
    """ON DELETE CASCADE removes sessions, mediators and deals."""
    with SessionLocal.begin() as db:
        db.execute(delete(User).where(User.id == user_id))
