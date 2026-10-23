"""WebSocket handlers for Lock, Sleep, Restart, and Shut down."""

from __future__ import annotations

import asyncio
from typing import Any, Dict

from .event_router import register_handler
from .os_hooks.power_controls import run_power_action
from .ws_manager import ws_manager


async def _handle_power_action(payload: Dict[str, Any]) -> None:
    action = str(payload.get("action") or "")
    confirm = payload.get("confirm") is True
    result = await asyncio.to_thread(run_power_action, action, confirm)
    await ws_manager.broadcast("POWER_ACTION_RESULT", result)


def register_power_events() -> None:
    register_handler("POWER_ACTION", _handle_power_action)
