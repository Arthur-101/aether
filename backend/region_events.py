"""
Aether Region to Ask WebSocket Handler
Captures a selected desktop rectangle or the whole screen and attaches it as
an image for the next prompt.
"""

import asyncio
import logging
from typing import Any, Dict

from .event_router import register_handler
from .os_hooks.region_capture import capture_region, capture_screen
from .tool_events import attach_file
from .ws_manager import ws_manager

logger = logging.getLogger("aether.region")


async def _handle_capture_region(payload: Dict[str, Any]) -> None:
    """Saves the selected screen area and opens it in Quick Chat."""
    try:
        x = int(payload.get("x", 0))
        y = int(payload.get("y", 0))
        width = int(payload.get("width", 0))
        height = int(payload.get("height", 0))
        loop = asyncio.get_running_loop()
        capture = await loop.run_in_executor(
            None, lambda: capture_region(x, y, width, height)
        )
    except Exception as exc:
        logger.warning("Region capture failed: %s", exc)
        await ws_manager.broadcast("REGION_CAPTURE_FAILED", {"message": str(exc)})
        await ws_manager.broadcast("ERROR", {"message": str(exc)})
        return

    attached = await attach_file(capture["file_path"], session_title="Region to Ask")
    if not attached:
        await ws_manager.broadcast(
            "REGION_CAPTURE_FAILED",
            {"message": "The region was captured but could not be attached."},
        )
        return

    await ws_manager.broadcast("REGION_CAPTURED", capture)


def register_region_events() -> None:
    """Registers the region and full-screen capture handlers."""
    register_handler("CAPTURE_REGION", _handle_capture_region)
    register_handler("CAPTURE_SCREEN", _handle_capture_screen)


async def _handle_capture_screen(payload: Dict[str, Any]) -> None:
    """Saves a full-screen PNG and attaches it to the active session."""
    loop = asyncio.get_running_loop()
    try:
        capture = await loop.run_in_executor(None, capture_screen)
    except Exception as exc:
        logger.warning("Screen capture failed: %s", exc)
        await ws_manager.broadcast("SCREEN_CAPTURE_FAILED", {"message": str(exc)})
        await ws_manager.broadcast("ERROR", {"message": str(exc)})
        return

    attached = await attach_file(capture["file_path"], session_title="Screenshot")
    if not attached:
        await ws_manager.broadcast(
            "SCREEN_CAPTURE_FAILED",
            {"message": "The screen was captured but could not be attached."},
        )
        return

    # The overlay was hidden for the shot; the UI shows it again on this.
    await ws_manager.broadcast("SCREENSHOT_ATTACHED", capture)

