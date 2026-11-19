"""Typical soil values for a location, to prefill soil tests until a real one is taken."""

from __future__ import annotations

from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Query

from app.schemas.soil import SoilDefaultsRead
from app.services.soil import soil_defaults

router = APIRouter(tags=["soil"])


@router.get("/soil/defaults", response_model=SoilDefaultsRead)
def get_soil_defaults(
    latitude: Annotated[float | None, Query(ge=-90, le=90)] = None,
    longitude: Annotated[float | None, Query(ge=-180, le=180)] = None,
) -> SoilDefaultsRead:
    """Typical topsoil pH, N, P and K near a point in Lesotho (iSDAsoil), in model units.

    Without a location, or outside Lesotho, returns the national typical values.
    """
    return SoilDefaultsRead.model_validate(asdict(soil_defaults(latitude, longitude)))
