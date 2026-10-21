"""
Aether Clock Scheduler Entry Point
Re-exports the task service, lifecycle actions, wake callback, and restore path.
"""

from .clock_engine import register_wake_callback, scheduler
from .clock_task_actions import (
    cancel_scheduled_task,
    cancel_tasks_for_session,
    complete_scheduled_task,
    mark_task_outcome,
    pause_scheduled_task,
    resume_scheduled_task,
)
from .clock_task_restore import expire_finished_custom, restore_scheduled_tasks
from .clock_task_service import (
    ALARM_SESSION_ID,
    create_custom_task,
    create_daily_task,
    create_one_time_task,
    list_scheduled_tasks,
    schedule_custom_task,
    schedule_one_time_task,
    schedule_recurring_routine,
    update_scheduled_task,
)
from .clock_task_utils import coerce_local, format_local

__all__ = [
    "ALARM_SESSION_ID",
    "cancel_scheduled_task",
    "cancel_tasks_for_session",
    "coerce_local",
    "complete_scheduled_task",
    "create_custom_task",
    "create_daily_task",
    "create_one_time_task",
    "expire_finished_custom",
    "format_local",
    "list_scheduled_tasks",
    "mark_task_outcome",
    "pause_scheduled_task",
    "register_wake_callback",
    "restore_scheduled_tasks",
    "resume_scheduled_task",
    "schedule_custom_task",
    "schedule_one_time_task",
    "schedule_recurring_routine",
    "scheduler",
    "update_scheduled_task",
]
