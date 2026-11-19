"""The WhatsApp bot: short text commands so farmers can use AgroAI without the website."""

from __future__ import annotations

import hashlib
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.messaging.queries import active_cycles, user_fields
from app.ml.predictor import CropRecommender
from app.models import (
    CropCycle,
    CycleStatus,
    ReadingSource,
    Recommendation,
    SensorReading,
    User,
    WeatherDay,
)
from app.schemas.common import GrowingConditions
from app.services.advisory import assess
from app.services.crops import CropCatalog, CropInfo, normalise_crop
from app.services.growth import compute_progress
from app.services.weather import WeatherClient, WeatherUnavailableError, recent_summaries

LINK_CODE_TTL = timedelta(minutes=30)

# Everyday and Sesotho names for crops (normalised: lower case, no spaces).
CROP_ALIASES = {
    "corn": "maize",
    "poone": "maize",
    "mabele": "sorghum",
    "koro": "wheat",
    "beans": "kidneybeans",
    "drybeans": "kidneybeans",
    "linaoa": "kidneybeans",
    "pea": "peas",
    "drypeas": "peas",
    "lierekisi": "peas",
    "potatoes": "potato",
    "litapole": "potato",
    "apples": "apple",
    "watermelons": "watermelon",
}

HELP = """*AgroAI commands*

STATUS – your plantings and their stage
FIELDS – your fields
WEATHER 1 – 3-day forecast for field 1
SOIL 1 N P K pH – record a soil test for field 1 (e.g. SOIL 1 80 45 20 6.2)
PLANTED maize 1 – start tracking maize on field 1 today
HARVESTED 1 350 – record planting 1 harvested, 350 kg
RECOMMEND 1 – best crops for field 1
ALERTS ON / ALERTS OFF – daily milestone messages
HELP – this list"""

NOT_LINKED = (
    "Hello! This WhatsApp number is not linked to an AgroAI account yet.\n\n"
    "Open AgroAI, go to *Settings → WhatsApp*, tap *Link WhatsApp* and send the code it shows."
)


def hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


@dataclass
class BotContext:
    db: Session
    catalog: CropCatalog
    recommender: CropRecommender | None
    weather: WeatherClient | None
    today: date
    now: datetime


def _first_name(user: User) -> str:
    return user.full_name.split()[0] if user.full_name.strip() else "there"


def find_crop(catalog: CropCatalog, text: str) -> CropInfo | None:
    key = normalise_crop(text)
    key = CROP_ALIASES.get(key, key)
    crop = catalog.get(key)
    if crop is not None:
        return crop
    for candidate in catalog.crops.values():
        if normalise_crop(candidate.name).startswith(key):
            return candidate
    return None


def _pick[T](items: list[T], arg: str | None, noun: str) -> tuple[int, T] | str:
    """Item by 1-based number, or the only item when there is just one."""
    if not items:
        return f"You have no {noun}s yet."
    if arg is None:
        if len(items) == 1:
            return 1, items[0]
        return f"Which {noun}? Add its number, e.g. 1. Reply {noun.upper()}S to see the list."
    if not arg.isdigit() or not 1 <= int(arg) <= len(items):
        return f"There is no {noun} {arg}. Choose 1 to {len(items)}."
    return int(arg), items[int(arg) - 1]


# --- commands --------------------------------------------------------------------------------


def cmd_status(ctx: BotContext, user: User, _args: list[str]) -> str:
    cycles = active_cycles(ctx.db, user)
    if not cycles:
        return "You have no active plantings. Reply *PLANTED <crop> <field no.>* to start one."
    lines = ["*Your plantings*"]
    for number, cycle in enumerate(cycles, start=1):
        crop = ctx.catalog.get(cycle.crop)
        name = crop.name if crop else cycle.crop.title()
        line = f"{number}. {name} on {cycle.field.name}"
        if crop:
            p = compute_progress(crop, cycle.planted_on, cycle.expected_harvest_on, ctx.today)
            line += (
                f" – {p.current_stage.lower()}, day {p.day} of {p.total_days}, "
                f"harvest ~{cycle.expected_harvest_on:%d %b}"
            )
        lines.append(line)
    return "\n".join(lines)


