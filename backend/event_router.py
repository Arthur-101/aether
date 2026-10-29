"""
Aether Event Router
Handles incoming WebSocket messages from the Tauri frontend and dispatches
to the appropriate backend subsystems (session, LLM, tools, config).
"""

import asyncio
import logging
from typing import Any, Callable, Dict

from .ai.errors import ModelNotConfiguredError
from .chat_execution import execute_chat_turn, resolve_tool_approval
from .db.attachments import list_attachments
from .db.sessions import session_manager
from .os_hooks.region_capture import discard_capture
from .ws_manager import ws_manager

logger = logging.getLogger("aether.router")

# Typed event handler registry
_HANDLERS: Dict[str, Callable] = {}


def register_handler(event_type: str, fn: Callable) -> None:
    """Public registration used by feature modules (e.g. system control)."""
    _HANDLERS[event_type] = fn


def _handler(event_type: str):
    """Decorator to register a handler for an incoming WS event type."""
    def decorator(fn):
        register_handler(event_type, fn)
        return fn
    return decorator


async def route_event(event: Dict[str, Any]) -> None:
    """Top-level dispatcher: reads 'type' from envelope, calls matching handler."""
    event_type = event.get("type", "")
    payload = event.get("payload", {})
    handler = _HANDLERS.get(event_type)
    if not handler:
        logger.warning("Unknown event type: %s", event_type)
        return
    try:
        result = handler(payload)
        if asyncio.iscoroutine(result):
            await result
    except Exception as e:
        logger.error("Handler error [%s]: %s", event_type, e)
        await ws_manager.broadcast("ERROR", {"event": event_type, "message": str(e)})


async def _chat_error(session_id: str, prompt: str, message: str) -> None:
    """Shows an actionable error inside Quick Chat and opens Settings."""
    await ws_manager.broadcast("ERROR_CONFIG_MISSING", {
        "target": "llm",
        "message": message,
    })
    await ws_manager.broadcast("SESSION_UPDATED", {
        "session_id": session_id,
        "title": _get_session_title(session_id),
        "turn": {"user": prompt, "ai": f"⚠️ {message}"},
        "reasoning": "",
        "tools_used": [],
        "error": True,
    })


@_handler("CHAT_MESSAGE")
async def _handle_chat(payload: Dict[str, Any]) -> None:
    """Processes a text message from the Island chat input."""
    prompt = payload.get("text", "").strip()
    if not prompt:
        return

    sid = session_manager.get_or_create_session(prompt)
    if session_manager.session_changed:
        # A restart or the inactivity timeout opened a new session. Reset the
        # visible history so it never mixes turns the model cannot remember.
        await ws_manager.broadcast("SESSION_STARTED", {
            "session": {"id": sid, "title": _get_session_title(sid)},
        })

    try:
        result = await execute_chat_turn(sid, prompt, stream=True)
    except ModelNotConfiguredError as exc:
        await _chat_error(sid, prompt, str(exc))
        return
    except Exception as exc:
        logger.exception("Chat completion failed")
        await _chat_error(sid, prompt, f"Model request failed: {exc}")
        return

    approval = result.get("approval_required")
    if approval:
        await ws_manager.broadcast("TOOL_APPROVAL_REQUIRED", {
            "session_id": sid,
            "prompt": prompt,
            **approval,
        })
        return

    await ws_manager.broadcast("SESSION_UPDATED", {
        "session_id": sid,
        "title": _get_session_title(sid),
        "turn": {
            "user": prompt,
            "ai": result["reply"],
            "attachments": result.get("attachments", []),
            "tools_used": result.get("tools_used", []),
        },
        "reasoning": result.get("reasoning", ""),
        "tools_used": result.get("tool_calls_executed", []),
    })
    from .task_events import broadcast_tasks

    await broadcast_tasks()
    from .model_events import broadcast_model_status

    await broadcast_model_status()


@_handler("RESOLVE_TOOL_APPROVAL")
async def _handle_tool_approval(payload: Dict[str, Any]) -> None:
    """Runs or declines a paused guarded tool call, then finishes its turn."""
    approval_id = str(payload.get("approval_id") or "")
    session_id = str(payload.get("session_id") or "")
    prompt = str(payload.get("prompt") or "")
    approved = bool(payload.get("approved"))
    if not approval_id or not session_id or not prompt:
        await ws_manager.broadcast("ERROR", {"message": "Invalid tool approval."})
        return
    result = await resolve_tool_approval(
        session_id, prompt, approval_id, approved, stream=True
    )
    if result.get("error"):
        await ws_manager.broadcast("ERROR", {"message": result["error"]})
        return
    await ws_manager.broadcast("SESSION_UPDATED", {
        "session_id": session_id,
        "title": _get_session_title(session_id),
        "turn": {
            "user": prompt,
            "ai": result["reply"],
            "attachments": result.get("attachments", []),
            "tools_used": result.get("tools_used", []),
        },
        "reasoning": result.get("reasoning", ""),
        "tools_used": result.get("tool_calls_executed", []),
    })


