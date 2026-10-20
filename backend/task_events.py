"""
Aether Task Events
WebSocket handlers for listing and manually managing scheduled tasks.
"""

import asyncio
from typing import Any, Dict

from .db.sessions import session_manager
from .event_router import register_handler
from .mcp_tools.clock_scheduler import (
    cancel_scheduled_task,
    create_custom_task,
    create_daily_task,
    create_one_time_task,
    list_scheduled_tasks,
    update_scheduled_task,
)
from .ws_manager import ws_manager

ALARM_SESSION_ID = "__aether_alarms__"


async def broadcast_tasks() -> None:
    """Broadcasts the active task list with session titles."""
    loop = asyncio.get_running_loop()
    tasks = await loop.run_in_executor(None, list_scheduled_tasks)
    await ws_manager.broadcast("TASKS_LIST", {"tasks": tasks})


async def _ensure_active_session(prompt: str) -> str:
    """Returns the active session, creating and broadcasting one if needed."""
    if session_manager.active_session_id:
        return session_manager.active_session_id

    loop = asyncio.get_running_loop()
    session_id = await loop.run_in_executor(
        None, lambda: session_manager.get_or_create_session(prompt)
    )
    data = await loop.run_in_executor(
        None, lambda: session_manager.switch_session(session_id)
    )
    data["attachments"] = []
    await ws_manager.broadcast("SESSION_SWITCHED", data)
    sessions = await loop.run_in_executor(None, session_manager.list_sessions)
    await ws_manager.broadcast("SESSION_LIST", {"sessions": sessions})
    return session_id


async def _handle_list_tasks(payload: Dict[str, Any]) -> None:
    await broadcast_tasks()


async def _handle_create_task(payload: Dict[str, Any]) -> None:
    prompt = str(payload.get("prompt") or "").strip()
    kind = "alarm" if payload.get("kind") == "alarm" else "task"
    if kind == "alarm":
        session_id = ALARM_SESSION_ID
    else:
        session_id = await _ensure_active_session(prompt or "Scheduled task")
    schedule_type = str(
        payload.get("schedule_type")
        or ("daily" if payload.get("is_recurring") else "once")
    )
    loop = asyncio.get_running_loop()
    try:
        if schedule_type == "custom":
            await loop.run_in_executor(
                None,
                lambda: create_custom_task(
                    session_id,
                    str(payload.get("start_at_iso") or ""),
                    str(payload.get("end_at_iso") or ""),
                    prompt,
                    kind,
                ),
            )
        elif schedule_type == "daily":
            await loop.run_in_executor(
                None,
                lambda: create_daily_task(
                    session_id,
                    int(payload.get("hour", 0)),
                    int(payload.get("minute", 0)),
                    prompt,
                    kind,
                ),
            )
        else:
            await loop.run_in_executor(
                None,
                lambda: create_one_time_task(
                    session_id,
                    str(payload.get("run_at_iso") or ""),
                    prompt,
                    kind,
                ),
            )
    except (ValueError, TypeError) as exc:
        await ws_manager.broadcast("ERROR", {"message": str(exc)})
        await broadcast_tasks()
        return
    await broadcast_tasks()


async def _handle_update_task(payload: Dict[str, Any]) -> None:
    task_id = str(payload.get("task_id") or "")
    prompt = str(payload.get("prompt") or "").strip()
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(
            None,
            lambda: update_scheduled_task(
                task_id,
                task_prompt=prompt,
                schedule_type=payload.get("schedule_type"),
                is_recurring=payload.get("is_recurring"),
                run_at_iso=payload.get("run_at_iso"),
                hour=payload.get("hour"),
                minute=payload.get("minute"),
                start_at_iso=payload.get("start_at_iso"),
                end_at_iso=payload.get("end_at_iso"),
            ),
        )
    except (ValueError, TypeError) as exc:
        await ws_manager.broadcast("ERROR", {"message": str(exc)})
        await broadcast_tasks()
        return
    await broadcast_tasks()


async def _handle_delete_task(payload: Dict[str, Any]) -> None:
    task_id = str(payload.get("task_id") or "")
    loop = asyncio.get_running_loop()
    deleted = await loop.run_in_executor(
        None, lambda: cancel_scheduled_task(task_id)
    )
    if not deleted:
        await ws_manager.broadcast("ERROR", {"message": "Task was not found."})
    await broadcast_tasks()


def register_task_events() -> None:
    """Registers task CRUD handlers with the WebSocket event router."""
    register_handler("LIST_TASKS", _handle_list_tasks)
    register_handler("CREATE_TASK", _handle_create_task)
    register_handler("UPDATE_TASK", _handle_update_task)
    register_handler("DELETE_TASK", _handle_delete_task)