def cmd_fields(ctx: BotContext, user: User, _args: list[str]) -> str:
    fields = user_fields(ctx.db, user)
    if not fields:
        return "You have no fields yet. Add one on the AgroAI website first."
    lines = ["*Your fields*"]
    for number, field in enumerate(fields, start=1):
        latest = ctx.db.scalar(
            select(SensorReading)
            .where(SensorReading.field_id == field.id)
            .order_by(SensorReading.recorded_at.desc())
            .limit(1)
        )
        detail = (
            f"last soil test {latest.recorded_at:%d %b}, pH {latest.ph:g}"
            if latest
            else "no soil test yet"
        )
        area = f", {field.area_hectares:g} ha" if field.area_hectares else ""
        lines.append(f"{number}. {field.name}{area} – {detail}")
    return "\n".join(lines)


def cmd_weather(ctx: BotContext, user: User, args: list[str]) -> str:
    picked = _pick(user_fields(ctx.db, user), args[0] if args else None, "field")
    if isinstance(picked, str):
        return picked
    _, field = picked
    if field.latitude is None or field.longitude is None:
        return "That field has no location. Set it on the map on the AgroAI website."
    if ctx.weather is None:
        return "The weather service is not available right now."
    try:
        days = ctx.weather.forecast(field.latitude, field.longitude, 3)
    except WeatherUnavailableError:
        return "The weather service is not available right now. Try again later."
    lines = [f"*Weather for {field.name}*"]
    for d in days:
        low = f"{d.temperature_min:.0f}" if d.temperature_min is not None else "?"
        high = f"{d.temperature_max:.0f}" if d.temperature_max is not None else "?"
        lines.append(f"{d.day:%a %d %b}: {low}–{high}°C, rain {d.precipitation:.0f} mm")
    return "\n".join(lines)


def _numbers(values: list[str]) -> list[float] | None:
    try:
        return [float(v.replace(",", ".")) for v in values]
    except ValueError:
        return None


def cmd_soil(ctx: BotContext, user: User, args: list[str]) -> str:
    usage = (
        "Send *SOIL <field no.> N P K pH*, e.g. SOIL 1 80 45 20 6.2. Add temperature (°C), "
        "humidity (%) and rainfall (mm per 30 days) at the end if the field has no weather data."
    )
    fields = user_fields(ctx.db, user)
    if len(args) in (4, 7) and len(fields) == 1:
        args = ["1", *args]
    if len(args) not in (5, 8):
        return usage
    picked = _pick(fields, args[0], "field")
    if isinstance(picked, str):
        return picked
    _, item = picked
    values = _numbers(args[1:])
    if values is None:
        return usage
    nitrogen, phosphorus, potassium, ph = values[:4]
    if len(values) == 7:
        temperature, humidity, rainfall = values[4:]
        basis = "your values"
    else:
        days = list(ctx.db.scalars(select(WeatherDay).where(WeatherDay.field_id == item.id)))
        recent = next(iter(recent_summaries(days, windows=(30,))), None)
        if recent is None or recent.humidity is None:
            return (
                f"{item.name} has no recent weather data. Open the field on the website and sync "
                "its weather, or add temperature, humidity and rainfall to the message."
            )
        temperature, humidity, rainfall = recent.temperature, recent.humidity, recent.rainfall
        basis = "the last 30 days of weather"
    try:
        conditions = GrowingConditions(
            nitrogen=nitrogen,
            phosphorus=phosphorus,
            potassium=potassium,
            temperature=temperature,
            humidity=humidity,
            ph=ph,
            rainfall=rainfall,
        )
    except ValidationError as exc:
        problems = "; ".join(
            f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()
        )
        return f"Some values look wrong ({problems}). {usage}"
    ctx.db.add(
        SensorReading(
            field_id=item.id,
            source=ReadingSource.MANUAL,
            recorded_at=ctx.now,
            **conditions.model_dump(),
        )
    )
    ctx.db.commit()
    return (
        f"Saved a soil test for {item.name}: N {nitrogen:g}, P {phosphorus:g}, K {potassium:g}, "
        f"pH {ph:g} (climate from {basis}). Reply *RECOMMEND {args[0]}* for the best crops."
    )


