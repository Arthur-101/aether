"""
Aether Event Router
Handles incoming WebSocket messages from the Tauri frontend and dispatches
to the appropriate backend subsystems (session, LLM, tools, config).
"""

import asyncio
import json
import logging
from typing import Any, Callable, Dict

from .ai.errors import ModelNotConfiguredError
from .ai.llm_router import llm_router
from .ai.prompts import build_assistant_messages
from .config_manager import get_app_dir, get_data_dir
from .db.attachments import list_attachments
from .db.sessions import session_manager
from .mcp_tools.attachment_tools import image_attachment_paths
from .mcp_tools.server import get_openai_tool_schemas
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


def _load_preferences() -> Dict[str, Any]:
    """Loads optional cross-session user facts from preferences.json."""
    for path in (get_data_dir() / "preferences.json", get_app_dir() / "preferences.json"):
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                return {}
    return {}


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
    loop = asyncio.get_running_loop()
    context = await loop.run_in_executor(
        None, lambda: session_manager.build_session_context(sid, prompt)
    )
    messages = build_assistant_messages(
        prompt,
        session_context=context,
        user_preferences=_load_preferences(),
        image_paths=await loop.run_in_executor(
            None, lambda: image_attachment_paths(sid)
        ),
    )
    tools = get_openai_tool_schemas()

    try:
        result = await loop.run_in_executor(
            None,
            lambda: llm_router.chat_completion(messages, tools=tools, session_id=sid),
        )
    except ModelNotConfiguredError as exc:
        await _chat_error(sid, prompt, str(exc))
        return
    except Exception as exc:
        logger.exception("Chat completion failed")
        await _chat_error(sid, prompt, f"Model request failed: {exc}")
        return

    reply = result.get("content", "")
    if not reply:
        reply = "I could not produce a response."

    await loop.run_in_executor(
        None, lambda: session_manager.commit_turn(sid, prompt, reply)
    )
    await ws_manager.broadcast("SESSION_UPDATED", {
        "session_id": sid,
        "title": _get_session_title(sid),
        "turn": {"user": prompt, "ai": reply},
        "reasoning": result.get("reasoning", ""),
        "tools_used": result.get("tool_calls_executed", []),
    })
    from .task_events import broadcast_tasks

    await broadcast_tasks()


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
    deleted = await loop.run_in_executor(
        None, lambda: session_manager.delete_session(sid)
    )
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
    from .config_events import register_config_events
    from .task_events import register_task_events
    from .tool_events import register_tool_events

    register_config_events()
    register_tool_events()
    register_task_events()


_register_builtin_handlers()

