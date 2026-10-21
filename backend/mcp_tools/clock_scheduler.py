"""
Aether Clock Scheduler & Reverse-Trigger Loop
Persistent task scheduling via APScheduler backed by SQLite.
When a scheduled trigger fires, it wakes the orchestrator callback directly.
"""

import logging
import uuid
from typing import Any, Dict, List, Optional

from . import clock_engine as engine
from . import clock_task_repository as repo
from .clock_engine import register_wake_callback, scheduler
from .clock_task_restore import expire_finished_custom, restore_scheduled_tasks
from .clock_task_utils import (
    clean_prompt,
    coerce_local,
    format_local,
    future_run_at,
    local_now,
    parse_time_label,
    serialize_task,
    validate_hour_minute,
    validate_range,
)

logger = logging.getLogger("aether.scheduler")
ALARM_SESSION_ID = "__aether_alarms__"


def _serialize(row: Dict[str, Any]) -> Dict[str, Any]:
    return serialize_task(row, engine.next_run_iso(row.get("id", "")))


def create_one_time_task(
    session_id: str, run_at_iso: str, task_prompt: str, kind: str = "task"
) -> Dict[str, Any]:
    """Creates a future one-time task and schedules its APScheduler job."""
    if not (session_id or "").strip():
        raise ValueError("No active session is available for this task.")
    prompt = clean_prompt(task_prompt)
    run_dt = future_run_at(run_at_iso)
    task_id = str(uuid.uuid4())[:8]
    engine.add_one_time_job(task_id, session_id, run_dt, prompt)
    try:
        repo.insert_task(
            task_id,
            session_id,
            run_dt.isoformat(timespec="seconds"),
            prompt,
            False,
            "once",
            kind=kind,
        )
    except Exception:
        engine.remove_job(task_id)
        raise
    row = repo.fetch_active_task(task_id)
    return _serialize(row) if row else {}


def schedule_one_time_task(session_id: str, run_at_iso: str, task_prompt: str) -> str:
    """LLM tool wrapper: schedules an exact future task."""
    task = create_one_time_task(session_id, run_at_iso, task_prompt)
    run_dt = coerce_local(task["cron_or_iso"])
    return (
        f"Scheduled '{task['prompt_to_execute']}' for {format_local(run_dt)} "
        f"(ID: {task['id']})."
    )


def create_daily_task(
    session_id: str, hour: int, minute: int, routine_prompt: str, kind: str = "task"
) -> Dict[str, Any]:
    """Creates a daily recurring routine and schedules its APScheduler job."""
    if not (session_id or "").strip():
        raise ValueError("No active session is available for this task.")
    prompt = clean_prompt(routine_prompt)
    hour, minute = validate_hour_minute(hour, minute)
    task_id = str(uuid.uuid4())[:8]
    engine.add_daily_job(task_id, session_id, hour, minute, prompt)
    time_label = f"{hour:02d}:{minute:02d} daily"
    try:
        repo.insert_task(
            task_id, session_id, time_label, prompt, True, "daily", kind=kind
        )
    except Exception:
        engine.remove_job(task_id)
        raise
    row = repo.fetch_active_task(task_id)
    return _serialize(row) if row else {}


def schedule_recurring_routine(
    session_id: str, hour: int, minute: int, routine_prompt: str
) -> str:
    """LLM tool wrapper: schedules a daily recurring routine."""
    task = create_daily_task(session_id, hour, minute, routine_prompt)
    return (
        f"Scheduled daily '{task['prompt_to_execute']}' at {hour:02d}:{minute:02d} "
        f"(ID: {task['id']})."
    )


def create_custom_task(
    session_id: str,
    start_at_iso: str,
    end_at_iso: str,
    task_prompt: str,
    kind: str = "task",
) -> Dict[str, Any]:
    """Creates a daily routine bounded by an exact start/end date-time range."""
    if not (session_id or "").strip():
        raise ValueError("No active session is available for this task.")
    prompt = clean_prompt(task_prompt)
    start_dt, end_dt = validate_range(start_at_iso, end_at_iso, True)
    task_id = str(uuid.uuid4())[:8]
    engine.add_custom_job(task_id, session_id, start_dt, end_dt, prompt)
    time_label = f"{start_dt.hour:02d}:{start_dt.minute:02d} daily"
    try:
        repo.insert_task(
            task_id,
            session_id,
            time_label,
            prompt,
            True,
            "custom",
            start_dt.isoformat(timespec="seconds"),
            end_dt.isoformat(timespec="seconds"),
            kind=kind,
        )
    except Exception:
        engine.remove_job(task_id)
        raise
    row = repo.fetch_active_task(task_id)
    return _serialize(row) if row else {}


def schedule_custom_task(
    session_id: str,
    start_at_iso: str,
    end_at_iso: str,
    task_prompt: str,
) -> str:
    """LLM tool wrapper: schedules a daily routine within a date/time range."""
    task = create_custom_task(session_id, start_at_iso, end_at_iso, task_prompt)
    start_dt = coerce_local(task["start_at_iso"])
    end_dt = coerce_local(task["end_at_iso"])
    return (
        f"Scheduled daily '{task['prompt_to_execute']}' from "
        f"{format_local(start_dt)} to {format_local(end_dt)} (ID: {task['id']})."
    )


def list_scheduled_tasks(
    session_id: str = "", include_paused: bool = True
) -> List[Dict[str, Any]]:
    """Returns active (and optionally paused) tasks, expiring finished ranges."""
    expire_finished_custom()
    rows = (
        repo.list_visible_tasks(session_id)
        if include_paused
        else repo.list_active_tasks(session_id)
    )
    return [_serialize(row) for row in rows]


