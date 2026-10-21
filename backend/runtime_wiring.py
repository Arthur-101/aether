"""
Aether Runtime Wiring
Bridges OS hooks, telemetry, system controls, and the WebSocket broadcaster.
Imported from main.py's lifespan so startup remains fast and lazy.
"""

import asyncio
import logging
import threading
from typing import Any, Dict

from .ws_manager import ws_manager

logger = logging.getLogger("aether.runtime")
TELEMETRY_INTERVAL = 2.0


async def telemetry_loop() -> None:
    """Pushes SYSTEM_STATS to all clients every 2 seconds."""
    from .os_hooks.system_controls import get_system_telemetry

    while True:
        try:
            if ws_manager.client_count > 0:
                loop = asyncio.get_running_loop()
                stats = await loop.run_in_executor(None, get_system_telemetry)
                await ws_manager.broadcast("SYSTEM_STATS", stats)
        except Exception as exc:
            logger.debug("Telemetry tick error: %s", exc)
        await asyncio.sleep(TELEMETRY_INTERVAL)


def wire_hotkey_callbacks() -> None:
    """Connects HotkeyManager callbacks to broadcast WS events."""
    from .os_hooks.hotkeys import hotkey_manager

    loop = asyncio.get_running_loop()

    def on_voice_state(state: str, text: str) -> None:
        asyncio.run_coroutine_threadsafe(
            ws_manager.broadcast("VOICE_STATE", {"state": state, "transcript": text}),
            loop,
        )

    def on_show_wheel(x: int, y: int, path: str, ext: str) -> None:
        asyncio.run_coroutine_threadsafe(
            ws_manager.broadcast(
                "RADIAL_WHEEL_OPEN",
                {"x": x, "y": y, "file_path": path, "ext": ext},
            ),
            loop,
        )

    def on_wheel_drop(x: int, y: int) -> None:
        asyncio.run_coroutine_threadsafe(
            ws_manager.broadcast("RADIAL_WHEEL_DROP", {"x": x, "y": y}), loop
        )

    def on_wheel_move(x: int, y: int) -> None:
        asyncio.run_coroutine_threadsafe(
            ws_manager.broadcast(
                "RADIAL_WHEEL_MOVE", {"cursor_x": x, "cursor_y": y}
            ),
            loop,
        )

    def on_circle_to_ask() -> None:
        asyncio.run_coroutine_threadsafe(ws_manager.broadcast("CIRCLE_TO_ASK", {}), loop)

    def on_session_updated(data: Dict[str, Any]) -> None:
        asyncio.run_coroutine_threadsafe(
            ws_manager.broadcast("SESSION_UPDATED", data), loop
        )

    hotkey_manager.on_voice_state = on_voice_state
    hotkey_manager.on_show_wheel = on_show_wheel
    hotkey_manager.on_wheel_move = on_wheel_move
    hotkey_manager.on_circle_to_ask = on_circle_to_ask
    hotkey_manager.on_session_updated = on_session_updated
    hotkey_manager.drag_detector.on_drop = on_wheel_drop
    hotkey_manager.start()
    logger.info("Hotkey listeners started")


def wire_mouse_tracker() -> None:
    """Streams global cursor coordinates for click-through hit-testing."""
    from .os_hooks.mouse_tracker import mouse_tracker

    loop = asyncio.get_running_loop()

    def on_position(x: int, y: int) -> None:
        try:
            asyncio.run_coroutine_threadsafe(
                ws_manager.broadcast("MOUSE_POSITION", {"x": x, "y": y}), loop
            )
        except RuntimeError:
            pass

    mouse_tracker.on_position = on_position
    mouse_tracker.start()
    logger.info("Mouse position tracker started")


def wire_clock_scheduler() -> None:
    """Registers the clock scheduler wake callback and restores saved tasks."""
    from .mcp_tools.clock_scheduler import (
        register_wake_callback,
        restore_scheduled_tasks,
    )

    loop = asyncio.get_running_loop()

    def play_alarm_chime() -> None:
        try:
            import time
            import winsound

            for _ in range(3):
                winsound.Beep(880, 180)
                winsound.Beep(1180, 180)
                time.sleep(0.18)
        except Exception:
            pass

    def on_clock_trigger(
        session_id: str,
        system_event: str,
        task_id: str,
        kind: str = "task",
        prompt: str = "",
    ) -> None:
        if kind != "alarm":
            from .task_execution import run_scheduled_task

            asyncio.run_coroutine_threadsafe(
                run_scheduled_task(session_id, task_id, prompt, kind), loop
            )
            return

        threading.Thread(target=play_alarm_chime, daemon=True).start()

        async def _notify() -> None:
            await ws_manager.broadcast(
                "CLOCK_TRIGGER",
                {
                    "session_id": session_id,
                    "event": system_event,
                    "task_id": task_id,
                    "kind": kind,
                    "title": prompt,
                },
            )
            from .task_events import broadcast_tasks

            await broadcast_tasks()

        asyncio.run_coroutine_threadsafe(_notify(), loop)

    register_wake_callback(on_clock_trigger)
    restored = restore_scheduled_tasks()
    logger.info(
        "Clock scheduler ready: %d restored, %d missed, %d expired",
        restored["restored"],
        restored["missed"],
        restored.get("expired", 0),
    )


def start_runtime() -> None:
    """Registers OS event handlers and starts hook wiring."""
    from .system_events import register_system_events

    register_system_events()

    for name, wire in (
        ("Hotkey init", wire_hotkey_callbacks),
        ("Mouse tracker init", wire_mouse_tracker),
        ("Clock scheduler init", wire_clock_scheduler),
    ):
        try:
            wire()
        except Exception as exc:
            logger.warning("%s skipped: %s", name, exc)


def stop_runtime() -> None:
    """Stops listeners, model server, and scheduler during shutdown."""
    try:
        from .os_hooks.hotkeys import hotkey_manager

        hotkey_manager.stop()
    except Exception:
        pass
    try:
        from .os_hooks.mouse_tracker import mouse_tracker

        mouse_tracker.stop()
    except Exception:
        pass
    try:
        from .ai.llm_router import llm_router

        llm_router.stop_server()
    except Exception:
        pass
    try:
        from .mcp_tools.clock_scheduler import scheduler

        scheduler.shutdown(wait=False)
    except Exception:
        pass
