"""WebSocket plumbing for the on-screen color picker."""

from __future__ import annotations

import asyncio
from typing import Any, Dict

from .event_router import register_handler
from .os_hooks.screen_sample import sample_screen
from .ws_manager import ws_manager


async def _handle_sample_screen(payload: Dict[str, Any]) -> None:
    request_id = str(payload.get("request_id") or "")
    try:
        radius = int(payload.get("radius", 10))
    except (TypeError, ValueError):
        radius = 10

    loop = asyncio.get_running_loop()
    sample = await loop.run_in_executor(None, sample_screen, radius)
    sample["request_id"] = request_id
    await ws_manager.broadcast("SCREEN_SAMPLE", sample)


def register_color_events() -> None:
    register_handler("SAMPLE_SCREEN", _handle_sample_screen)


__all__ = ["register_color_events"]
