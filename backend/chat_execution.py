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

logger = logging.getLogger("aether.chat")


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
    result = await loop.run_in_executor(
        None,
        lambda: llm_router.chat_completion(
            messages, tools=get_openai_tool_schemas(), session_id=session_id
        ),
    )
    reply = result.get("content", "") or "I could not produce a response."
    await loop.run_in_executor(
        None, lambda: session_manager.commit_turn(session_id, prompt, reply)
    )
    return {**result, "reply": reply}
