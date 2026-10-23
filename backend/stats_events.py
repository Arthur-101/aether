"""
WebSocket events for the Stats tab.

The speed test runs for a requested duration, so it gets its own task:
progress arrives as SPEED_TEST_PROGRESS and the final snapshot as
SPEED_TEST_RESULT. Only one run may be in flight at a time.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict

from .event_router import register_handler
from .ws_manager import ws_manager

logger = logging.getLogger("aether.stats")

_running = False
_run_id = 0


async def _broadcast_progress(run_id: int, payload: Dict[str, Any]) -> None:
    if run_id != _run_id or not _running:
        return
    await ws_manager.broadcast("SPEED_TEST_PROGRESS", payload)


async def _run_speed_test(run_id: int, duration_seconds: int) -> None:
    global _running

    from .os_hooks.speed_test import run_speed_test

    loop = asyncio.get_running_loop()

    def emit_progress(payload: Dict[str, Any]) -> None:
        try:
            asyncio.run_coroutine_threadsafe(
                _broadcast_progress(run_id, payload), loop
            )
        except RuntimeError:
            # The event loop is shutting down; the run can finish quietly.
            pass

    try:
        result = await loop.run_in_executor(
            None, run_speed_test, emit_progress, duration_seconds
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Speed test failed: %s", exc)
        result = {
            "state": "error",
            "message": str(exc),
            "duration_seconds": duration_seconds,
        }

    try:
        if run_id == _run_id:
            # Stop accepting queued progress before the final snapshot lands.
            _running = False
            await ws_manager.broadcast("SPEED_TEST_RESULT", result)
    finally:
        if run_id == _run_id:
            _running = False


async def _handle_run_speed_test(payload: Dict[str, Any]) -> None:
    global _running, _run_id

    if _running:
        await ws_manager.broadcast("SPEED_TEST_STATE", {"state": "running"})
        return

    from .os_hooks.speed_test import clamp_duration

    duration_seconds = clamp_duration(payload.get("duration_seconds"))
    _running = True
    _run_id += 1
    run_id = _run_id
    await ws_manager.broadcast(
        "SPEED_TEST_STATE",
        {"state": "running", "duration_seconds": duration_seconds},
    )
    asyncio.create_task(_run_speed_test(run_id, duration_seconds))


def register_stats_events() -> None:
    register_handler("RUN_SPEED_TEST", _handle_run_speed_test)
