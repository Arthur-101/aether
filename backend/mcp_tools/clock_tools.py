"""MCP-facing clock tools that wrap the scheduler lifecycle functions."""

import json
from typing import Optional

from .clock_scheduler import (
    ALARM_SESSION_ID,
    cancel_scheduled_task,
    coerce_local,
    complete_scheduled_task,
    create_daily_task,
    create_one_time_task,
    format_local,
    list_scheduled_tasks,
    pause_scheduled_task,
    resume_scheduled_task,
    update_scheduled_task,
)


def schedule_alarm(
    run_at_iso: str = "",
    task_prompt: str = "Alarm",
    hour: Optional[int] = None,
    minute: Optional[int] = None,
) -> str:
    """Creates a one-time or daily alarm in the internal alarm session."""
    prompt = (task_prompt or "").strip() or "Alarm"
    if hour is not None and minute is not None:
        task = create_daily_task(
            ALARM_SESSION_ID, int(hour), int(minute), prompt, kind="alarm"
        )
        return (
            f"Set daily alarm '{prompt}' for {int(hour):02d}:{int(minute):02d} "
            f"(ID: {task['id']})."
        )
    if not (run_at_iso or "").strip():
        raise ValueError("Provide run_at_iso or both hour and minute for an alarm.")
    task = create_one_time_task(ALARM_SESSION_ID, run_at_iso, prompt, kind="alarm")
    return (
        f"Set alarm '{prompt}' for {format_local(coerce_local(task['cron_or_iso']))} "
        f"(ID: {task['id']})."
    )


def list_tasks_tool(session_id: str = "") -> str:
    """MCP tool: serializes active and paused tasks for the model."""
    return json.dumps(list_scheduled_tasks(session_id), ensure_ascii=False)


def update_task_tool(
    task_id: str,
    task_prompt: Optional[str] = None,
    schedule_type: Optional[str] = None,
    run_at_iso: Optional[str] = None,
    hour: Optional[int] = None,
    minute: Optional[int] = None,
    start_at_iso: Optional[str] = None,
    end_at_iso: Optional[str] = None,
) -> str:
    """MCP tool: edits/reschedules an existing task."""
    task = update_scheduled_task(
        task_id,
        task_prompt=task_prompt,
        schedule_type=schedule_type,
        run_at_iso=run_at_iso,
        hour=hour,
        minute=minute,
        start_at_iso=start_at_iso,
        end_at_iso=end_at_iso,
    )
    return f"Updated task '{task['prompt_to_execute']}' (ID: {task['id']})."


def cancel_task_tool(task_id: str) -> str:
    return (
        f"Cancelled task {task_id}."
        if cancel_scheduled_task(task_id)
        else f"Task {task_id} was not found."
    )


def complete_task_tool(task_id: str) -> str:
    task = complete_scheduled_task(task_id)
    return f"Completed task '{task['prompt_to_execute']}' (ID: {task['id']})."


def pause_task_tool(task_id: str) -> str:
    task = pause_scheduled_task(task_id)
    return f"Paused recurring task '{task['prompt_to_execute']}' (ID: {task['id']})."


def resume_task_tool(task_id: str) -> str:
    task = resume_scheduled_task(task_id)
    return f"Resumed recurring task '{task['prompt_to_execute']}' (ID: {task['id']})."
