"""Schemas for typical soil values used to prefill soil tests."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import Schema


class SoilLabRead(Schema):
    ph: float
    nitrogen_total_g_kg: float = Field(description="Total nitrogen, g/kg")
    phosphorus_ppm: float = Field(description="Extractable phosphorus (Mehlich-3), mg/kg")
    potassium_ppm: float = Field(description="Extractable potassium (Mehlich-3), mg/kg")
    bulk_density_g_cm3: float


class SoilDefaultsRead(Schema):
    scope: Literal["local", "district", "national"]
    district: str | None
    description: str
    source: str
    lab: SoilLabRead = Field(description="The published values, in laboratory units")
    nitrogen: float = Field(description="Model input, kg/ha (estimated plant-available N)")
    phosphorus: float = Field(description="Model input, kg/ha")
    potassium: float = Field(description="Model input, kg/ha")
    ph: float
    notes: list[str]