def cmd_planted(ctx: BotContext, user: User, args: list[str]) -> str:
    usage = "Send *PLANTED <crop> <field no.>*, e.g. PLANTED maize 1."
    if not args:
        return usage
    field_arg = args[-1] if len(args) > 1 and args[-1].isdigit() else None
    crop_words = args[:-1] if field_arg else args
    crop = find_crop(ctx.catalog, " ".join(crop_words))
    if crop is None:
        return f'I don\'t know the crop "{" ".join(crop_words)}". Try maize, sorghum, beans.'
    picked = _pick(user_fields(ctx.db, user), field_arg, "field")
    if isinstance(picked, str):
        return picked
    _, item = picked
    expected = ctx.today + timedelta(days=crop.days_to_harvest)
    ctx.db.add(
        CropCycle(
            field_id=item.id,
            crop=crop.slug,
            planted_on=ctx.today,
            expected_harvest_on=expected,
            status=CycleStatus.ACTIVE,
        )
    )
    ctx.db.commit()
    return (
        f"Started tracking {crop.name} on {item.name}, planted today. Expected harvest around "
        f"{expected:%d %b %Y}. I'll message you at each growth stage."
    )


def cmd_harvested(ctx: BotContext, user: User, args: list[str]) -> str:
    usage = "Send *HARVESTED <planting no.> <kg>*, e.g. HARVESTED 1 350. Reply STATUS for numbers."
    cycles = active_cycles(ctx.db, user)
    picked = _pick(cycles, args[0] if args else None, "planting")
    if isinstance(picked, str):
        return picked if cycles else "You have no active plantings."
    _, item = picked
    yield_kg = None
    if len(args) > 1:
        parsed = _numbers([args[1].lower().removesuffix("kg")])
        if parsed is None or parsed[0] < 0:
            return usage
        yield_kg = parsed[0]
    if ctx.today < item.planted_on:
        return "That planting starts in the future, so it can't be harvested yet."
    item.status = CycleStatus.HARVESTED
    item.harvested_on = ctx.today
    item.yield_kg = yield_kg
    ctx.db.commit()
    crop = ctx.catalog.get(item.crop)
    name = crop.name if crop else item.crop.title()
    amount = f" ({yield_kg:g} kg)" if yield_kg is not None else ""
    return f"Recorded the {name} harvest on {item.field.name}{amount}. Well done!"


def cmd_recommend(ctx: BotContext, user: User, args: list[str]) -> str:
    picked = _pick(user_fields(ctx.db, user), args[0] if args else None, "field")
    if isinstance(picked, str):
        return picked
    number, item = picked
    latest = ctx.db.scalar(
        select(SensorReading)
        .where(SensorReading.field_id == item.id)
        .order_by(SensorReading.recorded_at.desc())
        .limit(1)
    )
    if latest is None:
        return f"{item.name} has no soil test yet. Send *SOIL {number} N P K pH* first."
    if ctx.recommender is None:
        return "Recommendations are not available right now."
    inputs = GrowingConditions.model_validate(latest).model_dump()
    ranked = ctx.recommender.rank(inputs)
    overall_best = ranked[0].crop
    lesotho = [
        s for s in ranked if (c := ctx.catalog.get(s.crop)) is not None and c.grown_in_lesotho
    ][:3]
    ctx.db.add(
        Recommendation(
            user_id=user.id,
            field_id=item.id,
            inputs=inputs,
            predictions=[{"crop": s.crop, "probability": round(s.probability, 4)} for s in lesotho],
            recommended_crop=lesotho[0].crop,
            model_version=ctx.recommender.version,
            context={"scope": "lesotho", "overall_best": overall_best, "climate_basis": "WhatsApp"},
        )
    )
    ctx.db.commit()
    lines = [f"*Best crops for {item.name}* (soil test {latest.recorded_at:%d %b})"]
    for i, s in enumerate(lesotho, start=1):
        crop = ctx.catalog.get(s.crop)
        lines.append(f"{i}. {crop.name if crop else s.crop} – {s.probability:.0%} match")
    staples = sorted(
        (
            assess(c, inputs)
            for c in ctx.catalog.crops.values()
            if c.grown_in_lesotho and not c.model_ranked
        ),
        key=lambda a: -a.score,
    )[:2]
    if staples:
        lines.append("")
        lines.append("Also suitable: " + ", ".join(f"{a.crop.name} {a.score}/100" for a in staples))
    return "\n".join(lines)


