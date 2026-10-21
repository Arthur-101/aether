"""
WebSocket weather events for the Clock & Tasks tab.
"""

import asyncio
from typing import Any, Dict

from .event_router import register_handler
from .weather_service import get_weather
from .ws_manager import ws_manager


async def broadcast_weather() -> None:
    """Fetches weather off the event loop and broadcasts the latest snapshot."""
    loop = asyncio.get_running_loop()
    snapshot = await loop.run_in_executor(None, get_weather)
    await ws_manager.broadcast("WEATHER_STATE", snapshot)


async def _handle_get_weather(payload: Dict[str, Any]) -> None:
    await broadcast_weather()


def register_weather_events() -> None:
    register_handler("GET_WEATHER", _handle_get_weather)
