"""
WebSocket events for the Stats tab.

The speed test takes a few seconds, so it runs as its own task: the handler
returns immediately and the result arrives later as SPEED_TEST_RESULT. Only
one run may be in flight at a time.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict

from .event_router import register_handler
from .ws_manager import ws_manager

logger = logging.getLogger("aether.stats")

_running = False


async def _run_speed_test() -> None:
    global _running

    from .os_hooks.speed_test import run_speed_test

    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(None, run_speed_test)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Speed test failed: %s", exc)
        result = {"state": "error", "message": str(exc)}
    finally:
        _running = False

    await ws_manager.broadcast("SPEED_TEST_RESULT", result)


async def _handle_run_speed_test(payload: Dict[str, Any]) -> None:
    global _running

    if _running:
        await ws_manager.broadcast("SPEED_TEST_STATE", {"state": "running"})
        return

    _running = True
    await ws_manager.broadcast("SPEED_TEST_STATE", {"state": "running"})
    asyncio.create_task(_run_speed_test())


def register_stats_events() -> None:
    register_handler("RUN_SPEED_TEST", _handle_run_speed_test)
