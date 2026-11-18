from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class Schema(BaseModel):
    """Base for API schemas: reads from ORM objects and rejects unknown fields on input."""

    model_config = ConfigDict(from_attributes=True, extra="forbid")


class Page[T](Schema):
    items: list[T]
    total: int
    limit: int
    offset: int


Limit = Annotated[int, Field(ge=1, le=200, description="Maximum items to return")]
Offset = Annotated[int, Field(ge=0, description="Number of items to skip")]


class GrowingConditions(Schema):
    """Soil nutrients and climate for one location, in the units of the training data."""

    nitrogen: float = Field(ge=0, le=300, description="Soil nitrogen (kg/ha)", examples=[90])
    phosphorus: float = Field(ge=0, le=300, description="Soil phosphorus (kg/ha)", examples=[42])
    potassium: float = Field(ge=0, le=300, description="Soil potassium (kg/ha)", examples=[43])
    temperature: float = Field(ge=-20, le=60, description="Air temperature (°C)", examples=[20.9])
    humidity: float = Field(ge=0, le=100, description="Relative humidity (%)", examples=[82])
    ph: float = Field(ge=0, le=14, description="Soil pH", examples=[6.5])
    rainfall: float = Field(ge=0, le=1000, description="Rainfall (mm)", examples=[203])
