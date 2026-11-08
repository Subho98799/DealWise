import uuid
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.auth.deps import CurrentUser, current_user
from app.config import get_settings

engine = create_engine(
    get_settings().DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
    # Disable server-side prepared statements: required behind Neon's pooled (PgBouncer) endpoint.
    connect_args={"prepare_threshold": None},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def ping() -> None:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
# def ping() -> None:
#     with engine.connect() as conn:
#         result = conn.execute(text("""
#             SELECT
#                 current_user,
#                 to_regclass('public.users'),
#                 has_table_privilege(
#                     current_user,
#                     'public.users',
#                     'INSERT'
#                 )
#         """))

#         print("DB DIAGNOSTIC:", result.fetchone())

#         conn.execute(text("SELECT 1"))

def set_user_context(session: Session, user_id: uuid.UUID) -> None:
    # is_local=true: the setting dies with the transaction, so a pooled connection never leaks it.
    session.execute(
        text("SELECT set_config('app.current_user_id', :uid, true)"), {"uid": str(user_id)}
    )


def get_user_db(user: CurrentUser = Depends(current_user)) -> Iterator[Session]:
    """One transaction per request, scoped by RLS to the logged-in user."""
    session = SessionLocal()
    try:
        session.begin()
        set_user_context(session, user.id)
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


UserDB = Annotated[Session, Depends(get_user_db)]
