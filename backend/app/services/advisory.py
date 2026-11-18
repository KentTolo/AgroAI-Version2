"""Rule-based agronomic advisory engine.

Given a crop and the measured conditions, each parameter is compared with the crop's optimal
band (the 10th to 90th percentile of conditions the crop was observed in). Deviations outside
the band are graded by how far they fall relative to the band's spread, and paired with
practical corrective advice.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Literal

from app.ml.features import PARAMETERS, Parameter
from app.services.crops import CropInfo


class Severity(StrEnum):
    OPTIMAL = "optimal"
    SLIGHT = "slight"
    MODERATE = "moderate"
    SIGNIFICANT = "significant"


Direction = Literal["increase", "decrease"]
Verdict = Literal["well_suited", "suitable_with_adjustments", "marginal", "not_recommended"]

SEVERITY_SCORES: dict[Severity, int] = {
    Severity.OPTIMAL: 100,
    Severity.SLIGHT: 75,
    Severity.MODERATE: 45,
    Severity.SIGNIFICANT: 10,
}

# Corrective actions by parameter, direction and severity.
ADVICE: dict[str, dict[Direction, dict[Severity, str]]] = {
    "temperature": {
        "increase": {
            Severity.SLIGHT: "Use row covers, or plant later in the season when it is warmer.",
            Severity.MODERATE: "Use plastic mulch or low tunnels to warm the soil and canopy.",
            Severity.SIGNIFICANT: "Grow under a greenhouse or tunnel, or plant in the warm "
            "season only.",
        },
        "decrease": {
            Severity.SLIGHT: "Mulch the soil and provide light shading during the hottest hours.",
            Severity.MODERATE: "Irrigate in the cool of the day and use shade cloth.",
            Severity.SIGNIFICANT: "Plant in a cooler season or site, or choose a heat-tolerant "
            "crop.",
        },
    },
    "ph": {
        "increase": {
            Severity.SLIGHT: "Apply wood ash or a light dressing of agricultural lime.",
            Severity.MODERATE: "Apply agricultural lime and retest the soil after 4 to 6 weeks.",
            Severity.SIGNIFICANT: "Lime heavily in split applications and retest regularly "
            "until pH stabilises.",
        },
        "decrease": {
            Severity.SLIGHT: "Work in compost, peat or pine-needle mulch to lower pH slightly.",
            Severity.MODERATE: "Apply elemental sulphur with organic matter to lower pH gradually.",
            Severity.SIGNIFICANT: "Use elemental sulphur and acidifying fertilisers under close "
            "monitoring, or choose an alkaline-tolerant crop.",
        },
    },
    "rainfall": {
        "increase": {
            Severity.SLIGHT: "Supplement with basic irrigation at critical growth stages.",
            Severity.MODERATE: "Install drip or sprinkler irrigation and mulch to retain moisture.",
            Severity.SIGNIFICANT: "Rely on full irrigation and rainwater harvesting, or choose a "
            "drought-tolerant crop.",
        },
        "decrease": {
            Severity.SLIGHT: "Reduce any irrigation and keep drainage channels clear.",
            Severity.MODERATE: "Plant on raised beds or ridges and improve drainage.",
            Severity.SIGNIFICANT: "Install field drainage or grow under cover; consider a crop "
            "that tolerates wet conditions.",
        },
    },
    "humidity": {
        "increase": {
            Severity.SLIGHT: "Mulch and irrigate in the morning to raise humidity around plants.",
            Severity.MODERATE: "Use windbreaks and closer spacing to hold moisture in the canopy.",
            Severity.SIGNIFICANT: "Grow under cover with misting, or choose a crop suited to dry "
            "air.",
        },
        "decrease": {
            Severity.SLIGHT: "Widen plant spacing to improve air movement.",
            Severity.MODERATE: "Prune for airflow, avoid overhead watering and watch for fungal "
            "disease.",
            Severity.SIGNIFICANT: "Use disease-resistant varieties and preventive fungicide "
            "programmes, or choose a crop suited to humid air.",
        },
    },
    "nitrogen": {
        "increase": {
            Severity.SLIGHT: "Apply compost or well-rotted manure.",
            Severity.MODERATE: "Top-dress with a nitrogen fertiliser such as LAN or urea.",
            Severity.SIGNIFICANT: "Apply nitrogen fertiliser in split doses through the season "
            "and rotate with legumes.",
        },
        "decrease": {
            Severity.SLIGHT: "Pause nitrogen applications for now.",
            Severity.MODERATE: "Switch to a low-nitrogen, balanced fertiliser blend.",
            Severity.SIGNIFICANT: "Stop nitrogen inputs and grow a nitrogen-hungry cover crop "
            "first.",
        },
    },
    "phosphorus": {
        "increase": {
            Severity.SLIGHT: "Add bone meal or rock phosphate.",
            Severity.MODERATE: "Apply single or double superphosphate at planting.",
            Severity.SIGNIFICANT: "Band-place a high-phosphate fertiliser at planting and "
            "retest next season.",
        },
        "decrease": {
            Severity.SLIGHT: "Reduce phosphorus-rich fertilisers.",
            Severity.MODERATE: "Use a fertiliser blend without phosphorus this season.",
            Severity.SIGNIFICANT: "Avoid all phosphorus inputs and rotate crops to draw down "
            "reserves.",
        },
    },
    "potassium": {
        "increase": {
            Severity.SLIGHT: "Apply wood ash or potassium-rich compost.",
            Severity.MODERATE: "Apply potassium sulphate or muriate of potash.",
            Severity.SIGNIFICANT: "Apply potassium fertiliser in split doses and test soil each "
            "season.",
        },
        "decrease": {
            Severity.SLIGHT: "Pause potassium fertilisation for now.",
            Severity.MODERATE: "Switch to a low-potassium fertiliser blend.",
            Severity.SIGNIFICANT: "Stop potassium inputs and rotate crops to draw down reserves.",
        },
    },
}


@dataclass(frozen=True, slots=True)
class ParameterAssessment:
    parameter: str
    label: str
    unit: str
    value: float
    optimal_min: float
    optimal_max: float
    typical: float
    severity: Severity
    direction: Direction | None
    advice: str | None


@dataclass(frozen=True, slots=True)
class Assessment:
    crop: CropInfo
    score: int
    verdict: Verdict
    parameters: list[ParameterAssessment]

    @property
    def issues(self) -> list[ParameterAssessment]:
        return [p for p in self.parameters if p.severity is not Severity.OPTIMAL]


def _grade(deviation: float, scale: float) -> Severity:
    if deviation <= 0:
        return Severity.OPTIMAL
    if deviation <= scale:
        return Severity.SLIGHT
    if deviation <= 2 * scale:
        return Severity.MODERATE
    return Severity.SIGNIFICANT


def assess_parameter(param: Parameter, value: float, crop: CropInfo) -> ParameterAssessment:
    stats = crop.profile[param.key]
    low, high = stats["p10"], stats["p90"]
    # Grading scale: a quarter of the optimal band, but never below the parameter's tolerance.
    scale = max((high - low) / 4, param.tolerance)

    direction: Direction | None
    if value < low:
        deviation, direction = low - value, "increase"
    elif value > high:
        deviation, direction = value - high, "decrease"
    else:
        deviation, direction = 0.0, None

    severity = _grade(deviation, scale)
    advice = ADVICE[param.key][direction][severity] if direction else None
    return ParameterAssessment(
        parameter=param.key,
        label=param.label,
        unit=param.unit,
        value=value,
        optimal_min=low,
        optimal_max=high,
        typical=stats["median"],
        severity=severity,
        direction=direction,
        advice=advice,
    )


def _verdict(score: int, parameters: list[ParameterAssessment]) -> Verdict:
    significant = sum(p.severity is Severity.SIGNIFICANT for p in parameters)
    if score >= 90 and significant == 0:
        return "well_suited"
    if score >= 70 and significant <= 1:
        return "suitable_with_adjustments"
    if score >= 45:
        return "marginal"
    return "not_recommended"


def assess(crop: CropInfo, conditions: dict[str, float]) -> Assessment:
    parameters = [assess_parameter(p, float(conditions[p.key]), crop) for p in PARAMETERS]
    score = round(sum(SEVERITY_SCORES[p.severity] for p in parameters) / len(parameters))
    return Assessment(
        crop=crop, score=score, verdict=_verdict(score, parameters), parameters=parameters
    )
