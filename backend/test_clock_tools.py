"""Clock tool schema registry checks."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.mcp_tools.server import (
    SESSION_SCOPED_TOOLS,
    TOOL_DISPATCH,
    get_openai_tool_schemas,
)

CLOCK_TOOLS = {
    "schedule_one_time_task",
    "schedule_recurring_routine",
    "schedule_custom_task",
    "list_scheduled_tasks",
    "update_scheduled_task",
    "cancel_scheduled_task",
    "complete_scheduled_task",
    "pause_scheduled_task",
    "resume_scheduled_task",
    "schedule_alarm",
}


def test_clock_schemas_are_registered_exactly_once():
    names = [item["function"]["name"] for item in get_openai_tool_schemas()]
    assert len(names) == len(set(names))
    assert CLOCK_TOOLS <= set(names)
    assert CLOCK_TOOLS <= set(TOOL_DISPATCH)


def test_only_creating_tools_are_session_scoped():
    assert SESSION_SCOPED_TOOLS == {
        "search_dropped_file",
        "schedule_one_time_task",
        "schedule_recurring_routine",
        "schedule_custom_task",
    }
    assert "schedule_alarm" not in SESSION_SCOPED_TOOLS
