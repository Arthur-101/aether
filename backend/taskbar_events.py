"""WebSocket handlers for Windows taskbar pins, open apps, and launching."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional

from .event_router import register_handler
from .executor_guard import ExecutorCallTimeout, run_guarded
from .os_hooks.taskbar_launch import launch_entry
from .os_hooks.taskbar_state import build_taskbar_state, find_app
from .ws_manager import ws_manager

logger = logging.getLogger("aether.taskbar.events")
_LAST_SIGNATURE = ""
_POLL_TASK: Optional[asyncio.Task] = None
_BUSY_MESSAGE = (
    "Aether's background workers are busy, so that taskbar action did not "
    "run. Try again in a moment."
)


def _signature(state: Dict[str, Any]) -> str:
    """Cheap change detector for broadcasts from the background poller."""
    apps = tuple(
        (
            app.get("id"),
            app.get("name"),
            app.get("running"),
            app.get("missing"),
            app.get("target_path"),
        )
        for app in state.get("apps", [])
    )
    return repr((state.get("mode"), state.get("message"), apps))


async def broadcast_taskbar_apps() -> Dict[str, Any]:
    """Resolves pins in a worker thread and broadcasts the dock state."""
    global _LAST_SIGNATURE
    try:
        state = await run_guarded("taskbar state", build_taskbar_state)
    except ExecutorCallTimeout as exc:
        logger.warning("Taskbar state unavailable: %s", exc)
        await ws_manager.broadcast("ERROR", {"message": _BUSY_MESSAGE})
        return {}
    _LAST_SIGNATURE = _signature(state)
    await ws_manager.broadcast("TASKBAR_APPS_STATE", state)
    return state


async def _handle_get_taskbar(payload: Dict[str, Any]) -> None:
    await broadcast_taskbar_apps()


async def _refresh_after_launch() -> None:
    await asyncio.sleep(1.4)
    try:
        await broadcast_taskbar_apps()
    except Exception as exc:
        logger.debug("Post-launch taskbar refresh failed: %s", exc)


async def _handle_launch_taskbar(payload: Dict[str, Any]) -> None:
    app_id = str(payload.get("app_id") or "").strip()
    try:
        state = await run_guarded("taskbar launch state", build_taskbar_state)
    except ExecutorCallTimeout as exc:
        logger.warning("Taskbar launch skipped: %s", exc)
        await ws_manager.broadcast("ERROR", {"message": _BUSY_MESSAGE})
        return
    entry = find_app(state, app_id)
    if entry is None:
        await ws_manager.broadcast(
            "ERROR", {"message": "That app is no longer in the taskbar deck."}
        )
        await ws_manager.broadcast("TASKBAR_APPS_STATE", state)
        return

    try:
        result = await run_guarded("taskbar launch", launch_entry, entry)
    except ExecutorCallTimeout as exc:
        logger.warning("Taskbar launch skipped: %s", exc)
        await ws_manager.broadcast("ERROR", {"message": _BUSY_MESSAGE})
        await ws_manager.broadcast("TASKBAR_APPS_STATE", state)
        return
    if not result.get("ok"):
        await ws_manager.broadcast(
            "ERROR", {"message": result.get("message") or "Could not launch the app."}
        )
        await ws_manager.broadcast("TASKBAR_APPS_STATE", state)
        return

    for app in state.get("apps", []):
        if app.get("id") == app_id:
            app["running"] = True
            break
    await ws_manager.broadcast("TASKBAR_APPS_STATE", state)
    asyncio.create_task(_refresh_after_launch())


async def _taskbar_poll_loop() -> None:
    """Picks up apps opening/closing without requiring a Settings refresh."""
    global _LAST_SIGNATURE
    while True:
        await asyncio.sleep(4)
        if ws_manager.client_count == 0:
            continue
        try:
            state = await run_guarded("taskbar poll", build_taskbar_state)
            signature = _signature(state)
            if signature == _LAST_SIGNATURE:
                continue
            _LAST_SIGNATURE = signature
            await ws_manager.broadcast("TASKBAR_APPS_STATE", state)
        except Exception as exc:
            logger.debug("Taskbar poll failed: %s", exc)


def start_taskbar_poller() -> None:
    global _POLL_TASK
    if _POLL_TASK is not None and not _POLL_TASK.done():
        return
    _POLL_TASK = asyncio.create_task(_taskbar_poll_loop())


def stop_taskbar_poller() -> None:
    global _POLL_TASK
    if _POLL_TASK is not None:
        _POLL_TASK.cancel()
        _POLL_TASK = None


def register_taskbar_events() -> None:
    register_handler("GET_TASKBAR_APPS", _handle_get_taskbar)
    register_handler("LAUNCH_TASKBAR_APP", _handle_launch_taskbar)
    start_taskbar_poller()
