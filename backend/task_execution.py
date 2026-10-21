"""
Scheduled AI task execution.

Runs in the main asyncio loop after APScheduler fires. Results are persisted in
the linked session, but a background run never switches the user's active chat.
"""

import asyncio
import logging
from typing import Any

from .ai.errors import ModelNotConfiguredError
from .chat_execution import execute_chat_turn
from .db.sessions import session_manager
from .mcp_tools.clock_scheduler import mark_task_outcome
from .ws_manager import ws_manager

logger = logging.getLogger("aether.task_execution")


def _session_title(session_id: str) -> str:
    from .db.database import get_db

    conn = get_db()
    row = conn.execute("SELECT title FROM sessions WHERE id = ?", (session_id,)).fetchone()
    conn.close()
    return row["title"] if row else "New Session"


def _notification(prompt: str, response: str) -> str:
    text = " ".join((response or "").split())
    if len(text) > 240:
        text = f"{text[:237]}..."
    return text or "Scheduled task finished."


async def run_scheduled_task(
    session_id: str, task_id: str, prompt: str, kind: str = "task"
) -> None:
    """Executes a scheduled AI prompt and broadcasts a quiet completion notice."""
    if kind == "alarm":
        return

    try:
        result = await execute_chat_turn(session_id, prompt)
    except ModelNotConfiguredError as exc:
        mark_task_outcome(task_id, False)
        await _finish(session_id, task_id, prompt, f"Scheduled task failed: {exc}", False)
        return
    except Exception as exc:
        logger.exception("Scheduled task %s failed", task_id)
        mark_task_outcome(task_id, False)
        await _finish(
            session_id,
            task_id,
            prompt,
            f"Scheduled task failed: {exc}",
            False,
        )
        return

    mark_task_outcome(task_id, True)
    await _finish(
        session_id,
        task_id,
        prompt,
        result.get("reply", ""),
        True,
        result,
    )


async def _finish(
    session_id: str,
    task_id: str,
    prompt: str,
    message: str,
    success: bool,
    result: dict[str, Any] | None = None,
) -> None:
    # Only the already-active session gets live history updates. Results for
    # other sessions are still persisted by execute_chat_turn and appear when
    # the user opens that chat later.
    if success and session_manager.active_session_id == session_id:
        await ws_manager.broadcast(
            "SESSION_UPDATED",
            {
                "session_id": session_id,
                "title": _session_title(session_id),
                "turn": {"user": prompt, "ai": message},
                "reasoning": (result or {}).get("reasoning", ""),
                "tools_used": (result or {}).get("tool_calls_executed", []),
            },
        )

    title = prompt if len(prompt) <= 72 else f"{prompt[:69]}..."
    await ws_manager.broadcast(
        "CLOCK_TRIGGER",
        {
            "kind": "task",
            "task_id": task_id,
            "title": "Scheduled task finished" if success else "Scheduled task failed",
            "event": _notification(prompt, message),
        },
    )
    try:
        from .task_events import broadcast_tasks

        await broadcast_tasks()
    except Exception:
        logger.debug("Task list refresh skipped", exc_info=True)
