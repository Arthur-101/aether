"""
Aether Event Router
Handles incoming WebSocket messages from the Tauri frontend and dispatches
to the appropriate backend subsystems (session, LLM, tools, config).
"""

import asyncio
import logging
from typing import Any, Callable, Dict, Optional

from .ai.llm_router import llm_router
from .ai.prompts import build_assistant_messages
from .config_manager import config_manager
from .db.sessions import session_manager
from .mcp_tools.doc_tools import ingest_file_for_rag
from .mcp_tools.server import get_openai_tool_schemas
from .ws_manager import ws_manager

logger = logging.getLogger("aether.router")

# Typed event handler registry
_HANDLERS: Dict[str, Callable] = {}


def _handler(event_type: str):
    """Decorator to register a handler for an incoming WS event type."""
    def decorator(fn):
        _HANDLERS[event_type] = fn
        return fn
    return decorator


async def route_event(event: Dict[str, Any]) -> None:
    """Top-level dispatcher: reads 'type' from envelope, calls matching handler."""
    event_type = event.get("type", "")
    payload = event.get("payload", {})
    handler = _HANDLERS.get(event_type)
    if handler:
        try:
            result = handler(payload)
            if asyncio.iscoroutine(result):
                await result
        except Exception as e:
            logger.error("Handler error [%s]: %s", event_type, e)
            await ws_manager.broadcast("ERROR", {"event": event_type, "message": str(e)})
    else:
        logger.warning("Unknown event type: %s", event_type)


# ─── Event Handlers ─────────────────────────────────────────────


@_handler("CHAT_MESSAGE")
async def _handle_chat(payload: Dict[str, Any]) -> None:
    """Processes a text message from the Island chat input."""
    prompt = payload.get("text", "").strip()
    if not prompt:
        return

    sid = session_manager.get_or_create_session(prompt)
    context = session_manager.build_session_context(sid, prompt)
    messages = build_assistant_messages(prompt, session_context=context)
    tools = get_openai_tool_schemas()

    # Run blocking LLM call in thread pool
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, lambda: llm_router.chat_completion(messages, tools=tools)
    )
    reply = result.get("content", "")

    # Commit turn to memory
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


@_handler("SWITCH_SESSION")
async def _handle_switch_session(payload: Dict[str, Any]) -> None:
    """Switches the active session and broadcasts full history."""
    sid = payload.get("session_id", "")
    if not sid:
        return

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, lambda: session_manager.switch_session(sid))
    await ws_manager.broadcast("SESSION_SWITCHED", data)


@_handler("LIST_SESSIONS")
async def _handle_list_sessions(payload: Dict[str, Any]) -> None:
    """Returns all sessions for the Session Drawer."""
    loop = asyncio.get_event_loop()
    sessions = await loop.run_in_executor(None, lambda: session_manager.list_sessions())
    await ws_manager.broadcast("SESSION_LIST", {"sessions": sessions})


@_handler("WHEEL_ACTION")
async def _handle_wheel_action(payload: Dict[str, Any]) -> None:
    """Executes a deterministic file action from the Radial Wheel."""
    from .mcp_tools.server import execute_tool

    action = payload.get("action", "")
    file_path = payload.get("file_path", "")
    target = payload.get("target", "")

    tool_map = {
        "CONVERT": ("convert_image_format", {"file_path": file_path, "target_format": target}),
        "COMPRESS": ("compress_media", {"file_path": file_path}),
        "STRIP_META": ("strip_image_metadata", {"file_path": file_path}),
        "REMOVE_BG": ("remove_image_background", {"file_path": file_path}),
        "CONVERT_DOC": ("convert_document", {"file_path": file_path, "target_format": target}),
    }

    entry = tool_map.get(action)
    if not entry:
        await ws_manager.broadcast("WHEEL_RESULT", {"error": f"Unknown action: {action}"})
        return

    tool_name, args = entry
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: execute_tool(tool_name, args))
    await ws_manager.broadcast("WHEEL_RESULT", {
        "action": action, "file_path": file_path, "result": result
    })


@_handler("FILE_DROPPED_ISLAND")
async def _handle_file_drop(payload: Dict[str, Any]) -> None:
    """Ingests a dropped file for RAG in the current session."""
    file_path = payload.get("file_path", "")
    if not file_path:
        return

    sid = session_manager.active_session_id or session_manager.get_or_create_session("File drop")
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, lambda: ingest_file_for_rag(sid, file_path)
    )
    await ws_manager.broadcast("FILE_INGESTED", {"file_path": file_path, "result": result})


@_handler("TOGGLE_THINKING_MODE")
async def _handle_toggle_thinking(payload: Dict[str, Any]) -> None:
    """Toggles between Normal Mode (default) and Thinking Mode."""
    enabled = payload.get("enabled", False)
    config_manager.set("ai_provider", "thinking_mode", bool(enabled))
    await ws_manager.broadcast("THINKING_MODE_CHANGED", {"enabled": bool(enabled)})


@_handler("GET_CONFIG")
async def _handle_get_config(payload: Dict[str, Any]) -> None:
    """Returns current configuration to the frontend."""
    cfg = config_manager.load()
    await ws_manager.broadcast("CONFIG_STATE", cfg)


@_handler("UPDATE_CONFIG")
async def _handle_update_config(payload: Dict[str, Any]) -> None:
    """Updates a specific config section.key value from the Settings modal."""
    section = payload.get("section", "")
    key = payload.get("key", "")
    value = payload.get("value")
    if section and key:
        config_manager.set(section, key, value)
        await ws_manager.broadcast("CONFIG_UPDATED", {"section": section, "key": key, "value": value})


# ─── Helpers ─────────────────────────────────────────────────────


def _get_session_title(session_id: str) -> str:
    """Fetches the 5-word session title from the database."""
    from .db.database import get_db
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT title FROM sessions WHERE id = ?", (session_id,))
    row = cur.fetchone()
    conn.close()
    return row["title"] if row else "New Session"
