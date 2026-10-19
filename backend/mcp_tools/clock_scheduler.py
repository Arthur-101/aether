"""
Aether Clock Scheduler & Reverse-Trigger Loop
Persistent task scheduling via APScheduler backed by SQLite.
When a scheduled trigger fires, wakes the orchestrator callback directly.
"""

import logging
import re
import uuid
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger

from ..db.database import get_db

logger = logging.getLogger("aether.scheduler")

scheduler = BackgroundScheduler()
if not scheduler.running:
    scheduler.start()

_wake_callback: Optional[Callable[..., Any]] = None
_LOCAL_FORMAT = "%A, %B %d, %Y at %I:%M %p"


def register_wake_callback(fn: Callable[..., Any]) -> None:
    """Registers the async/sync callback that wakes up LLM and TTS."""
    global _wake_callback
    _wake_callback = fn


def _local_now() -> datetime:
    return datetime.now()


def _format_local(value: datetime) -> str:
    return value.strftime(_LOCAL_FORMAT)


def _clean_prompt(task_prompt: str) -> str:
    prompt = (task_prompt or "").strip()
    if not prompt:
        raise ValueError("Task instruction cannot be empty.")
    return prompt


def _parse_time_label(label: str) -> tuple[int, int]:
    match = re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s+daily\s*", label or "", re.I)
    if not match:
        raise ValueError("Stored recurring task has an invalid time.")
    hour, minute = int(match.group(1)), int(match.group(2))
    _validate_hour_minute(hour, minute)
    return hour, minute


def _validate_hour_minute(hour: int, minute: int) -> tuple[int, int]:
    try:
        hour, minute = int(hour), int(minute)
    except (TypeError, ValueError) as exc:
        raise ValueError("Hour and minute must be numbers.") from exc
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise ValueError("Hour must be 0-23 and minute must be 0-59.")
    return hour, minute


def _coerce_local(run_at_iso: str) -> datetime:
    value = (run_at_iso or "").strip()
    if not value:
        raise ValueError("A date and time are required.")
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    try:
        run_dt = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Use an ISO date/time such as 2026-10-19T22:00:00.") from exc
    if run_dt.tzinfo is not None:
        run_dt = run_dt.astimezone().replace(tzinfo=None)
    return run_dt


def _future_run_at(run_at_iso: str) -> datetime:
    run_dt = _coerce_local(run_at_iso)
    now = _local_now()
    if run_dt <= now:
        raise ValueError(
            f"That time is in the past. Current local time is {_format_local(now)}. "
            "Choose a future date and time."
        )
    return run_dt


def _add_one_time_job(
    task_id: str, session_id: str, run_dt: datetime, prompt: str
) -> None:
    scheduler.add_job(
        _trigger_task,
        trigger=DateTrigger(run_date=run_dt),
        args=[task_id, session_id, prompt],
        id=task_id,
        replace_existing=True,
        misfire_grace_time=60,
    )


def _add_daily_job(task_id: str, session_id: str, hour: int, minute: int, prompt: str) -> None:
    scheduler.add_job(
        _trigger_task,
        trigger=CronTrigger(hour=hour, minute=minute),
        args=[task_id, session_id, prompt],
        id=task_id,
        replace_existing=True,
        misfire_grace_time=60,
    )


def _serialize(row: Any) -> Dict[str, Any]:
    item = dict(row)
    item["is_recurring"] = bool(item.get("is_recurring"))
    item["run_at_iso"] = None
    item["hour"] = None
    item["minute"] = None
    try:
        if item["is_recurring"]:
            item["hour"], item["minute"] = _parse_time_label(item["cron_or_iso"])
        else:
            item["run_at_iso"] = item["cron_or_iso"]
    except ValueError:
        item["run_at_iso"] = item["cron_or_iso"]
    try:
        next_run = scheduler.get_job(item["id"]).next_run_time
        item["next_run_at"] = next_run.isoformat() if next_run else None
    except Exception:
        item["next_run_at"] = None
    return item


