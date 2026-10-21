"""Shared chat execution and task-list refresh tests."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import chat_execution, event_router, task_events  # noqa: F401


def _prepare(monkeypatch, tool_names):
    committed = []
    monkeypatch.setattr(chat_execution, "load_preferences", lambda: {})
    monkeypatch.setattr(
        chat_execution.session_manager,
        "build_session_context",
        lambda _sid, _prompt: [],
    )
    monkeypatch.setattr(
        chat_execution, "build_assistant_messages", lambda *_args, **_kwargs: []
    )
    monkeypatch.setattr(chat_execution, "image_attachment_paths", lambda _sid: [])
    monkeypatch.setattr(
        chat_execution.session_manager,
        "commit_turn",
        lambda sid, prompt, reply: committed.append((sid, prompt, reply)),
    )
    monkeypatch.setattr(
        chat_execution.llm_router,
        "chat_completion",
        lambda *_args, **_kwargs: {
            "content": "Done.",
            "tool_calls_executed": [{"name": name} for name in tool_names],
        },
    )
    refreshes = []

    async def fake_broadcast():
        refreshes.append(True)

    monkeypatch.setattr(task_events, "broadcast_tasks", fake_broadcast)
    return committed, refreshes


def test_clock_tool_use_refreshes_task_list(monkeypatch):
    committed, refreshes = _prepare(monkeypatch, ["schedule_one_time_task"])

    result = asyncio.run(chat_execution.execute_chat_turn("session-1", "Remind me"))

    assert result["reply"] == "Done."
    assert committed == [("session-1", "Remind me", "Done.")]
    assert refreshes == [True]


def test_plain_chat_does_not_refresh_task_list(monkeypatch):
    _committed, refreshes = _prepare(monkeypatch, [])

    asyncio.run(chat_execution.execute_chat_turn("session-1", "Hello"))

    assert refreshes == []
