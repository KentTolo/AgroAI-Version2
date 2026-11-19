from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field, model_validator

from app.schemas.common import Schema

MEASUREMENTS = (
    "air_temperature",
    "air_humidity",
    "soil_moisture",
    "soil_temperature",
    "battery_voltage",
)


class DeviceCreate(Schema):
    name: str = Field(min_length=1, max_length=80, examples=["Home field station"])


class TelemetryCreate(Schema):
    """Sent by a device. Include whichever measurements the kit has."""

    recorded_at: datetime | None = Field(default=None, description="Defaults to time received")
    air_temperature: float | None = Field(default=None, ge=-40, le=85, description="°C")
    air_humidity: float | None = Field(default=None, ge=0, le=100, description="%")
    soil_moisture: float | None = Field(default=None, ge=0, le=100, description="% (calibrated)")
    soil_temperature: float | None = Field(default=None, ge=-55, le=125, description="°C")
    battery_voltage: float | None = Field(default=None, ge=0, le=15, description="V")
    signal_strength: int | None = Field(default=None, ge=-120, le=0, description="Wi-Fi RSSI, dBm")

    @model_validator(mode="after")
    def _has_a_measurement(self) -> TelemetryCreate:
        if all(getattr(self, name) is None for name in MEASUREMENTS):
            raise ValueError("Send at least one measurement")
        return self


class TelemetryRead(Schema):
    id: uuid.UUID
    device_id: uuid.UUID
    recorded_at: datetime
    air_temperature: float | None
    air_humidity: float | None
    soil_moisture: float | None
    soil_temperature: float | None
    battery_voltage: float | None
    signal_strength: int | None


class DeviceRead(Schema):
    id: uuid.UUID
    field_id: uuid.UUID
    name: str
    key_prefix: str
    created_at: datetime
    last_seen_at: datetime | None
    latest: TelemetryRead | None = None


class DeviceWithKey(DeviceRead):
    api_key: str = Field(description="Shown only once. Store it in the device firmware.")


class SensorSummary(Schema):
    """Averages of a field's telemetry over a recent window, for use as model inputs."""

    days: int
    readings: int
    start: datetime | None
    end: datetime | None
    air_temperature: float | None
    air_humidity: float | None
    soil_moisture: float | None
    soil_temperature: float | None
