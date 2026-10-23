"""WebSocket handlers for the Wallpaper tab."""

from __future__ import annotations

import asyncio
from typing import Any, Dict

from .event_router import register_handler
from .wallpaper_service import apply_wallpaper, build_wallpaper_state, clear_history
from .ws_manager import ws_manager


async def broadcast_wallpaper_state() -> Dict[str, Any]:
    """Builds the library off the event loop and broadcasts it."""
    state = await asyncio.to_thread(build_wallpaper_state)
    await ws_manager.broadcast("WALLPAPER_STATE", state)
    return state


async def _handle_get_wallpaper_state(payload: Dict[str, Any]) -> None:
    await broadcast_wallpaper_state()


async def _handle_set_wallpaper(payload: Dict[str, Any]) -> None:
    path = str(payload.get("path") or "")
    result = await asyncio.to_thread(apply_wallpaper, path)
    await ws_manager.broadcast("WALLPAPER_APPLIED", result)
    if result.get("ok"):
        await broadcast_wallpaper_state()
    else:
        await ws_manager.broadcast(
            "ERROR", {"message": result.get("message") or "Could not apply wallpaper."}
        )


async def _handle_clear_wallpaper_history(payload: Dict[str, Any]) -> None:
    await asyncio.to_thread(clear_history)
    await broadcast_wallpaper_state()


def register_wallpaper_events() -> None:
    register_handler("GET_WALLPAPER_STATE", _handle_get_wallpaper_state)
    register_handler("SET_WALLPAPER", _handle_set_wallpaper)
    register_handler("CLEAR_WALLPAPER_HISTORY", _handle_clear_wallpaper_history)
