"""
Aether Local Model Lifecycle Events
WebSocket handlers to preload llama-server or release its VRAM on demand.
"""

import asyncio
import logging
from typing import Any, Dict

from .ai.llm_router import llm_router
from .config_manager import config_manager
from .event_router import register_handler
from .ws_manager import ws_manager

logger = logging.getLogger("aether.model")
_model_lock = asyncio.Lock()


def _is_local() -> bool:
    mode = str(config_manager.get("ai_provider", "mode", "local_gguf") or "local_gguf")
    return mode == "local_gguf"


async def broadcast_model_status(starting: bool = False) -> None:
    """Publishes whether the local model is loaded, plus load-in-progress state."""
    local = _is_local()
    loop = asyncio.get_running_loop()
    loaded = bool(await loop.run_in_executor(None, llm_router.is_healthy)) if local else False
    await ws_manager.broadcast(
        "MODEL_STATUS",
        {"loaded": loaded, "starting": bool(starting), "local": local},
    )


async def _handle_status(payload: Dict[str, Any]) -> None:
    await broadcast_model_status()


async def _handle_load(payload: Dict[str, Any]) -> None:
    if not _is_local():
        await ws_manager.broadcast(
            "ERROR", {"message": "Load/Release is available only in Local GGUF mode."}
        )
        await broadcast_model_status()
        return
    async with _model_lock:
        await broadcast_model_status(starting=True)
        loop = asyncio.get_running_loop()
        try:
            loaded = await loop.run_in_executor(None, llm_router.start_server)
        except Exception as exc:
            logger.exception("Local model preload failed")
            await ws_manager.broadcast(
                "ERROR", {"message": f"Could not load the local model: {exc}"}
            )
            await broadcast_model_status()
            return
        if not loaded:
            await ws_manager.broadcast(
                "ERROR",
                {"message": "The local model did not become healthy. Check Settings."},
            )
        await broadcast_model_status()


async def _handle_release(payload: Dict[str, Any]) -> None:
    if not _is_local():
        await ws_manager.broadcast(
            "ERROR", {"message": "Load/Release is available only in Local GGUF mode."}
        )
        await broadcast_model_status()
        return
    async with _model_lock:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, llm_router.stop_server)
        await broadcast_model_status()


def register_model_events() -> None:
    """Registers model lifecycle handlers."""
    register_handler("GET_MODEL_STATUS", _handle_status)
    register_handler("LOAD_MODEL", _handle_load)
    register_handler("RELEASE_MODEL", _handle_release)
