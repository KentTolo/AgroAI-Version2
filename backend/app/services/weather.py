"""Weather feed: forecasts and historical daily weather from Open-Meteo, and climate summaries.

Open-Meteo (https://open-meteo.com) is free for non-commercial use, needs no API key, and
serves both forecasts and the ERA5 reanalysis archive (daily history back to 1940). Its data is
licensed CC BY 4.0, so the app credits it wherever weather is shown.

How weather maps onto the model's inputs
----------------------------------------
The crop model takes average temperature (°C), average relative humidity (%) and rainfall (mm).
The training data does not define the rainfall period; this module treats it as **average
monthly rainfall** (mm per 30 days) over the period of interest, which matches the dataset's
value range for crops' growing seasons. See docs/model-card.md.
"""

from __future__ import annotations

import contextlib
import logging
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from statistics import fmean
from typing import Any, Protocol

import httpx

logger = logging.getLogger(__name__)

DAILY_VARIABLES = (
    "temperature_2m_mean",
    "temperature_2m_min",
    "temperature_2m_max",
    "precipitation_sum",
    "relative_humidity_2m_mean",
)
RAIN_PERIOD_DAYS = 30
# ERA5 archive data trails real time by about five days; newer days come from the forecast API.
ARCHIVE_LAG_DAYS = 6
# A month counts towards rainfall averages only if most of its days are present.
MIN_DAYS_FOR_MONTHLY_TOTAL = 25
MONTH_NAMES = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


class WeatherUnavailableError(RuntimeError):
    """The weather provider could not be reached or returned an error."""

    def __init__(self, message: str, *, rate_limited: bool = False) -> None:
        super().__init__(message)
        self.rate_limited = rate_limited


@dataclass(frozen=True, slots=True)
class DailyWeather:
    day: date
    temperature_mean: float
    temperature_min: float | None
    temperature_max: float | None
    precipitation: float
    humidity_mean: float | None
    source: str  # "archive" (reanalysis), "recent" (forecast model, provisional) or "forecast"


class WeatherClient(Protocol):
    def history(
        self, latitude: float, longitude: float, start: date, end: date
    ) -> list[DailyWeather]:
        """Observed daily weather for ``start``..``end`` inclusive (end may be today)."""
        ...

    def forecast(self, latitude: float, longitude: float, days: int) -> list[DailyWeather]:
        """Daily forecast starting today."""
        ...


def parse_daily(payload: dict[str, Any], source: str) -> list[DailyWeather]:
    """Turn an Open-Meteo ``daily`` block into records, skipping days with no temperature."""
    daily = payload.get("daily") or {}
    times: list[str] = daily.get("time") or []

    def column(name: str) -> list[Any]:
        values = daily.get(name) or []
        return list(values) + [None] * (len(times) - len(values))

    columns = {name: column(name) for name in DAILY_VARIABLES}
    records: list[DailyWeather] = []
    for i, raw_day in enumerate(times):
        t_mean, t_min, t_max = (columns[k][i] for k in DAILY_VARIABLES[:3])
        if t_mean is None and t_min is not None and t_max is not None:
            t_mean = (t_min + t_max) / 2
        if t_mean is None:
            continue  # not yet available (common for the most recent archive days)
        records.append(
            DailyWeather(
                day=date.fromisoformat(raw_day),
                temperature_mean=float(t_mean),
                temperature_min=None if t_min is None else float(t_min),
                temperature_max=None if t_max is None else float(t_max),
                precipitation=float(columns["precipitation_sum"][i] or 0.0),
                humidity_mean=(
                    None
                    if columns["relative_humidity_2m_mean"][i] is None
                    else float(columns["relative_humidity_2m_mean"][i])
                ),
                source=source,
            )
        )
    return records


class OpenMeteoClient:
    def __init__(
        self, forecast_url: str, archive_url: str, timeout: float = 20, api_key: str | None = None
    ) -> None:
        self._forecast_url = forecast_url
        self._archive_url = archive_url
        self._timeout = timeout
        self._api_key = api_key

    def _get(self, url: str, params: dict[str, Any]) -> dict[str, Any]:
        query = {
            **params,
            "daily": ",".join(DAILY_VARIABLES),
            "timezone": "auto",
        }
        if self._api_key:
            query["apikey"] = self._api_key
        try:
            response = httpx.get(url, params=query, timeout=self._timeout)
        except httpx.HTTPError as exc:
            logger.warning("Weather request failed: %s", exc)
            raise WeatherUnavailableError("The weather service could not be reached.") from exc
        if response.status_code == 429:
            raise WeatherUnavailableError(
                "The weather service's request limit has been reached. Try again later.",
                rate_limited=True,
            )
        if response.status_code != 200:
            reason = ""
            with contextlib.suppress(ValueError):
                reason = str(response.json().get("reason", ""))
            raise WeatherUnavailableError(
                f"The weather service returned an error ({response.status_code}). {reason}".strip()
            )
        data: dict[str, Any] = response.json()
        return data

    def history(
        self, latitude: float, longitude: float, start: date, end: date
    ) -> list[DailyWeather]:
        location = {"latitude": latitude, "longitude": longitude}
        archive_end = min(end, date.today() - timedelta(days=ARCHIVE_LAG_DAYS))
        records: list[DailyWeather] = []
        if start <= archive_end:
            payload = self._get(
                self._archive_url,
                {**location, "start_date": start.isoformat(), "end_date": archive_end.isoformat()},
            )
            records.extend(parse_daily(payload, "archive"))
        recent_start = max(start, archive_end + timedelta(days=1))
        if recent_start <= end:
            payload = self._get(
                self._forecast_url,
                {**location, "start_date": recent_start.isoformat(), "end_date": end.isoformat()},
            )
            records.extend(parse_daily(payload, "recent"))
        # The archive can be missing its newest days; keep one record per day, archive first.
        unique: dict[date, DailyWeather] = {}
        for record in records:
            unique.setdefault(record.day, record)
        return sorted(unique.values(), key=lambda r: r.day)

    def forecast(self, latitude: float, longitude: float, days: int) -> list[DailyWeather]:
        payload = self._get(
            self._forecast_url,
            {"latitude": latitude, "longitude": longitude, "forecast_days": days},
        )
        return parse_daily(payload, "forecast")


