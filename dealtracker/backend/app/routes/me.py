from fastapi import APIRouter, Depends, Response

from app.auth import service
from app.auth.deps import CurrentUser, current_user
from app.auth.sessions import clear_session_cookie
from app.schemas import MeOut

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("", response_model=MeOut)
def get_me(user: CurrentUser = Depends(current_user)) -> MeOut:
    return MeOut(
        id=user.id, name=user.name, email=user.email, avatar_url=user.avatar_url, role=user.role
    )


@router.delete("", status_code=204)
def delete_me(user: CurrentUser = Depends(current_user)) -> Response:
    service.delete_user(user.id)
    response = Response(status_code=204)
    clear_session_cookie(response)
    return response
