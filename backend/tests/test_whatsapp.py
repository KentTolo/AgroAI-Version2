from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, date, datetime, timedelta
from itertools import count

import pytest
from fastapi.testclient import TestClient

from app.api.routes.whatsapp import get_whatsapp_sender
from app.core.config import Settings, get_settings
from app.services.crops import get_catalog
from app.services.milestones import cycle_alerts, station_alerts, weather_alerts
from app.services.weather import DailyWeather
from app.services.whatsapp import LogSender, normalise_number, verify_signature

HMAC_KEY = "test-hmac-key"
CRON = "test-cron-secret"
FARMER = "26658111222"
_ids = count(1)


@pytest.fixture
def sender(client: TestClient) -> LogSender:
    log = LogSender()
    settings = Settings(
        environment="test",
        whatsapp_provider="log",
        whatsapp_bot_number="+266 5000 0000",
        waha_webhook_hmac_key=HMAC_KEY,
        cron_secret=CRON,
    )
    client.app.dependency_overrides[get_settings] = lambda: settings  # type: ignore[attr-defined]
    client.app.dependency_overrides[get_whatsapp_sender] = lambda: log  # type: ignore[attr-defined]
    return log


def incoming(client: TestClient, text: str, sender_id: str = f"{FARMER}@c.us", key: str = HMAC_KEY):
    body = json.dumps(
        {
            "event": "message",
            "session": "default",
            "payload": {
                "id": f"msg-{next(_ids)}",
                "from": sender_id,
                "fromMe": False,
                "body": text,
            },
        }
    ).encode()
    signature = hmac.new(key.encode(), body, hashlib.sha512).hexdigest()
    return client.post(
        "/api/v1/whatsapp/webhook",
        content=body,
        headers={"Content-Type": "application/json", "X-Webhook-Hmac": signature},
    )


def last_reply(sender: LogSender) -> str:
    number, text = sender.sent[-1]
    assert number == FARMER
    return text


def link(client: TestClient, auth: dict[str, str], sender: LogSender) -> None:
    code = client.post("/api/v1/whatsapp/link", headers=auth).json()["code"]
    assert incoming(client, f"link {code}").json() == {"handled": True}
    assert last_reply(sender).startswith("Linked!")


def test_normalise_number() -> None:
    assert normalise_number("5811 1222") == "26658111222"
    assert normalise_number("+266 5811 1222") == "26658111222"
    assert normalise_number("0027 82 123 4567") == "27821234567"
    assert normalise_number("123") is None


def test_signature_check() -> None:
    body = b'{"a": 1}'
    good = hmac.new(b"k", body, hashlib.sha512).hexdigest()
    assert verify_signature(body, good, "k")
    assert not verify_signature(body, good, "other")
    assert not verify_signature(body, None, "k")


def test_link_flow(client: TestClient, auth: dict[str, str], sender: LogSender) -> None:
    status = client.get("/api/v1/whatsapp", headers=auth).json()
    assert status["enabled"] is True
    assert status["bot_number"] == "+26650000000"
    assert status["linked_number"] is None

    start = client.post("/api/v1/whatsapp/link", headers=auth).json()
    assert start["message"] == f"LINK {start['code']}"
    assert start["whatsapp_url"] == f"https://wa.me/26650000000?text=LINK%20{start['code']}"
    assert client.get("/api/v1/whatsapp", headers=auth).json()["link_expires_at"]

    incoming(client, "LINK 000000" if start["code"] != "000000" else "LINK 111111")
    assert "wrong or has expired" in last_reply(sender)
    incoming(client, start["message"])
    assert last_reply(sender).startswith("Linked!")
    status = client.get("/api/v1/whatsapp", headers=auth).json()
    assert status["linked_number"] == f"+{FARMER}"
    assert status["link_expires_at"] is None

    # A code works once.
    incoming(client, start["message"])
    assert "wrong or has expired" in last_reply(sender)

    assert client.delete("/api/v1/whatsapp", headers=auth).status_code == 204
    assert client.get("/api/v1/whatsapp", headers=auth).json()["linked_number"] is None


def test_webhook_security_and_filtering(client: TestClient, sender: LogSender) -> None:
    assert incoming(client, "help", key="wrong-key").status_code == 401
    # Unlinked numbers are told how to link.
    incoming(client, "status")
    assert "not linked" in last_reply(sender)
    # Groups and the bot's own messages are ignored.
    assert incoming(client, "status", sender_id="123-456@g.us").json() == {"handled": False}
    replies = len(sender.sent)
    body = json.dumps(
        {
            "event": "message",
            "payload": {"id": "x", "from": f"{FARMER}@c.us", "fromMe": True, "body": "hi"},
        }
    ).encode()
    sig = hmac.new(HMAC_KEY.encode(), body, hashlib.sha512).hexdigest()
    client.post("/api/v1/whatsapp/webhook", content=body, headers={"X-Webhook-Hmac": sig})
    assert len(sender.sent) == replies


def test_webhook_needs_a_signing_key_with_waha(client: TestClient) -> None:
    settings = Settings(environment="test", whatsapp_provider="waha")
    client.app.dependency_overrides[get_settings] = lambda: settings  # type: ignore[attr-defined]
    client.app.dependency_overrides[get_whatsapp_sender] = LogSender  # type: ignore[attr-defined]
    response = client.post("/api/v1/whatsapp/webhook", json={"event": "message"})
    assert response.status_code == 503


