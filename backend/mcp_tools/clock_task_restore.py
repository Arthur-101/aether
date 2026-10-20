"""
Restores persisted scheduled tasks and expires finished custom ranges.
"""

import logging
from typing import Any, Dict

from . import clock_engine as engine
from . import clock_task_repository as repo
from .clock_task_utils import coerce_local, local_now, parse_time_label

logger = logging.getLogger("aether.scheduler")


def expire_finished_custom() -> int:
    """Marks active custom ranges completed once their end time passes."""
    now = local_now()
    expired = 0
    for row in repo.all_active_tasks():
        if row.get("schedule_type") != "custom" or not row.get("end_at_iso"):
            continue
        try:
            end_dt = coerce_local(row["end_at_iso"])
        except ValueError:
            continue
        if end_dt <= now:
            repo.set_status(row["id"], "completed")
            engine.remove_job(row["id"])
            expired += 1
    return expired


def _restore_row(row: Dict[str, Any], now: Any) -> str:
    """Restores one task and returns restored/missed/expired."""
    task_id = row["id"]
    schedule_type = row.get("schedule_type") or (
        "daily" if row["is_recurring"] else "once"
    )
    if schedule_type == "custom":
        end_dt = coerce_local(row.get("end_at_iso") or "")
        if end_dt <= now:
            repo.set_status(task_id, "completed")
            return "expired"
        start_dt = coerce_local(row.get("start_at_iso") or "")
        if not engine.has_job(task_id):
            engine.add_custom_job(
                task_id, row["session_id"], start_dt, end_dt, row["prompt_to_execute"]
            )
        return "restored"

    if schedule_type == "daily" or row["is_recurring"]:
        hour, minute = parse_time_label(row["cron_or_iso"])
        if not engine.has_job(task_id):
            engine.add_daily_job(
                task_id, row["session_id"], hour, minute, row["prompt_to_execute"]
            )
        return "restored"

    run_dt = coerce_local(row["cron_or_iso"])
    if run_dt <= now:
        repo.set_status(task_id, "missed")
        return "missed"
    if not engine.has_job(task_id):
        engine.add_one_time_job(
            task_id, row["session_id"], run_dt, row["prompt_to_execute"]
        )
    return "restored"


def restore_scheduled_tasks() -> Dict[str, int]:
    """Rehydrates persisted active jobs after a backend restart."""
    counts = {"restored": 0, "missed": 0, "expired": 0}
    now = local_now()
    for row in repo.all_active_tasks():
        try:
            outcome = _restore_row(row, now)
            counts[outcome] += 1
        except Exception:
            logger.exception("Could not restore scheduled task %s", row.get("id"))
            repo.set_status(row["id"], "missed")
            counts["missed"] += 1
    return counts
