"""Background scheduled-task execution and quiet-notification tests."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import task_execution


def test_background_task_saves_result_and_notifies_without_switching(monkeypatch):
    calls = {"marked": [], "broadcasts": []}

    async def fake_turn(session_id, prompt):
        calls["turn"] = (session_id, prompt)
        return {"reply": "Report is ready.", "reasoning": "step", "tool_calls_executed": []}

    def fake_mark(task_id, success):
        calls["marked"].append((task_id, success))

    async def fake_broadcast(event_type, payload):
        calls["broadcasts"].append((event_type, payload))

    monkeypatch.setattr(task_execution, "execute_chat_turn", fake_turn)
    monkeypatch.setattr(task_execution, "mark_task_outcome", fake_mark)
    monkeypatch.setattr(task_execution.ws_manager, "broadcast", fake_broadcast)
    monkeypatch.setattr(task_execution.session_manager, "active_session_id", "other-session")
    monkeypatch.setattr(task_execution, "_session_title", lambda _sid: "Title")

    asyncio.run(task_execution.run_scheduled_task("session-1", "task-1", "Prepare report"))

    assert calls["turn"] == ("session-1", "Prepare report")
    assert calls["marked"] == [("task-1", True)]
    events = [event for event, _payload in calls["broadcasts"]]
    assert "SESSION_UPDATED" not in events
    trigger = next(payload for event, payload in calls["broadcasts"] if event == "CLOCK_TRIGGER")
    assert trigger["kind"] == "task"
    assert trigger["task_id"] == "task-1"
    assert trigger["event"] == "Report is ready."


def test_background_task_failure_marks_missed(monkeypatch):
    calls = {"marked": [], "broadcasts": []}

    async def fail_turn(_session_id, _prompt):
        raise RuntimeError("model down")

    def fake_mark(task_id, success):
        calls["marked"].append((task_id, success))

    async def fake_broadcast(event_type, payload):
        calls["broadcasts"].append((event_type, payload))

    monkeypatch.setattr(task_execution, "execute_chat_turn", fail_turn)
    monkeypatch.setattr(task_execution, "mark_task_outcome", fake_mark)
    monkeypatch.setattr(task_execution.ws_manager, "broadcast", fake_broadcast)

    asyncio.run(task_execution.run_scheduled_task("session-1", "task-2", "Prepare report"))

    assert calls["marked"] == [("task-2", False)]
    trigger = next(payload for event, payload in calls["broadcasts"] if event == "CLOCK_TRIGGER")
    assert "Failed" in trigger["event"]


def test_alarm_callback_does_not_execute_chat(monkeypatch):
    called = False

    async def fake_turn(_session_id, _prompt):
        nonlocal called
        called = True
        return {"reply": "should not happen"}

    monkeypatch.setattr(task_execution, "execute_chat_turn", fake_turn)

    asyncio.run(task_execution.run_scheduled_task("__aether_alarms__", "alarm-1", "Wake", "alarm"))

    assert called is False
