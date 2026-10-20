"""
Task validation, formatting, and serialization helpers.
"""

import re
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

LOCAL_FORMAT = "%A, %B %d, %Y at %I:%M %p"


def local_now() -> datetime:
    return datetime.now()


def format_local(value: datetime) -> str:
    return value.strftime(LOCAL_FORMAT)


def clean_prompt(task_prompt: str) -> str:
    prompt = (task_prompt or "").strip()
    if not prompt:
        raise ValueError("Task instruction cannot be empty.")
    return prompt


def parse_time_label(label: str) -> Tuple[int, int]:
    match = re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s+daily\s*", label or "", re.I)
    if not match:
        raise ValueError("Stored recurring task has an invalid time.")
    hour, minute = int(match.group(1)), int(match.group(2))
    return validate_hour_minute(hour, minute)


def validate_hour_minute(hour: int, minute: int) -> Tuple[int, int]:
    try:
        hour, minute = int(hour), int(minute)
    except (TypeError, ValueError) as exc:
        raise ValueError("Hour and minute must be numbers.") from exc
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise ValueError("Hour must be 0-23 and minute must be 0-59.")
    return hour, minute


def coerce_local(run_at_iso: str) -> datetime:
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


def future_run_at(run_at_iso: str) -> datetime:
    run_dt = coerce_local(run_at_iso)
    now = local_now()
    if run_dt <= now:
        raise ValueError(
            f"That time is in the past. Current local time is {format_local(now)}. "
            "Choose a future date and time."
        )
    return run_dt


def validate_range(
    start_at_iso: str, end_at_iso: str, require_future_start: bool
) -> Tuple[datetime, datetime]:
    """Validates a custom daily range; active ranges may start in the past."""
    start_dt = coerce_local(start_at_iso)
    end_dt = coerce_local(end_at_iso)
    now = local_now()
    if require_future_start and start_dt <= now:
        raise ValueError(
            f"The start time must be in the future. Current local time is "
            f"{format_local(now)}."
        )
    if end_dt <= start_dt:
        raise ValueError("The end date/time must be after the start date/time.")
    if end_dt <= now:
        raise ValueError("The end date/time must be in the future.")
    return start_dt, end_dt


def serialize_task(
    row: Dict[str, Any], next_run_at: Optional[str] = None
) -> Dict[str, Any]:
    item = dict(row)
    item["is_recurring"] = bool(item.get("is_recurring"))
    schedule_type = item.get("schedule_type") or (
        "daily" if item["is_recurring"] else "once"
    )
    item["schedule_type"] = schedule_type
    item["run_at_iso"] = None
    item["hour"] = None
    item["minute"] = None
    try:
        if schedule_type in ("daily", "custom"):
            item["hour"], item["minute"] = parse_time_label(item["cron_or_iso"])
        else:
            item["run_at_iso"] = item["cron_or_iso"]
    except ValueError:
        item["run_at_iso"] = item["cron_or_iso"]
    item["start_at_iso"] = item.get("start_at_iso") or None
    item["end_at_iso"] = item.get("end_at_iso") or None
    item["next_run_at"] = next_run_at
    return item
