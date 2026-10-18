"""
Aether Clock Scheduler & Reverse-Trigger Loop
Persistent task scheduling via APScheduler backed by SQLite.
When a scheduled trigger fires, wakes the orchestrator callback directly.
"""

import uuid
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from ..db.database import get_db

# Initialize BackgroundScheduler
scheduler = BackgroundScheduler()
if not scheduler.running:
    scheduler.start()

# Callback injected by main.py/orchestrator
_wake_callback: Optional[Callable[..., Any]] = None


def register_wake_callback(fn: Callable[..., Any]) -> None:
    """Registers the async/sync callback that wakes up LLM and TTS."""
    global _wake_callback
    _wake_callback = fn


def _trigger_task(task_id: str, session_id: str, prompt: str) -> None:
    """Trigger handler executed by APScheduler thread when time hits."""
    now_str = datetime.now().strftime("%H:%M:%S")
    event_msg = f"[CLOCK ALARM TRIGGERED AT {now_str}]: Execute task: {prompt}"

    # Mark non-recurring task as completed in SQLite
    conn = get_db()
    conn.execute(
        "UPDATE scheduled_tasks SET status = 'completed' WHERE id = ? AND is_recurring = 0",
        (task_id,)
    )
    conn.commit()
    conn.close()

    if _wake_callback:
        _wake_callback(session_id=session_id, system_event=event_msg, task_id=task_id)


def schedule_one_time_task(session_id: str, run_at_iso: str, task_prompt: str) -> str:
    """
    Schedules an exact future date/time task for the AI to execute.
    run_at_iso: ISO 8601 string, e.g. '2026-10-19T09:00:00'
    task_prompt: Instruction for the AI when woken up.
    """
    task_id = str(uuid.uuid4())[:8]
    run_dt = datetime.fromisoformat(run_at_iso)

    scheduler.add_job(
        _trigger_task,
        trigger=DateTrigger(run_date=run_dt),
        args=[task_id, session_id, task_prompt],
        id=task_id,
        replace_existing=True
    )

    conn = get_db()
    conn.execute(
        """INSERT INTO scheduled_tasks (id, session_id, cron_or_iso, prompt_to_execute, is_recurring, status)
           VALUES (?, ?, ?, ?, 0, 'active')""",
        (task_id, session_id, run_at_iso, task_prompt)
    )
    conn.commit()
    conn.close()
    return f"Scheduled task '{task_prompt}' for {run_at_iso} (ID: {task_id})"


def schedule_recurring_routine(session_id: str, hour: int, minute: int, routine_prompt: str) -> str:
    """
    Schedules a daily recurring routine (e.g. every morning at 09:00 AM).
    """
    task_id = str(uuid.uuid4())[:8]
    time_label = f"{hour:02d}:{minute:02d} daily"

    scheduler.add_job(
        _trigger_task,
        trigger=CronTrigger(hour=hour, minute=minute),
        args=[task_id, session_id, routine_prompt],
        id=task_id,
        replace_existing=True
    )

    conn = get_db()
    conn.execute(
        """INSERT INTO scheduled_tasks (id, session_id, cron_or_iso, prompt_to_execute, is_recurring, status)
           VALUES (?, ?, ?, ?, 1, 'active')""",
        (task_id, session_id, time_label, routine_prompt)
    )
    conn.commit()
    conn.close()
    return f"Recurring routine scheduled daily at {time_label} (ID: {task_id})"


def list_scheduled_tasks(session_id: str = "") -> List[Dict[str, Any]]:
    """Returns active scheduled tasks from the database."""
    conn = get_db()
    cur = conn.cursor()
    if session_id:
        cur.execute(
            "SELECT * FROM scheduled_tasks WHERE session_id = ? AND status = 'active' ORDER BY rowid DESC",
            (session_id,)
        )
    else:
        cur.execute(
            "SELECT * FROM scheduled_tasks WHERE status = 'active' ORDER BY rowid DESC"
        )
    tasks = [dict(r) for r in cur.fetchall()]
    conn.close()
    return tasks


def cancel_scheduled_task(task_id: str) -> bool:
    """Cancels a scheduled job and marks it cancelled in the database."""
    if scheduler.get_job(task_id):
        scheduler.remove_job(task_id)

    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE scheduled_tasks SET status = 'cancelled' WHERE id = ?", (task_id,))
    conn.commit()
    affected = cur.rowcount > 0
    conn.close()
    return affected
