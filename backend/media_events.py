"""WebSocket handlers for now-playing state and SMTC transport controls."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict

from .event_router import register_handler
from .os_hooks.audio_levels import (
    start_audio_levels,
    stop_audio_levels,
    update_audio_levels,
)
from .os_hooks.media_service import (
    control_media,
    latest_media_snapshot,
    start_media_poller,
    stop_media_poller,
)
from .ws_manager import ws_manager

logger = logging.getLogger("aether.media.events")
_loop: asyncio.AbstractEventLoop | None = None


def wire_media_poller() -> None:
    """Starts SMTC polling and forwards changed snapshots to all clients."""
    global _loop
    _loop = asyncio.get_running_loop()

    def broadcast(event: str, payload: Dict[str, Any]) -> None:
        if _loop is None or _loop.is_closed():
            return
        try:
            asyncio.run_coroutine_threadsafe(
                ws_manager.broadcast(event, payload), _loop
            )
        except RuntimeError:
            pass

    def on_update(snapshot: Dict[str, Any]) -> None:
        # The level meter follows the same session as the media widget, so a
        # browser tab or Discord notification cannot drive the cozy waves.
        update_audio_levels(
            bool(snapshot.get("is_playing")),
            str(snapshot.get("source_id") or ""),
        )
        broadcast("MEDIA_STATE", snapshot)

    def on_levels(levels: Dict[str, Any]) -> None:
        broadcast("AUDIO_LEVEL", levels)

    start_media_poller(on_update)
    start_audio_levels(on_levels)
    logger.info("Media poller started")


def stop_media_updates() -> None:
    stop_audio_levels()
    stop_media_poller()


async def _handle_get_media(payload: Dict[str, Any]) -> None:
    # The poller owns the SMTC thread; handlers only read its cached snapshot.
    await ws_manager.broadcast("MEDIA_STATE", latest_media_snapshot())


async def _handle_media_control(payload: Dict[str, Any]) -> None:
    action = str(payload.get("action") or "").strip().lower()
    if action not in {"play", "pause", "play_pause", "next", "previous"}:
        await ws_manager.broadcast("ERROR", {"message": "Unknown media action."})
        return
    ok = await control_media(action)
    if not ok:
        await ws_manager.broadcast("MEDIA_STATE", latest_media_snapshot())
        await ws_manager.broadcast(
            "ERROR", {"message": "The media player did not accept that command."}
        )
        return
    # control_media wakes the poller, which captures and broadcasts the new
    # state from its own thread. No executor threads are involved.


def register_media_events() -> None:
    register_handler("GET_MEDIA_STATE", _handle_get_media)
    register_handler("MEDIA_CONTROL", _handle_media_control)
