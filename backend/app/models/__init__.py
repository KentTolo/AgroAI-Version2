"""ORM models. Importing this package registers every table on ``Base.metadata``."""

from app.models.crop_cycle import CropCycle, CycleStatus
from app.models.device import Device, Telemetry
from app.models.field import Field
from app.models.reading import ReadingSource, SensorReading
from app.models.recommendation import Recommendation
from app.models.user import User
from app.models.weather import WeatherDay

__all__ = [
    "CropCycle",
    "CycleStatus",
    "Device",
    "Field",
    "ReadingSource",
    "Recommendation",
    "SensorReading",
    "Telemetry",
    "User",
    "WeatherDay",
]
