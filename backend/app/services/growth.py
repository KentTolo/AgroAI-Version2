"""Growth-stage tracking for crop cycles.

Stages are expressed as fractions of the crop's time to harvest, so one template serves every
crop of the same lifecycle. The result is a planning aid, not a phenological model.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from app.services.crops import CropInfo, Lifecycle


@dataclass(frozen=True, slots=True)
class StageTemplate:
    name: str
    start: float  # fraction of time to harvest
    end: float
    guidance: str


STAGE_TEMPLATES: dict[Lifecycle, tuple[StageTemplate, ...]] = {
    "annual": (
        StageTemplate(
            "Germination and emergence",
            0.0,
            0.1,
            "Keep the seedbed moist and protect seedlings from birds and cutworms.",
        ),
        StageTemplate(
            "Vegetative growth",
            0.1,
            0.45,
            "Weed regularly, top-dress nitrogen where needed and scout for pests.",
        ),
        StageTemplate(
            "Flowering",
            0.45,
            0.65,
            "The most water-sensitive stage: avoid moisture stress and protect pollinators.",
        ),
        StageTemplate(
            "Grain and fruit development",
            0.65,
            0.9,
            "Maintain moisture, watch for disease and avoid late nitrogen.",
        ),
        StageTemplate(
            "Maturity and harvest",
            0.9,
            1.0,
            "Reduce irrigation, check maturity indicators and prepare storage.",
        ),
    ),
    "perennial": (
        StageTemplate(
            "Establishment",
            0.0,
            0.2,
            "Water young plants consistently, stake if needed and control weeds around them.",
        ),
        StageTemplate(
            "Vegetative growth",
            0.2,
            0.7,
            "Train and prune for structure, feed according to soil tests and mulch.",
        ),
        StageTemplate(
            "First flowering",
            0.7,
            0.85,
            "Ensure steady moisture and nutrition; thin flowers on very young plants.",
        ),
        StageTemplate(
            "Fruit development and first harvest",
            0.85,
            1.0,
            "Thin fruit for size, protect from pests and harvest at maturity.",
        ),
    ),
}

StageStatus = Literal["completed", "current", "upcoming"]


@dataclass(frozen=True, slots=True)
class StageProgress:
    name: str
    guidance: str
    start_day: int
    end_day: int
    status: StageStatus


@dataclass(frozen=True, slots=True)
class CycleProgress:
    day: int
    total_days: int
    percent: float
    days_remaining: int
    current_stage: str
    stages: list[StageProgress]


def expected_harvest_date(crop: CropInfo, planted_on: date) -> date:
    return planted_on + timedelta(days=crop.days_to_harvest)


def compute_progress(
    crop: CropInfo, planted_on: date, expected_harvest_on: date, today: date
) -> CycleProgress:
    total_days = max((expected_harvest_on - planted_on).days, 1)
    day = max((today - planted_on).days, 0)
    fraction = min(day / total_days, 1.0)

    stages: list[StageProgress] = []
    current = None
    templates = STAGE_TEMPLATES[crop.lifecycle]
    for index, template in enumerate(templates):
        start_day = round(template.start * total_days)
        end_day = round(template.end * total_days)
        is_last = index == len(templates) - 1
        status: StageStatus
        if fraction >= template.end and not is_last:
            status = "completed"
        elif fraction >= template.start:
            status = "current"
            current = template.name
        else:
            status = "upcoming"
        stages.append(StageProgress(template.name, template.guidance, start_day, end_day, status))

    return CycleProgress(
        day=day,
        total_days=total_days,
        percent=round(fraction * 100, 1),
        days_remaining=max(total_days - day, 0),
        current_stage=current or templates[0].name,
        stages=stages,
    )