def _fetch_task(task_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    row = conn.execute(
        """SELECT t.*, COALESCE(s.title, 'Unknown session') AS session_title
           FROM scheduled_tasks t LEFT JOIN sessions s ON s.id = t.session_id
           WHERE t.id = ? AND t.status = 'active'""",
        (task_id,),
    ).fetchone()
    conn.close()
    return _serialize(row) if row else None


def _set_status(task_id: str, status: str) -> None:
    conn = get_db()
    conn.execute("UPDATE scheduled_tasks SET status = ? WHERE id = ?", (status, task_id))
    conn.commit()
    conn.close()


def _trigger_task(task_id: str, session_id: str, prompt: str) -> None:
    """Triggers once for a one-time task and daily for a recurring task."""
    conn = get_db()
    row = conn.execute(
        "SELECT status, is_recurring FROM scheduled_tasks WHERE id = ?", (task_id,)
    ).fetchone()
    if not row or row["status"] != "active":
        conn.close()
        return
    if not row["is_recurring"]:
        conn.execute(
            "UPDATE scheduled_tasks SET status = 'completed' WHERE id = ?", (task_id,)
        )
        conn.commit()
    conn.close()

    now_str = _format_local(_local_now())
    event_msg = f"[CLOCK ALARM TRIGGERED AT {now_str}]: Execute task: {prompt}"
    if _wake_callback:
        try:
            _wake_callback(session_id=session_id, system_event=event_msg, task_id=task_id)
        except Exception:
            logger.exception("Wake callback failed for task %s", task_id)


def create_one_time_task(
    session_id: str, run_at_iso: str, task_prompt: str
) -> Dict[str, Any]:
    """Creates a future one-time task and schedules its APScheduler job."""
    if not (session_id or "").strip():
        raise ValueError("No active session is available for this task.")
    prompt = _clean_prompt(task_prompt)
    run_dt = _future_run_at(run_at_iso)
    task_id = str(uuid.uuid4())[:8]
    _add_one_time_job(task_id, session_id, run_dt, prompt)

    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO scheduled_tasks
               (id, session_id, cron_or_iso, prompt_to_execute, is_recurring, status)
               VALUES (?, ?, ?, ?, 0, 'active')""",
            (task_id, session_id, run_dt.isoformat(timespec="seconds"), prompt),
        )
        conn.commit()
    except Exception:
        scheduler.remove_job(task_id)
        raise
    finally:
        conn.close()
    return _fetch_task(task_id) or {}


def schedule_one_time_task(session_id: str, run_at_iso: str, task_prompt: str) -> str:
    """LLM tool wrapper: schedules an exact future task."""
    task = create_one_time_task(session_id, run_at_iso, task_prompt)
    run_dt = _coerce_local(task["cron_or_iso"])
    return (
        f"Scheduled '{task['prompt_to_execute']}' for {_format_local(run_dt)} "
        f"(ID: {task['id']})."
    )


def create_daily_task(
    session_id: str, hour: int, minute: int, routine_prompt: str
) -> Dict[str, Any]:
    """Creates a daily recurring routine and schedules its APScheduler job."""
    if not (session_id or "").strip():
        raise ValueError("No active session is available for this task.")
    prompt = _clean_prompt(routine_prompt)
    hour, minute = _validate_hour_minute(hour, minute)
    task_id = str(uuid.uuid4())[:8]
    _add_daily_job(task_id, session_id, hour, minute, prompt)
    time_label = f"{hour:02d}:{minute:02d} daily"

    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO scheduled_tasks
               (id, session_id, cron_or_iso, prompt_to_execute, is_recurring, status)
               VALUES (?, ?, ?, ?, 1, 'active')""",
            (task_id, session_id, time_label, prompt),
        )
        conn.commit()
    except Exception:
        scheduler.remove_job(task_id)
        raise
    finally:
        conn.close()
    return _fetch_task(task_id) or {}


def schedule_recurring_routine(
    session_id: str, hour: int, minute: int, routine_prompt: str
) -> str:
    """LLM tool wrapper: schedules a daily recurring routine."""
    task = create_daily_task(session_id, hour, minute, routine_prompt)
    return (
        f"Scheduled daily '{task['prompt_to_execute']}' at {hour:02d}:{minute:02d} "
        f"(ID: {task['id']})."
    )


