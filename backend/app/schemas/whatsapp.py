"""Schemas for WhatsApp linking, alerts and the scheduled notification run."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import Schema


class NotificationRead(Schema):
    kind: str
    message: str
    status: Literal["sent", "failed"]
    created_at: datetime


class WhatsAppStatus(Schema):
    enabled: bool = Field(description="Whether this AgroAI server has WhatsApp set up")
    bot_number: str | None = Field(description="The number farmers message, e.g. +26650123456")
    linked_number: str | None
    alerts: bool
    link_expires_at: datetime | None = Field(description="Set while a link code is waiting")
    recent: list[NotificationRead]


class WhatsAppLinkCode(Schema):
    code: str
    message: str = Field(description="What to send to the bot, e.g. 'LINK 482913'")
    expires_at: datetime
    bot_number: str | None
    whatsapp_url: str | None = Field(description="Opens WhatsApp with the message ready to send")


class WhatsAppUpdate(Schema):
    alerts: bool


class NotificationRunResult(Schema):
    users: int
    messages_sent: int
    messages_failed: int
    alerts: int
