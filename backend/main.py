"""
Aether Backend Daemon — FastAPI + WebSocket Entrypoint
Boots with CORS, lifespan management, telemetry, OS hooks, and system control.
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any, Dict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .config_manager import config_manager
from .config_api import router as config_router
from .event_router import route_event
from .guide_api import router as guide_router
from .media_api import router as media_router
from .notes.note_api import router as notes_router
from .system_api import router as system_router
from .ws_manager import ws_manager

logger = logging.getLogger("aether")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")

WS_PORT = 8765


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init DB, wire hooks, start telemetry. Shutdown: clean up."""
    logger.info("Aether daemon starting on port %d...", WS_PORT)

    from .db.database import init_db

    init_db()

    from .executor_guard import start_executor_watchdog, stop_executor_watchdog
    from .runtime_wiring import start_runtime, stop_runtime, telemetry_loop

    start_executor_watchdog()
    telemetry_task = asyncio.create_task(telemetry_loop())
    try:
        start_runtime()
    except Exception as exc:
        logger.warning("Runtime wiring skipped: %s", exc)

    logger.info("Aether daemon ready.")
    try:
        yield
    finally:
        telemetry_task.cancel()
        stop_executor_watchdog()
        stop_runtime()
        logger.info("Aether daemon stopped.")


app = FastAPI(title="Aether", version="0.1.0", lifespan=lifespan)
app.include_router(config_router)
app.include_router(system_router)
app.include_router(notes_router)
app.include_router(guide_router)
app.include_router(media_router)

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
    except Exception as exc:
        logger.error("WS error: %s", exc)
        await ws_manager.disconnect(ws)


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """Simple health endpoint for daemon readiness probes."""
    from .executor_guard import executor_health

    return {
        "status": "ok",
        "clients": ws_manager.client_count,
        "thinking_mode": config_manager.get("ai_provider", "thinking_mode", False),
        "executor": executor_health(),
    }


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
