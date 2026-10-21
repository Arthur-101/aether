"""OpenAI/GGUF tool schemas for Clock & Tasks management."""

from typing import Any, Dict, List


def get_clock_tool_schemas() -> List[Dict[str, Any]]:
    """Returns task/alarm schemas kept separate from the media/doc registry."""
    return [
        {
            "type": "function",
            "function": {
                "name": "schedule_one_time_task",
                "description": "Schedule a future AI task at an exact date/time.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "session_id": {
                            "type": "string",
                            "description": "Current session ID (injected automatically).",
                        },
                        "run_at_iso": {
                            "type": "string",
                            "description": "Future ISO 8601 date/time, e.g. 2026-10-19T09:00:00.",
                        },
                        "task_prompt": {
                            "type": "string",
                            "description": "Instruction Aether should execute when due.",
                        },
                    },
                    "required": ["session_id", "run_at_iso", "task_prompt"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "schedule_recurring_routine",
                "description": "Schedule a daily recurring AI routine at an hour/minute.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "session_id": {
                            "type": "string",
                            "description": "Current session ID (injected automatically).",
                        },
                        "hour": {"type": "integer", "description": "Hour 0-23."},
                        "minute": {"type": "integer", "description": "Minute 0-59."},
                        "routine_prompt": {
                            "type": "string",
                            "description": "Routine instruction to execute.",
                        },
                    },
                    "required": ["session_id", "hour", "minute", "routine_prompt"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "schedule_custom_task",
                "description": "Schedule a daily AI task that stops after an end date/time.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "session_id": {
                            "type": "string",
                            "description": "Current session ID (injected automatically).",
                        },
                        "start_at_iso": {
                            "type": "string",
                            "description": "First run ISO 8601 date/time.",
                        },
                        "end_at_iso": {
                            "type": "string",
                            "description": "Last boundary ISO 8601 date/time.",
                        },
                        "task_prompt": {
                            "type": "string",
                            "description": "Task instruction to execute.",
                        },
                    },
                    "required": [
                        "session_id",
                        "start_at_iso",
                        "end_at_iso",
                        "task_prompt",
                    ],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "list_scheduled_tasks",
                "description": "List active and paused tasks and alarms with their IDs.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "session_id": {
                            "type": "string",
                            "description": "Optional session ID filter. Omit for all tasks.",
                        }
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "update_scheduled_task",
                "description": "Edit or reschedule an existing task by ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_id": {"type": "string", "description": "Task ID."},
                        "task_prompt": {
                            "type": "string",
                            "description": "Replacement instruction, if changing.",
                        },
                        "schedule_type": {
                            "type": "string",
                            "enum": ["once", "daily", "custom"],
                            "description": "New schedule type.",
                        },
                        "run_at_iso": {
                            "type": "string",
                            "description": "New one-time ISO date/time.",
                        },
                        "hour": {"type": "integer", "description": "New hour 0-23."},
                        "minute": {"type": "integer", "description": "New minute 0-59."},
                        "start_at_iso": {
                            "type": "string",
                            "description": "New custom range start ISO date/time.",
                        },
                        "end_at_iso": {
                            "type": "string",
                            "description": "New custom range end ISO date/time.",
                        },
                    },
                    "required": ["task_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "cancel_scheduled_task",
                "description": "Cancel/delete an active or paused task or alarm by ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_id": {"type": "string", "description": "Task ID."}
                    },
                    "required": ["task_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "complete_scheduled_task",
                "description": "Mark a task complete by ID (stops future runs).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_id": {"type": "string", "description": "Task ID."}
                    },
                    "required": ["task_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "pause_scheduled_task",
                "description": "Pause a recurring task by ID without deleting it.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_id": {"type": "string", "description": "Task ID."}
                    },
                    "required": ["task_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "resume_scheduled_task",
                "description": "Resume a paused recurring task by ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_id": {"type": "string", "description": "Task ID."}
                    },
                    "required": ["task_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "schedule_alarm",
                "description": "Create a one-time or daily alarm with a label.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_prompt": {
                            "type": "string",
                            "description": "Alarm label or reminder text.",
                        },
                        "run_at_iso": {
                            "type": "string",
                            "description": "One-time alarm ISO date/time.",
                        },
                        "hour": {
                            "type": "integer",
                            "description": "Daily alarm hour 0-23.",
                        },
                        "minute": {
                            "type": "integer",
                            "description": "Daily alarm minute 0-59.",
                        },
                    },
                    "required": ["task_prompt"],
                },
            },
        },
    ]
