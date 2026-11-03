"""Foreground chat turn reliability: timeouts, concurrency, request ids.

A turn used to be awaited inside the WebSocket receive loop with no ceiling, so
a stalled provider left the Island on "Thinking..." forever with nothing in the
log. These cover the guarantees that replaced that behaviour.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import event_router, task_execution


def _wire(monkeypatch, events, turn):
    """Routes the router at a fake turn and captures every broadcast."""

    async def fake_broadcast(event_type, payload):
        events.append((event_type, payload))

    async def noop(*_args, **_kwargs):
        return None

    from backend import model_events, task_events

    monkeypatch.setattr(event_router, "execute_chat_turn", turn)
    monkeypatch.setattr(event_router.ws_manager, "broadcast", fake_broadcast)
    monkeypatch.setattr(
        event_router.session_manager,
        "get_or_create_session",
        lambda prompt: "session-1",
    )
    monkeypatch.setattr(event_router.session_manager, "session_changed", False)
    monkeypatch.setattr(event_router, "_get_session_title", lambda _sid: "Title")
    monkeypatch.setattr(task_events, "broadcast_tasks", noop)
    monkeypatch.setattr(model_events, "broadcast_model_status", noop)
    event_router._ACTIVE_TURNS.clear()


def test_reply_echoes_request_id(monkeypatch):
    events = []

    async def turn(session_id, prompt, **kwargs):
        return {
            "reply": "ok",
            "attachments": [],
            "tools_used": [],
            "tool_calls_executed": [],
            "reasoning": "",
        }

    _wire(monkeypatch, events, turn)

    async def drive():
        task = await event_router._handle_chat(
            {"text": "hello", "request_id": "req-1"}
        )
        await task

    asyncio.run(drive())

    updated = next(payload for kind, payload in events if kind == "SESSION_UPDATED")
    assert updated["request_id"] == "req-1"
    assert updated["turn"]["ai"] == "ok"


def test_stalled_turn_times_out_and_releases_the_spinner(monkeypatch):
    events = []

    async def turn(session_id, prompt, **kwargs):
        await asyncio.sleep(3600)

    _wire(monkeypatch, events, turn)
    monkeypatch.setattr(event_router, "CHAT_TURN_TIMEOUT_SECONDS", 0.05)

    async def drive():
        task = await event_router._handle_chat(
            {"text": "hello", "request_id": "req-2"}
        )
        await task

    asyncio.run(drive())

    assert any(kind == "ERROR" for kind, _payload in events)
    updated = next(payload for kind, payload in events if kind == "SESSION_UPDATED")
    assert updated["error"] is True
    assert updated["request_id"] == "req-2"
    assert "did not reply" in updated["turn"]["ai"]
    assert event_router._ACTIVE_TURNS == {}


def test_second_prompt_is_rejected_while_a_turn_is_running(monkeypatch):
    events = []
    started = asyncio.Event()

    async def turn(session_id, prompt, **kwargs):
        started.set()
        await asyncio.sleep(3600)

    _wire(monkeypatch, events, turn)
    monkeypatch.setattr(event_router, "CHAT_TURN_TIMEOUT_SECONDS", 5)

    async def drive():
        first = await event_router._handle_chat(
            {"text": "one", "request_id": "a"}
        )
        await asyncio.wait_for(started.wait(), timeout=1)
        second = await event_router._handle_chat(
            {"text": "two", "request_id": "b"}
        )
        assert second is None
        first.cancel()
        try:
            await first
        except asyncio.CancelledError:
            pass

    asyncio.run(drive())

    errors = [payload for kind, payload in events if kind == "ERROR"]
    assert errors
    assert errors[-1]["message"] == event_router.BUSY_MESSAGE
    assert errors[-1]["request_id"] == "b"


def test_scheduled_turn_is_tagged_background(monkeypatch):
    """A scheduled task in the active session must not clear a live spinner."""
    events = []

    async def turn(session_id, prompt):
        return {
            "reply": "Report is ready.",
            "reasoning": "",
            "tool_calls_executed": [],
        }

    async def fake_broadcast(event_type, payload):
        events.append((event_type, payload))

    monkeypatch.setattr(task_execution, "execute_chat_turn", turn)
    monkeypatch.setattr(task_execution, "mark_task_outcome", lambda *a: None)
    monkeypatch.setattr(task_execution.ws_manager, "broadcast", fake_broadcast)
    monkeypatch.setattr(task_execution.session_manager, "active_session_id", "session-1")
    monkeypatch.setattr(task_execution, "_session_title", lambda _sid: "Title")

    asyncio.run(
        task_execution.run_scheduled_task("session-1", "task-1", "Prepare report")
    )

    updated = next(payload for kind, payload in events if kind == "SESSION_UPDATED")
    assert updated["background"] is True