"""
Clock task lifecycle actions: cancel, complete, pause, resume, and outcomes.
"""

from typing import Any, Dict, List

from . import clock_engine as engine
from . import clock_task_repository as repo
from .clock_task_service import serialize_row
from .clock_task_utils import coerce_local, local_now, parse_time_label, validate_hour_minute

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
    return serialize_row(row) if row else {}


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
    return serialize_row(row) if row else {}


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
    return serialize_row(row) if row else {}


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