def _set_alerts(on: bool) -> Callable[[BotContext, User, list[str]], str]:
    def handler(ctx: BotContext, user: User, _args: list[str]) -> str:
        user.whatsapp_alerts = on
        ctx.db.commit()
        if on:
            return "Daily alerts are on. I'll message you about growth stages, harvest and frost."
        return "Daily alerts are off. Reply *ALERTS ON* to turn them back on."

    return handler


def cmd_alerts(ctx: BotContext, user: User, args: list[str]) -> str:
    if args and args[0].lower() in ("on", "off"):
        return _set_alerts(args[0].lower() == "on")(ctx, user, [])
    state = "on" if user.whatsapp_alerts else "off"
    return f"Daily alerts are {state}. Reply ALERTS ON or ALERTS OFF."


def cmd_help(_ctx: BotContext, user: User, _args: list[str]) -> str:
    return f"Lumela {_first_name(user)}! 🌱\n\n{HELP}"


COMMANDS: dict[str, Callable[[BotContext, User, list[str]], str]] = {
    "status": cmd_status,
    "fields": cmd_fields,
    "field": cmd_fields,
    "weather": cmd_weather,
    "soil": cmd_soil,
    "planted": cmd_planted,
    "plant": cmd_planted,
    "harvested": cmd_harvested,
    "harvest": cmd_harvested,
    "recommend": cmd_recommend,
    "alerts": cmd_alerts,
    "stop": _set_alerts(False),
    "start": _set_alerts(True),
    "help": cmd_help,
    "menu": cmd_help,
    "thuso": cmd_help,
    "hi": cmd_help,
    "hello": cmd_help,
    "lumela": cmd_help,
    "?": cmd_help,
}


def link_number(ctx: BotContext, number: str, code: str) -> str:
    candidate = ctx.db.scalar(select(User).where(User.whatsapp_link_code_hash == hash_code(code)))
    expires = candidate.whatsapp_link_expires_at if candidate else None
    if candidate is None or expires is None or expires < ctx.now:
        return (
            "That code is wrong or has expired. Tap *Link WhatsApp* on the website for a new one."
        )
    previous = ctx.db.scalar(select(User).where(User.whatsapp_number == number))
    if previous is not None and previous.id != candidate.id:
        previous.whatsapp_number = None  # a number belongs to one account
        ctx.db.flush()
    candidate.whatsapp_number = number
    candidate.whatsapp_link_code_hash = None
    candidate.whatsapp_link_expires_at = None
    candidate.whatsapp_alerts = True
    ctx.db.commit()
    return (
        f"Linked! This number now gets AgroAI updates for {_first_name(candidate)}'s farm.\n\n"
        f"{HELP}"
    )


def handle_message(ctx: BotContext, number: str, text: str) -> str:
    """Reply to one incoming message from ``number`` (digits only)."""
    words = text.strip().split()
    if not words:
        return HELP
    command, args = words[0].lower().strip("*.!:"), words[1:]
    if command == "link" and args and re.fullmatch(r"\d{6}", args[0]):
        return link_number(ctx, number, args[0])
    user = ctx.db.scalar(select(User).where(User.whatsapp_number == number))
    if user is None or not user.is_active:
        return NOT_LINKED
    handler = COMMANDS.get(command)
    if handler is None:
        return "Sorry, I didn't understand that. Reply *HELP* for the list of commands."
    return handler(ctx, user, args)


def context_now(
    db: Session,
    catalog: CropCatalog,
    recommender: CropRecommender | None,
    weather: WeatherClient | None,
) -> BotContext:
    now = datetime.now(UTC)
    return BotContext(db, catalog, recommender, weather, now.date(), now)
