"""
APScheduler engine primitives for persistent Aether tasks.
"""

import logging
from datetime import datetime
from typing import Any, Callable, Dict, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger

from . import clock_task_repository as repo
from .clock_task_utils import format_local, local_now

logger = logging.getLogger("aether.scheduler")

scheduler = BackgroundScheduler()
if not scheduler.running:
    scheduler.start()

_wake_callback: Optional[Callable[..., Any]] = None


def register_wake_callback(fn: Callable[..., Any]) -> None:
    """Registers the callback that wakes the LLM and TTS."""
    global _wake_callback
    _wake_callback = fn


def next_run_iso(task_id: str) -> Optional[str]:
    try:
        job = scheduler.get_job(task_id)
        next_run = job.next_run_time if job else None
        return next_run.isoformat() if next_run else None
    except Exception:
        return None


def has_job(task_id: str) -> bool:
    return scheduler.get_job(task_id) is not None


def remove_job(task_id: str) -> None:
    if scheduler.get_job(task_id):
        scheduler.remove_job(task_id)


def add_one_time_job(
    task_id: str, session_id: str, run_dt: datetime, prompt: str
) -> None:
    scheduler.add_job(
        trigger_task,
        trigger=DateTrigger(run_date=run_dt),
        args=[task_id, session_id, prompt],
        id=task_id,
        replace_existing=True,
        misfire_grace_time=60,
    )


def add_daily_job(
    task_id: str,
    session_id: str,
    hour: int,
    minute: int,
    prompt: str,
    start_dt: Optional[datetime] = None,
    end_dt: Optional[datetime] = None,
) -> None:
    """Adds a daily job, optionally bounded to a custom date/time range."""
    scheduler.add_job(
        trigger_task,
        trigger=CronTrigger(
            hour=hour,
            minute=minute,
            start_date=start_dt,
            end_date=end_dt,
        ),
        args=[task_id, session_id, prompt],
        id=task_id,
        replace_existing=True,
        misfire_grace_time=60,
    )


def add_custom_job(
    task_id: str,
    session_id: str,
    start_dt: datetime,
    end_dt: datetime,
    prompt: str,
) -> None:
    add_daily_job(
        task_id,
        session_id,
        start_dt.hour,
        start_dt.minute,
        prompt,
        start_dt=start_dt,
        end_dt=end_dt,
    )


def trigger_task(task_id: str, session_id: str, prompt: str) -> None:
    """Triggers once for a one-time task and daily for recurring tasks."""
    row = repo.fetch_active_task(task_id)
    if not row:
        return
    if not row["is_recurring"]:
        repo.set_status(task_id, "completed")

    now_str = format_local(local_now())
    event_msg = f"[CLOCK ALARM TRIGGERED AT {now_str}]: Execute task: {prompt}"
    if _wake_callback:
        try:
            _wake_callback(
                session_id=session_id,
                system_event=event_msg,
                task_id=task_id,
                kind=row.get("kind") or "task",
                prompt=prompt,
            )
        except Exception:
            logger.exception("Wake callback failed for task %s", task_id)
