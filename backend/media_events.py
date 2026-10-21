"""WebSocket handlers for now-playing state and SMTC transport controls."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict

from .event_router import register_handler
from .os_hooks.media_service import (
    control_media,
    latest_media_snapshot,
    start_media_poller,
    stop_media_poller,
)
from .os_hooks.media_snapshot import capture_media
from .ws_manager import ws_manager

logger = logging.getLogger("aether.media.events")
_loop: asyncio.AbstractEventLoop | None = None


def wire_media_poller() -> None:
    """Starts SMTC polling and forwards changed snapshots to all clients."""
    global _loop
    _loop = asyncio.get_running_loop()

    def on_update(snapshot: Dict[str, Any]) -> None:
        if _loop is None or _loop.is_closed():
            return
        try:
            asyncio.run_coroutine_threadsafe(
                ws_manager.broadcast("MEDIA_STATE", snapshot), _loop
            )
        except RuntimeError:
            pass

    start_media_poller(on_update)
    logger.info("Media poller started")


def stop_media_updates() -> None:
    stop_media_poller()


async def _handle_get_media(payload: Dict[str, Any]) -> None:
    loop = asyncio.get_running_loop()
    snapshot = await loop.run_in_executor(None, latest_media_snapshot)
    await ws_manager.broadcast("MEDIA_STATE", snapshot)


async def _refresh_after_control() -> None:
    await asyncio.sleep(0.35)
    loop = asyncio.get_running_loop()
    snapshot = await loop.run_in_executor(None, capture_media)
    await ws_manager.broadcast("MEDIA_STATE", snapshot)


async def _handle_media_control(payload: Dict[str, Any]) -> None:
    action = str(payload.get("action") or "").strip().lower()
    if action not in {"play", "pause", "play_pause", "next", "previous"}:
        await ws_manager.broadcast("ERROR", {"message": "Unknown media action."})
        return
    loop = asyncio.get_running_loop()
    ok = await loop.run_in_executor(None, control_media, action)
    if not ok:
        await ws_manager.broadcast(
            "MEDIA_STATE",
            await loop.run_in_executor(None, latest_media_snapshot),
        )
        await ws_manager.broadcast(
            "ERROR", {"message": "The media player did not accept that command."}
        )
        return
    asyncio.create_task(_refresh_after_control())


def register_media_events() -> None:
    register_handler("GET_MEDIA_STATE", _handle_get_media)
    register_handler("MEDIA_CONTROL", _handle_media_control)