def test_bot_commands(
    client: TestClient, auth: dict[str, str], field_id: str, sender: LogSender
) -> None:
    link(client, auth, sender)

    incoming(client, "HELP")
    assert "PLANTED" in last_reply(sender)
    incoming(client, "fields")
    assert "1. North plot, 1.5 ha – no soil test yet" in last_reply(sender)

    # Sesotho crop names work; the only field is picked automatically.
    incoming(client, "planted poone")
    assert "Started tracking Maize on North plot" in last_reply(sender)
    incoming(client, "status")
    assert "1. Maize on North plot – germination and emergence, day 0 of 120" in last_reply(sender)

    # Without stored weather, a 4-value soil test asks for climate values.
    incoming(client, "SOIL 1 80 45 20 6.2")
    assert "no recent weather data" in last_reply(sender)
    client.post(f"/api/v1/fields/{field_id}/weather/sync", json={"years": 1}, headers=auth)
    incoming(client, "SOIL 1 80 45 20 6.2")
    assert "Saved a soil test for North plot" in last_reply(sender)
    incoming(client, "soil 1 80 45 20 6,4 21 60 85")
    assert "climate from your values" in last_reply(sender)
    incoming(client, "soil 1 80 45 20 15")
    assert "look wrong" in last_reply(sender)
    readings = client.get(f"/api/v1/fields/{field_id}/readings", headers=auth).json()
    assert len(readings["items"] if isinstance(readings, dict) else readings) == 2

    incoming(client, "recommend")
    reply = last_reply(sender)
    assert reply.startswith("*Best crops for North plot*")
    assert "Also suitable:" in reply
    history = client.get("/api/v1/recommendations", headers=auth).json()
    assert history["total"] == 1
    assert history["items"][0]["scope"] == "lesotho"

    incoming(client, "weather")
    assert last_reply(sender).startswith("*Weather for North plot*")

    incoming(client, "harvested 1 320kg")
    assert "Recorded the Maize harvest on North plot (320 kg)" in last_reply(sender)
    body = client.get("/api/v1/cycles", headers=auth).json()
    cycles = body["items"] if isinstance(body, dict) else body
    assert cycles[0]["status"] == "harvested"
    assert cycles[0]["yield_kg"] == 320

    incoming(client, "alerts off")
    assert client.get("/api/v1/whatsapp", headers=auth).json()["alerts"] is False
    incoming(client, "banana bread")
    assert "didn't understand" in last_reply(sender)


def test_daily_run_sends_each_milestone_once(
    client: TestClient, auth: dict[str, str], field_id: str, sender: LogSender
) -> None:
    run = "/api/v1/internal/notifications/run"
    assert client.post(run).status_code == 401
    assert client.post(run, headers={"X-Cron-Secret": "nope"}).status_code == 401

    link(client, auth, sender)
    planted = (date.today() - timedelta(days=115)).isoformat()
    response = client.post(
        f"/api/v1/fields/{field_id}/cycles",
        json={"crop": "maize", "planted_on": planted},
        headers=auth,
    )
    assert response.status_code == 201, response.text

    result = client.post(run, headers={"X-Cron-Secret": CRON}).json()
    assert result["messages_sent"] == 1
    assert result["alerts"] == 2  # current stage and harvest approaching
    digest = last_reply(sender)
    assert digest.startswith("*AgroAI*")
    assert "maturity and harvest" in digest
    assert "ready in about 5 days" in digest

    again = client.post(run, headers={"X-Cron-Secret": CRON}).json()
    assert again["messages_sent"] == 0

    recent = client.get("/api/v1/whatsapp", headers=auth).json()["recent"]
    assert {n["kind"] for n in recent} == {"stage", "harvest_soon"}
    assert all(n["status"] == "sent" for n in recent)

    # Farmers who turned alerts off get nothing.
    client.patch("/api/v1/whatsapp", json={"alerts": False}, headers=auth)
    assert client.post(run, headers={"X-Cron-Secret": CRON}).json()["users"] == 0


def _day(d: date, low: float, rain: float) -> DailyWeather:
    return DailyWeather(d, low + 8, low, low + 15, rain, 60, "forecast")


def test_weather_and_station_alerts() -> None:
    today = date(2026, 5, 10)
    forecast = [
        _day(today, 6, 0),
        _day(today + timedelta(days=1), -2, 0),
        _day(today + timedelta(days=2), 3, 40),
        _day(today + timedelta(days=3), -5, 0),
    ]
    alerts = weather_alerts(field_id="f", field_name="Home", forecast=forecast, today=today)
    assert [a.kind for a in alerts] == ["frost", "heavy_rain"]
    assert alerts[0].key == "field:f:frost:2026-05-11"
    assert "low of -2°C" in alerts[0].text

    now = datetime(2026, 5, 10, 12, tzinfo=UTC)
    quiet = station_alerts(
        device_id="d",
        device_name="Station",
        field_name="Home",
        last_seen_at=now - timedelta(hours=7),
        now=now,
    )
    assert [a.kind for a in quiet] == ["station_silent"]
    assert not station_alerts(
        device_id="d",
        device_name="S",
        field_name="Home",
        last_seen_at=now - timedelta(hours=1),
        now=now,
    )


def test_harvest_due_alert() -> None:
    crop = get_catalog().get("sorghum")
    assert crop is not None
    today = date(2026, 4, 1)
    alerts = cycle_alerts(
        cycle_id="c",
        number=2,
        crop=crop,
        field_name="Home",
        planted_on=today - timedelta(days=140),
        expected_harvest_on=today - timedelta(days=10),
        today=today,
    )
    kinds = {a.kind for a in alerts}
    assert "harvest_due" in kinds
    assert any("HARVESTED 2" in a.text for a in alerts)
