"""
Aether Backend Daemon — FastAPI + WebSocket Entrypoint
Boots in < 500ms with CORS, lifespan management, telemetry broadcaster,
OS hook wiring, and clock scheduler reverse-trigger integration.
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any, Dict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .config_manager import config_manager
from .event_router import route_event
from .ws_manager import ws_manager

logger = logging.getLogger("aether")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")

TELEMETRY_INTERVAL = 2.0  # seconds
WS_PORT = 8765


# ─── Background Tasks ──────────────────────────────────────────


async def _telemetry_loop() -> None:
    """Pushes SYSTEM_STATS to all clients every 2 seconds."""
    from .os_hooks.system_controls import get_system_telemetry

    while True:
        try:
            if ws_manager.client_count > 0:
                loop = asyncio.get_event_loop()
                stats = await loop.run_in_executor(None, get_system_telemetry)
                await ws_manager.broadcast("SYSTEM_STATS", stats)
        except Exception as e:
            logger.debug("Telemetry tick error: %s", e)
        await asyncio.sleep(TELEMETRY_INTERVAL)


# ─── OS Hooks → WebSocket Bridge ────────────────────────────────


def _wire_hotkey_callbacks() -> None:
    """Connects HotkeyManager callbacks to broadcast WS events."""
    from .os_hooks.hotkeys import hotkey_manager

    _loop = asyncio.get_event_loop()

    def on_voice_state(state: str, text: str) -> None:
        asyncio.run_coroutine_threadsafe(
            ws_manager.broadcast("VOICE_STATE", {"state": state, "transcript": text}),
            _loop,
        )

    def on_show_wheel(x: int, y: int, path: str, ext: str) -> None:
        asyncio.run_coroutine_threadsafe(
            ws_manager.broadcast("SHOW_RADIAL_WHEEL", {
                "x": x, "y": y, "file_path": path, "ext": ext
            }),
            _loop,
        )

    def on_circle_to_ask() -> None:
        asyncio.run_coroutine_threadsafe(
            ws_manager.broadcast("CIRCLE_TO_ASK", {}),
            _loop,
        )

    hotkey_manager.on_voice_state = on_voice_state
    hotkey_manager.on_show_wheel = on_show_wheel
    hotkey_manager.on_circle_to_ask = on_circle_to_ask
    hotkey_manager.start()
    logger.info("Hotkey listeners started")


def _wire_clock_scheduler() -> None:
    """Registers the clock scheduler wake callback to broadcast via WS."""
    from .mcp_tools.clock_scheduler import register_wake_callback

    _loop = asyncio.get_event_loop()

    def on_clock_trigger(session_id: str, system_event: str, task_id: str) -> None:
        asyncio.run_coroutine_threadsafe(
            ws_manager.broadcast("CLOCK_TRIGGER", {
                "session_id": session_id,
                "event": system_event,
                "task_id": task_id,
            }),
            _loop,
        )

    register_wake_callback(on_clock_trigger)
    logger.info("Clock scheduler wake callback registered")


# ─── FastAPI Lifespan ───────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init DB, wire hooks, start telemetry. Shutdown: clean up."""
    logger.info("Aether daemon starting on port %d...", WS_PORT)

    # Ensure database tables exist
    from .db.database import init_db
    init_db()
    # Start background telemetry broadcaster
    telemetry_task = asyncio.create_task(_telemetry_loop())

    # Wire OS hooks and clock scheduler (safe to fail gracefully)
    try:
        _wire_hotkey_callbacks()
    except Exception as e:
        logger.warning("Hotkey init skipped: %s", e)

    try:
        _wire_clock_scheduler()
    except Exception as e:
        logger.warning("Clock scheduler init skipped: %s", e)

    logger.info("Aether daemon ready.")
    yield

    # Shutdown
    telemetry_task.cancel()
    try:
        from .os_hooks.hotkeys import hotkey_manager
        hotkey_manager.stop()
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
    logger.info("Aether daemon stopped.")


# ─── FastAPI App ────────────────────────────────────────────────


app = FastAPI(title="Aether", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    """Primary IPC channel between Python daemon and Tauri frontend."""
    await ws_manager.connect(ws)

    # Send initial state on connect
    thinking = config_manager.get("ai_provider", "thinking_mode", False)
    await ws_manager.send_to(ws, "THINKING_MODE_CHANGED", {"enabled": thinking})

    try:
        while True:
            raw = await ws.receive_text()
            try:
                event = json.loads(raw)
                await route_event(event)
            except json.JSONDecodeError:
                await ws_manager.send_to(ws, "ERROR", {"message": "Invalid JSON"})
    except WebSocketDisconnect:
        await ws_manager.disconnect(ws)
    except Exception as e:
        logger.error("WS error: %s", e)
        await ws_manager.disconnect(ws)


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """Simple health endpoint for daemon readiness probes."""
    return {
        "status": "ok",
        "clients": ws_manager.client_count,
        "thinking_mode": config_manager.get("ai_provider", "thinking_mode", False),
    }


# ─── CLI Entrypoint ─────────────────────────────────────────────


def run_daemon() -> None:
    """Launches the Aether backend daemon via uvicorn."""
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="127.0.0.1",
        port=WS_PORT,
        log_level="info",
        ws="websockets",
    )


if __name__ == "__main__":
    run_daemon()