@_handler("NEW_SESSION")
async def _handle_new_session(payload: Dict[str, Any]) -> None:
    """Creates a blank session for the Drawer's New Chat button."""
    loop = asyncio.get_running_loop()
    data = await loop.run_in_executor(None, session_manager.create_empty_session)
    data["attachments"] = []
    await ws_manager.broadcast("SESSION_SWITCHED", data)


@_handler("SWITCH_SESSION")
async def _handle_switch_session(payload: Dict[str, Any]) -> None:
    """Switches the active session and broadcasts full history."""
    sid = payload.get("session_id", "")
    if not sid:
        return
    loop = asyncio.get_running_loop()
    data = await loop.run_in_executor(None, lambda: session_manager.switch_session(sid))
    data["attachments"] = await loop.run_in_executor(
        None, lambda: list_attachments(sid)
    )
    await ws_manager.broadcast("SESSION_SWITCHED", data)


@_handler("DELETE_SESSION")
async def _handle_delete_session(payload: Dict[str, Any]) -> None:
    """Deletes a session and its session-scoped attachments/vectors."""
    sid = payload.get("session_id", "")
    if not sid:
        return
    loop = asyncio.get_running_loop()
    from .mcp_tools.clock_scheduler import cancel_tasks_for_session

    await loop.run_in_executor(None, lambda: cancel_tasks_for_session(sid))
    # Collect this session's capture paths before the rows disappear; discard
    # after deletion so references held by other sessions are respected.
    from .os_hooks.region_capture import is_capture_path

    session_files = await loop.run_in_executor(
        None, lambda: [row["file_path"] for row in list_attachments(sid)]
    )
    captures = [path for path in session_files if is_capture_path(path)]
    deleted = await loop.run_in_executor(
        None, lambda: session_manager.delete_session(sid)
    )
    for path in captures:
        await loop.run_in_executor(None, lambda p=path: discard_capture(p))
    sessions = await loop.run_in_executor(None, session_manager.list_sessions)
    await ws_manager.broadcast(
        "SESSION_DELETED",
        {
            "session_id": sid,
            "deleted": deleted,
            "active_session_id": session_manager.active_session_id or "",
        },
    )
    await ws_manager.broadcast("SESSION_LIST", {"sessions": sessions})
    from .task_events import broadcast_tasks

    await broadcast_tasks()


@_handler("LIST_SESSIONS")
async def _handle_list_sessions(payload: Dict[str, Any]) -> None:
    """Returns all sessions for the Session Drawer."""
    loop = asyncio.get_running_loop()
    sessions = await loop.run_in_executor(None, session_manager.list_sessions)
    await ws_manager.broadcast("SESSION_LIST", {"sessions": sessions})


def _get_session_title(session_id: str) -> str:
    """Fetches the 5-word session title from the database."""
    from .db.database import get_db
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT title FROM sessions WHERE id = ?", (session_id,))
    row = cur.fetchone()
    conn.close()
    return row["title"] if row else "New Session"


def _register_builtin_handlers() -> None:
    """Registers lightweight config/tool handlers at import time.

    This keeps WebSocket routing available even when the ASGI lifespan is not
    entered (e.g. Starlette TestClient without a context manager). Heavy OS
    handlers are still registered lazily by runtime_wiring.start_runtime().
    """
    from .app_events import register_app_events
    from .config_events import register_config_events
    from .model_events import register_model_events
    from .note_events import register_note_events
    from .power_events import register_power_events
    from .region_events import register_region_events
    from .spotify_events import register_spotify_events
    from .task_events import register_task_events
    from .tool_events import register_tool_events
    from .wallpaper_events import register_wallpaper_events
    from .weather_events import register_weather_events

    register_config_events()
    register_tool_events()
    register_region_events()
    register_task_events()
    register_weather_events()
    register_model_events()
    register_note_events()
    register_wallpaper_events()
    register_power_events()
    register_app_events()
    register_spotify_events()


_register_builtin_handlers()
