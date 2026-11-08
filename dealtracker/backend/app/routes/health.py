from fastapi import APIRouter, Request

from app.db import ping
from app.schemas import HealthOut
from app.security import limiter

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("", response_model=HealthOut)
@limiter.exempt
async def health(request: Request) -> HealthOut:
    """Liveness for the keep-alive pinger. Must never touch the database."""
    return HealthOut(status="ok")


@router.get("/db", response_model=HealthOut)
def health_db(request: Request) -> HealthOut:
    ping()
    return HealthOut(status="ok")
