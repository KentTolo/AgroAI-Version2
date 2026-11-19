"""Milestones and alerts worth a WhatsApp message, as pure functions over plain data.

Each alert has a stable key, so the daily run sends it once however often it runs.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from app.services.crops import CropInfo
from app.services.growth import compute_progress
from app.services.weather import DailyWeather

FROST_C = 1.0  # minimum temperature at or below which frost is likely on crops
HEAVY_RAIN_MM = 25.0
STATION_SILENT_AFTER = timedelta(hours=6)
HARVEST_SOON_DAYS = 7


@dataclass(frozen=True, slots=True)
class Alert:
    key: str
    kind: str
    text: str


def _short_date(day: date) -> str:
    return f"{day.day} {day:%b}"


def cycle_alerts(
    *,
    cycle_id: str,
    number: int,
    crop: CropInfo,
    field_name: str,
    planted_on: date,
    expected_harvest_on: date,
    today: date,
) -> list[Alert]:
    """The current growth stage, harvest approaching and harvest due for one planting."""
    progress = compute_progress(crop, planted_on, expected_harvest_on, today)
    label = f"{crop.name} on {field_name}"
    alerts: list[Alert] = []
    if today < planted_on:
        return alerts
    for index, stage in enumerate(progress.stages):
        if stage.status == "current":
            alerts.append(
                Alert(
                    key=f"cycle:{cycle_id}:stage:{index}",
                    kind="stage",
                    text=(
                        f"{label} is now in *{stage.name.lower()}* "
                        f"(day {progress.day} of {progress.total_days}). {stage.guidance}"
                    ),
                )
            )
            break
    if 0 < progress.days_remaining <= HARVEST_SOON_DAYS:
        alerts.append(
            Alert(
                key=f"cycle:{cycle_id}:harvest-soon",
                kind="harvest_soon",
                text=(
                    f"{label} should be ready in about {progress.days_remaining} days "
                    f"({_short_date(expected_harvest_on)}). Prepare bags, storage and labour."
                ),
            )
        )
    if today >= expected_harvest_on:
        alerts.append(
            Alert(
                key=f"cycle:{cycle_id}:harvest-due",
                kind="harvest_due",
                text=(
                    f"{label} should be ready to harvest now. When you have harvested, reply "
                    f"*HARVESTED {number} <kg>*, for example HARVESTED {number} 350."
                ),
            )
        )
    return alerts


def weather_alerts(
    *, field_id: str, field_name: str, forecast: Sequence[DailyWeather], today: date
) -> list[Alert]:
    """Frost and heavy rain in the next three days, for a field with crops in the ground."""
    alerts: list[Alert] = []
    upcoming = [d for d in forecast if today <= d.day <= today + timedelta(days=2)]
    frost = next(
        (d for d in upcoming if d.temperature_min is not None and d.temperature_min <= FROST_C),
        None,
    )
    if frost is not None:
        when = "tonight" if frost.day == today else f"on {frost.day:%A}"
        alerts.append(
            Alert(
                key=f"field:{field_id}:frost:{frost.day.isoformat()}",
                kind="frost",
                text=(
                    f"Frost risk on {field_name} {when}: a low of {frost.temperature_min:.0f}°C. "
                    "Cover seedlings, water the soil in the afternoon and delay planting "
                    "frost-tender crops."
                ),
            )
        )
    rain = next((d for d in upcoming if d.precipitation >= HEAVY_RAIN_MM), None)
    if rain is not None:
        alerts.append(
            Alert(
                key=f"field:{field_id}:rain:{rain.day.isoformat()}",
                kind="heavy_rain",
                text=(
                    f"Heavy rain expected on {field_name} on {rain.day:%A} "
                    f"(about {rain.precipitation:.0f} mm). Clear drainage furrows and hold off on "
                    "fertiliser and spraying until it passes."
                ),
            )
        )
    return alerts


def station_alerts(
    *,
    device_id: str,
    device_name: str,
    field_name: str,
    last_seen_at: datetime | None,
    now: datetime,
) -> list[Alert]:
    """A sensor station that has gone quiet (it normally reports every 15 minutes)."""
    if last_seen_at is None or now - last_seen_at < STATION_SILENT_AFTER:
        return []
    return [
        Alert(
            # One alert per silence: the key changes once the station reports again.
            key=f"device:{device_id}:silent:{last_seen_at.isoformat(timespec='minutes')}",
            kind="station_silent",
            text=(
                f'Sensor station "{device_name}" on {field_name} has not reported since '
                f"{_short_date(last_seen_at.date())} {last_seen_at:%H:%M} UTC. Check the battery, "
                "solar panel and Wi-Fi."
            ),
        )
    ]


def compose_digest(first_name: str, alerts: Sequence[Alert], today: date) -> str:
    """One message per farmer per day, however many alerts there are."""
    lines = [f"*AgroAI* · {today:%a} {_short_date(today)}", "", f"Hello {first_name},"]
    for alert in alerts:
        lines += ["", f"• {alert.text}"]
    lines += ["", "Reply STATUS for your plantings, HELP for commands or ALERTS OFF to stop."]
    return "\n".join(lines)