# --- Climate summaries ---------------------------------------------------------------------------


class DayLike(Protocol):
    @property
    def day(self) -> date: ...
    @property
    def temperature_mean(self) -> float: ...
    @property
    def precipitation(self) -> float: ...
    @property
    def humidity_mean(self) -> float | None: ...


@dataclass(frozen=True, slots=True)
class ClimateSummary:
    label: str
    start: date
    end: date
    days: int
    temperature: float
    humidity: float | None
    rainfall: float  # mm per 30 days
    total_rainfall: float


@dataclass(frozen=True, slots=True)
class MonthNormal:
    month: int
    temperature: float
    humidity: float | None
    rainfall: float | None  # average monthly total, mm
    years: int


def _mean_or_none(values: Iterable[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return round(fmean(present), 1) if present else None


def summarise(days: Sequence[DayLike], label: str) -> ClimateSummary | None:
    if not days:
        return None
    ordered = sorted(days, key=lambda d: d.day)
    total = sum(d.precipitation for d in ordered)
    return ClimateSummary(
        label=label,
        start=ordered[0].day,
        end=ordered[-1].day,
        days=len(ordered),
        temperature=round(fmean(d.temperature_mean for d in ordered), 1),
        humidity=_mean_or_none(d.humidity_mean for d in ordered),
        rainfall=round(total / len(ordered) * RAIN_PERIOD_DAYS, 1),
        total_rainfall=round(total, 1),
    )


def recent_summaries(
    days: Sequence[DayLike], windows: Sequence[int] = (30, 90, 365)
) -> list[ClimateSummary]:
    if not days:
        return []
    latest = max(d.day for d in days)
    summaries = []
    for window in windows:
        start = latest - timedelta(days=window - 1)
        subset = [d for d in days if d.day >= start]
        # Only report a window the stored history actually covers.
        if len(subset) >= window * 0.8:
            summary = summarise(subset, f"Last {window} days")
            if summary:
                summaries.append(summary)
    return summaries


def monthly_normals(days: Sequence[DayLike]) -> list[MonthNormal]:
    """Average weather for each calendar month across all stored years."""
    by_month: dict[int, list[DayLike]] = defaultdict(list)
    by_year_month: dict[tuple[int, int], list[DayLike]] = defaultdict(list)
    for d in days:
        by_month[d.day.month].append(d)
        by_year_month[(d.day.year, d.day.month)].append(d)

    normals = []
    for month in range(1, 13):
        month_days = by_month.get(month)
        if not month_days:
            continue
        totals = [
            sum(d.precipitation for d in group)
            for (_, m), group in by_year_month.items()
            if m == month and len(group) >= MIN_DAYS_FOR_MONTHLY_TOTAL
        ]
        normals.append(
            MonthNormal(
                month=month,
                temperature=round(fmean(d.temperature_mean for d in month_days), 1),
                humidity=_mean_or_none(d.humidity_mean for d in month_days),
                rainfall=round(fmean(totals), 1) if totals else None,
                years=len({y for (y, m) in by_year_month if m == month}),
            )
        )
    return normals


def season_months(start_month: int, months: int) -> list[int]:
    return [((start_month - 1 + i) % 12) + 1 for i in range(months)]


def season_label(start_month: int, months: int) -> str:
    covered = season_months(start_month, months)
    first, last = MONTH_NAMES[covered[0] - 1], MONTH_NAMES[covered[-1] - 1]
    return f"Typical {first}–{last}" if months > 1 else f"Typical {first}"


@dataclass(frozen=True, slots=True)
class SeasonClimate:
    label: str
    start_month: int
    months: int
    temperature: float
    humidity: float | None
    rainfall: float  # average monthly rainfall over the season, mm
    years: int


def season_climate(
    normals: Sequence[MonthNormal], start_month: int, months: int
) -> SeasonClimate | None:
    """Typical climate for a growing season, from the monthly normals.

    Returns ``None`` unless every month of the season has data, including rainfall.
    """
    wanted = season_months(start_month, months)
    by_month = {n.month: n for n in normals}
    chosen = [by_month.get(m) for m in wanted]
    if any(n is None or n.rainfall is None for n in chosen):
        return None
    present = [n for n in chosen if n is not None]
    return SeasonClimate(
        label=season_label(start_month, months),
        start_month=start_month,
        months=months,
        temperature=round(fmean(n.temperature for n in present), 1),
        humidity=_mean_or_none(n.humidity for n in present),
        rainfall=round(fmean(n.rainfall for n in present if n.rainfall is not None), 1),
        years=min(n.years for n in present),
    )
