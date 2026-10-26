"""
Shared foreground/background chat execution.

Keeping the prompt -> model -> persisted-turn flow here lets Quick Chat and
scheduled AI tasks use identical history, attachment, and tool behavior without
one importing the other's WebSocket handler.
"""

import asyncio
import json
import logging
from typing import Any, Dict

from .ai.llm_router import llm_router
from .ai.prompts import build_assistant_messages
from .config_manager import get_app_dir, get_data_dir
from .db.sessions import session_manager
from .mcp_tools.attachment_tools import image_attachment_paths
from .mcp_tools.server import get_openai_tool_schemas
from .ws_manager import ws_manager

logger = logging.getLogger("aether.chat")

CLOCK_MUTATION_TOOLS = {
    "schedule_one_time_task",
    "schedule_recurring_routine",
    "schedule_custom_task",
    "schedule_alarm",
    "update_scheduled_task",
    "cancel_scheduled_task",
    "complete_scheduled_task",
    "pause_scheduled_task",
    "resume_scheduled_task",
}

# Note tools that change the vault; the Notes tab is refreshed after such a turn.
NOTE_MUTATION_TOOLS = {
    "create_note",
    "append_to_note",
    "set_note_pinned",
}


def load_preferences() -> Dict[str, Any]:
    """Loads optional cross-session user facts from preferences.json."""
    for path in (get_data_dir() / "preferences.json", get_app_dir() / "preferences.json"):
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                return {}
    return {}


async def execute_chat_turn(session_id: str, prompt: str) -> Dict[str, Any]:
    """Runs one model turn and persists it to the linked session.

    The caller owns UI notifications so a background task never has to switch
    the active chat in order to save its result.
    """
    loop = asyncio.get_running_loop()
    context = await loop.run_in_executor(
        None, lambda: session_manager.build_session_context(session_id, prompt)
    )
    messages = build_assistant_messages(
        prompt,
        session_context=context,
        user_preferences=load_preferences(),
        image_paths=await loop.run_in_executor(
            None, lambda: image_attachment_paths(session_id)
        ),
    )

    def on_tool_call(event: Dict[str, Any]) -> None:
        """Forwards a tool-run step from the worker thread onto the WS loop."""
        event_type = (
            "TOOL_CALL_STARTED"
            if event.get("phase") == "started"
            else "TOOL_CALL_FINISHED"
        )
        asyncio.run_coroutine_threadsafe(
            ws_manager.broadcast(event_type, {"session_id": session_id, **event}),
            loop,
        )

    result = await loop.run_in_executor(
        None,
        lambda: llm_router.chat_completion(
            messages,
            tools=get_openai_tool_schemas(),
            session_id=session_id,
            on_tool_call=on_tool_call,
        ),
    )
    reply = result.get("content", "") or "I could not produce a response."
    await loop.run_in_executor(
        None, lambda: session_manager.commit_turn(session_id, prompt, reply)
    )
    mutated = {call.get("name") for call in result.get("tool_calls_executed", [])}
    if mutated & CLOCK_MUTATION_TOOLS:
        try:
            from .task_events import broadcast_tasks

            await broadcast_tasks()
        except Exception:
            logger.debug("Task list refresh after chat failed", exc_info=True)
    if mutated & NOTE_MUTATION_TOOLS:
        try:
            from .note_events import broadcast_notes

            await broadcast_notes()
        except Exception:
            logger.debug("Notes refresh after chat failed", exc_info=True)
    return {**result, "reply": reply}
