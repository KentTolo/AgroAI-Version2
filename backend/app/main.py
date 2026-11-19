"""FastAPI application factory."""

from __future__ import annotations

import logging
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    admin,
    agronomy,
    auth,
    cycles,
    dashboard,
    devices,
    fields,
    health,
    users,
    weather,
    whatsapp,
)
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.ml.predictor import CropRecommender, ModelNotAvailableError

logger = logging.getLogger("agroai")

DESCRIPTION = """
AgroAI helps smallholder farmers decide what to plant and how to care for it.

* **Recommendations** rank crops for measured soil and climate conditions using a machine
  learning model.
* **Advisory** checks a chosen crop against the conditions and suggests corrective actions.
* **Fields, readings and crop cycles** let farmers monitor plots and track plantings to harvest.
* **Weather** syncs daily history and forecasts for each field from Open-Meteo and turns them
  into climate inputs for recommendations.

Authenticate with `POST /api/v1/auth/login`, then send `Authorization: Bearer <token>`.
"""


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        try:
            app.state.recommender = CropRecommender.load(settings.artifacts_dir)
        except ModelNotAvailableError as exc:
            app.state.recommender = None
            logger.warning("Recommendations disabled: %s", exc)
        yield

    app = FastAPI(
        title=f"{settings.project_name} API",
        version="1.0.0",
        description=DESCRIPTION,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-Request-ID"],
    )

    @app.middleware("http")
    async def request_context(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        logger.info(
            "%s %s -> %d (%.1f ms) [%s]",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            request_id,
        )
        return response

    api = APIRouter(prefix=settings.api_v1_prefix)
    for module in (
        auth,
        users,
        fields,
        weather,
        devices,
        cycles,
        agronomy,
        dashboard,
        admin,
        whatsapp,
    ):
        api.include_router(module.router)
    app.include_router(api)
    app.include_router(health.router)
    return app


app = create_app()