def list_scheduled_tasks(session_id: str = "") -> List[Dict[str, Any]]:
    """Returns active tasks with their session titles."""
    conn = get_db()
    where = "WHERE t.status = 'active'"
    params: tuple = ()
    if session_id:
        where += " AND t.session_id = ?"
        params = (session_id,)
    rows = conn.execute(
        f"""SELECT t.*, COALESCE(s.title, 'Unknown session') AS session_title
            FROM scheduled_tasks t LEFT JOIN sessions s ON s.id = t.session_id
            {where} ORDER BY t.rowid DESC""",
        params,
    ).fetchall()
    conn.close()
    return [_serialize(row) for row in rows]


def update_scheduled_task(
    task_id: str,
    task_prompt: Optional[str] = None,
    is_recurring: Optional[bool] = None,
    run_at_iso: Optional[str] = None,
    hour: Optional[int] = None,
    minute: Optional[int] = None,
) -> Dict[str, Any]:
    """Edits a task, replacing its scheduled job immediately."""
    existing = _fetch_task(task_id)
    if not existing:
        raise ValueError("Task not found or no longer active.")

    prompt = _clean_prompt(task_prompt or existing["prompt_to_execute"])
    recurring = existing["is_recurring"] if is_recurring is None else bool(is_recurring)
    if recurring:
        if hour is None or minute is None:
            hour, minute = _parse_time_label(existing["cron_or_iso"])
        hour, minute = _validate_hour_minute(hour, minute)
        _add_daily_job(task_id, existing["session_id"], hour, minute, prompt)
        schedule_value = f"{hour:02d}:{minute:02d} daily"
    else:
        run_dt = _future_run_at(run_at_iso or existing["cron_or_iso"] or "")
        _add_one_time_job(task_id, existing["session_id"], run_dt, prompt)
        schedule_value = run_dt.isoformat(timespec="seconds")

    conn = get_db()
    try:
        conn.execute(
            """UPDATE scheduled_tasks
               SET cron_or_iso = ?, prompt_to_execute = ?, is_recurring = ?
               WHERE id = ? AND status = 'active'""",
            (schedule_value, prompt, int(recurring), task_id),
        )
        conn.commit()
    finally:
        conn.close()
    return _fetch_task(task_id) or {}


def cancel_scheduled_task(task_id: str) -> bool:
    """Cancels a scheduled job and marks it cancelled in the database."""
    if scheduler.get_job(task_id):
        scheduler.remove_job(task_id)
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "UPDATE scheduled_tasks SET status = 'cancelled' WHERE id = ? AND status = 'active'",
        (task_id,),
    )
    conn.commit()
    affected = cur.rowcount > 0
    conn.close()
    return affected


def cancel_tasks_for_session(session_id: str) -> List[str]:
    """Removes every active job belonging to a session (used on deletion)."""
    if not session_id:
        return []
    conn = get_db()
    rows = conn.execute(
        "SELECT id FROM scheduled_tasks WHERE session_id = ? AND status = 'active'",
        (session_id,),
    ).fetchall()
    ids = [row["id"] for row in rows]
    for task_id in ids:
        if scheduler.get_job(task_id):
            scheduler.remove_job(task_id)
    if ids:
        conn.execute(
            "UPDATE scheduled_tasks SET status = 'cancelled' WHERE session_id = ? AND status = 'active'",
            (session_id,),
        )
        conn.commit()
    conn.close()
    return ids


def restore_scheduled_tasks() -> Dict[str, int]:
    """Rehydrates persisted active jobs after a backend restart."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM scheduled_tasks WHERE status = 'active'"
    ).fetchall()
    conn.close()

    restored, missed = 0, 0
    now = _local_now()
    for row in rows:
        try:
            if row["is_recurring"]:
                hour, minute = _parse_time_label(row["cron_or_iso"])
                if not scheduler.get_job(row["id"]):
                    _add_daily_job(
                        row["id"], row["session_id"], hour, minute, row["prompt_to_execute"]
                    )
            else:
                run_dt = _coerce_local(row["cron_or_iso"])
                if run_dt <= now:
                    _set_status(row["id"], "missed")
                    missed += 1
                    continue
                if not scheduler.get_job(row["id"]):
                    _add_one_time_job(
                        row["id"], row["session_id"], run_dt, row["prompt_to_execute"]
                    )
            restored += 1
        except Exception:
            logger.exception("Could not restore scheduled task %s", row["id"])
            _set_status(row["id"], "missed")
            missed += 1
    return {"restored": restored, "missed": missed}
