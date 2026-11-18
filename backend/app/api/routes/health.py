from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import text

from app.api.deps import DbSession

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "unavailable"] | None = None
    model: str | None = None


@router.get("/health", response_model=Health)
def liveness() -> Health:
    """The process is up. Used by container orchestrators for restarts."""
    return Health(status="ok")


@router.get("/health/ready", response_model=Health)
def readiness(request: Request, response: Response, db: DbSession) -> Health:
    """The API can serve traffic: database reachable and model loaded."""
    try:
        db.execute(text("SELECT 1"))
        database: Literal["ok", "unavailable"] = "ok"
    except Exception:
        database = "unavailable"

    recommender = getattr(request.app.state, "recommender", None)
    healthy = database == "ok" and recommender is not None
    if not healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return Health(
        status="ok" if healthy else "degraded",
        database=database,
        model=recommender.version if recommender else None,
    )
