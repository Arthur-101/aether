"""
Aether File/Tool WebSocket Handlers
Owns Radial Wheel tool execution and dropped-file ingestion.
"""

import json
import logging
import re
from pathlib import Path
from typing import Any, Dict

from .db.attachments import list_attachments, remove_attachment
from .db.sessions import session_manager
from .event_router import register_handler
from .mcp_tools.doc_tools import attach_file_for_ask
from .mcp_tools.server import execute_tool
from .ws_manager import ws_manager

logger = logging.getLogger("aether.tools")


def _parse_crop_target(target: str) -> tuple[int, int]:
    match = re.match(r"(\d+)\s*x\s*(\d+)", target or "")
    if not match:
        raise ValueError("Crop target must be '<width>x<height>'.")
    return int(match.group(1)), int(match.group(2))


async def _handle_wheel_action(payload: Dict[str, Any]) -> None:
    """Executes a deterministic file action from the Radial Wheel."""
    import asyncio

    action = payload.get("action", "")
    file_path = payload.get("file_path", "")
    target = payload.get("target", "")
    loop = asyncio.get_running_loop()

    try:
        if action == "ASK":
            await _attach_file(file_path)
            return
        if action == "CROP":
            width, height = _parse_crop_target(target)
            result = await loop.run_in_executor(
                None,
                lambda: execute_tool(
                    "crop_image",
                    {"file_path": file_path, "width": width, "height": height},
                ),
            )
        elif action == "ADD_BG":
            options = json.loads(target) if target else {}
            result = await loop.run_in_executor(
                None,
                lambda: execute_tool(
                    "add_background",
                    {
                        "file_path": file_path,
                        "background": options.get("bg", "#0F172A"),
                        "padding": options.get("pad", 32),
                        "corners": options.get("crn", 16),
                        "shadow": options.get("shd", 24),
                    },
                ),
            )
        else:
            tool_map = {
                "CONVERT": (
                    "convert_image_format",
                    {"file_path": file_path, "target_format": target},
                ),
                "COMPRESS": ("compress_media", {"file_path": file_path}),
                "STRIP_META": ("strip_image_metadata", {"file_path": file_path}),
                "REMOVE_BG": ("remove_image_background", {"file_path": file_path}),
                "CONVERT_DOC": (
                    "convert_document",
                    {"file_path": file_path, "target_format": target},
                ),
            }
            entry = tool_map.get(action)
            if not entry:
                await ws_manager.broadcast(
                    "WHEEL_RESULT", {"error": f"Unknown action: {action}"}
                )
                return
            tool_name, args = entry
            result = await loop.run_in_executor(
                None, lambda: execute_tool(tool_name, args)
            )
    except Exception as exc:
        await ws_manager.broadcast(
            "WHEEL_RESULT", {"action": action, "error": str(exc)}
        )
        return

    await ws_manager.broadcast(
        "WHEEL_RESULT",
        {"action": action, "file_path": file_path, "result": result},
    )


async def attach_file(file_path: str, session_title: str = "") -> bool:
    """Attaches a file to the active session and reports indexing status.

    Returns True when the attachment reached the session store. Region to Ask
    and the file picker both use this path so images share the same vision
    pipeline.
    """
    import asyncio

    if not file_path:
        return False
    path = Path(file_path)
    sid = session_manager.active_session_id
    created = False
    if not sid:
        sid = session_manager.get_or_create_session(
            session_title or path.stem or "Attached file"
        )
        created = True
    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(
            None, lambda: attach_file_for_ask(sid, file_path)
        )
    except Exception as exc:
        await ws_manager.broadcast(
            "FILE_ATTACH_ERROR", {"file_path": file_path, "message": str(exc)}
        )
        await ws_manager.broadcast("ERROR", {"message": str(exc)})
        return False

    attachments = await loop.run_in_executor(None, lambda: list_attachments(sid))
    if created:
        data = await loop.run_in_executor(None, lambda: session_manager.switch_session(sid))
        data["attachments"] = attachments
        await ws_manager.broadcast("SESSION_SWITCHED", data)

    await ws_manager.broadcast(
        "FILE_ATTACHED_READY",
        {"session_id": sid, **result, "attachments": attachments},
    )
    await ws_manager.broadcast(
        "ATTACHMENTS_STATE",
        {"session_id": sid, "attachments": attachments},
    )
    return True


async def _handle_attach_file(payload: Dict[str, Any]) -> None:
    await attach_file(str(payload.get("file_path", "")))


async def _handle_file_drop(payload: Dict[str, Any]) -> None:
    """Attaches a dropped file for ASK in the current session."""
    if payload.get("ask", True):
        await attach_file(str(payload.get("file_path", "")))
        return
    await _handle_attach_file(payload)


async def _handle_detach_file(payload: Dict[str, Any]) -> None:
    """Removes an attachment and its vectors from the active session."""
    import asyncio

    file_path = str(payload.get("file_path", ""))
    sid = session_manager.active_session_id
    if not sid or not file_path:
        return
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, lambda: remove_attachment(sid, file_path))
    await ws_manager.broadcast(
        "ATTACHMENTS_STATE",
        {
            "session_id": sid,
            "attachments": await loop.run_in_executor(
                None, lambda: list_attachments(sid)
            ),
        },
    )


def register_tool_events() -> None:
    """Registers file/tool event handlers."""
    register_handler("WHEEL_ACTION", _handle_wheel_action)
    register_handler("FILE_DROPPED_ISLAND", _handle_file_drop)
    register_handler("ATTACH_FILE", _handle_attach_file)
    register_handler("DETACH_FILE", _handle_detach_file)