def update_scheduled_task(
    task_id: str,
    task_prompt: Optional[str] = None,
    schedule_type: Optional[str] = None,
    is_recurring: Optional[bool] = None,
    run_at_iso: Optional[str] = None,
    hour: Optional[int] = None,
    minute: Optional[int] = None,
    start_at_iso: Optional[str] = None,
    end_at_iso: Optional[str] = None,
) -> Dict[str, Any]:
    """Edits a task, replacing its scheduled job immediately."""
    existing = repo.fetch_active_task(task_id)
    if not existing:
        raise ValueError("Task not found or no longer active.")

    existing_type = existing.get("schedule_type") or (
        "daily" if existing["is_recurring"] else "once"
    )
    target_type = schedule_type or existing_type
    if schedule_type is None:
        if start_at_iso or end_at_iso:
            target_type = "custom"
        elif is_recurring is not None:
            target_type = "daily" if is_recurring else "once"

    prompt = clean_prompt(task_prompt or existing["prompt_to_execute"])
    recurring = target_type in ("daily", "custom")
    start_value = end_value = None

    if target_type == "custom":
        start_raw = start_at_iso or existing.get("start_at_iso") or ""
        end_raw = end_at_iso or existing.get("end_at_iso") or ""
        start_dt, end_dt = validate_range(start_raw, end_raw, False)
        engine.add_custom_job(task_id, existing["session_id"], start_dt, end_dt, prompt)
        schedule_value = f"{start_dt.hour:02d}:{start_dt.minute:02d} daily"
        start_value = start_dt.isoformat(timespec="seconds")
        end_value = end_dt.isoformat(timespec="seconds")
    elif target_type == "daily":
        if hour is None or minute is None:
            hour, minute = parse_time_label(existing["cron_or_iso"])
        hour, minute = validate_hour_minute(hour, minute)
        engine.add_daily_job(task_id, existing["session_id"], hour, minute, prompt)
        schedule_value = f"{hour:02d}:{minute:02d} daily"
    else:
        candidate = run_at_iso
        if not candidate and existing_type == "once":
            candidate = existing["cron_or_iso"]
        run_dt = future_run_at(candidate or "")
        engine.add_one_time_job(task_id, existing["session_id"], run_dt, prompt)
        schedule_value = run_dt.isoformat(timespec="seconds")

    repo.update_task(
        task_id,
        schedule_value,
        prompt,
        recurring,
        target_type,
        start_value,
        end_value,
    )
    row = repo.fetch_active_task(task_id)
    return _serialize(row) if row else {}


def cancel_scheduled_task(task_id: str) -> bool:
    """Cancels an active/paused job and marks it cancelled in the database."""
    engine.remove_job(task_id)
    return repo.cancel_visible_task(task_id)


def complete_scheduled_task(task_id: str) -> Dict[str, Any]:
    """Marks a task complete and removes its pending scheduler job."""
    task = repo.fetch_visible_task(task_id)
    if not task:
        raise ValueError("Task not found or already finished.")
    engine.remove_job(task_id)
    repo.set_status(task_id, "completed")
    row = repo.fetch_task(task_id)
    return _serialize(row) if row else {}


def pause_scheduled_task(task_id: str) -> Dict[str, Any]:
    """Pauses a recurring task and removes its job without cancelling it."""
    task = repo.fetch_visible_task(task_id)
    if not task:
        raise ValueError("Task not found or no longer active.")
    if not task.get("is_recurring"):
        raise ValueError("Only recurring tasks can be paused.")
    engine.remove_job(task_id)
    repo.set_status(task_id, "paused")
    row = repo.fetch_task(task_id)
    return _serialize(row) if row else {}


def resume_scheduled_task(task_id: str) -> Dict[str, Any]:
    """Re-adds a paused recurring task to the scheduler."""
    task = repo.fetch_task(task_id)
    if not task or task.get("status") != "paused":
        raise ValueError("Paused task not found.")
    schedule_type = task.get("schedule_type") or (
        "daily" if task["is_recurring"] else "once"
    )
    if not task.get("is_recurring"):
        raise ValueError("Only recurring tasks can be resumed.")

    if schedule_type == "custom":
        end_dt = coerce_local(task.get("end_at_iso") or "")
        if end_dt <= local_now():
            repo.set_status(task_id, "completed")
            raise ValueError("That recurring range has already ended.")
        start_dt = coerce_local(task.get("start_at_iso") or "")
        engine.add_custom_job(
            task_id, task["session_id"], start_dt, end_dt, task["prompt_to_execute"]
        )
    else:
        hour, minute = validate_hour_minute(
            *parse_time_label(task["cron_or_iso"])
        )
        engine.add_daily_job(
            task_id,
            task["session_id"],
            hour,
            minute,
            task["prompt_to_execute"],
        )
    repo.set_status(task_id, "active")
    row = repo.fetch_task(task_id)
    return _serialize(row) if row else {}


def mark_task_outcome(task_id: str, success: bool) -> None:
    """Records the final state of a one-time AI task after execution."""
    task = repo.fetch_task(task_id)
    if not task or task.get("is_recurring"):
        return
    if task.get("status") in {"cancelled", "completed", "missed"}:
        return
    repo.set_status(task_id, "completed" if success else "missed")


def cancel_tasks_for_session(session_id: str) -> List[str]:
    """Removes every active job belonging to a session (used on deletion)."""
    if not session_id:
        return []
    ids = repo.cancel_session_tasks(session_id)
    for task_id in ids:
        engine.remove_job(task_id)
    return ids
