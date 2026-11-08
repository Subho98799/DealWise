from fastapi import APIRouter, Depends, Response

from app.auth import service
from app.auth.deps import CurrentUser, current_user
from app.auth.sessions import clear_session_cookie
from app.schemas import MeOut, SettingsIn

router = APIRouter(prefix="/api/me", tags=["me"])


def _out(u: CurrentUser) -> MeOut:
    return MeOut(id=u.id, name=u.name, email=u.email, avatar_url=u.avatar_url, role=u.role,
                 alert_days=u.alert_days, timezone=u.timezone)


@router.get("", response_model=MeOut)
def get_me(user: CurrentUser = Depends(current_user)) -> MeOut:
    return _out(user)


@router.patch("/settings", response_model=MeOut)
def patch_settings(body: SettingsIn, user: CurrentUser = Depends(current_user)) -> MeOut:
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if changes:
        service.update_settings(user.id, changes)
    return _out(user.with_settings(**changes))


@router.delete("", status_code=204)
def delete_me(user: CurrentUser = Depends(current_user)) -> Response:
    service.delete_user(user.id)
    response = Response(status_code=204)
    clear_session_cookie(response)
    return response
