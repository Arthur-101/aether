"""Router tests for the visible-chat reset on a new session."""

import asyncio

from backend import event_router


def _run_chat(monkeypatch, changed):
    events = []

    async def fake_turn(session_id, prompt, **kwargs):
        return {
            "reply": "ok",
            "attachments": [],
            "tools_used": [],
            "tool_calls_executed": [],
            "reasoning": "",
        }

    async def fake_broadcast(event_type, payload):
        events.append((event_type, payload))

    async def noop(*args, **kwargs):
        return None

    monkeypatch.setattr(event_router, "execute_chat_turn", fake_turn)
    monkeypatch.setattr(event_router.ws_manager, "broadcast", fake_broadcast)
    monkeypatch.setattr(
        event_router.session_manager,
        "get_or_create_session",
        lambda prompt: "session-new",
    )
    monkeypatch.setattr(event_router.session_manager, "session_changed", changed)
    monkeypatch.setattr(
        event_router, "_get_session_title", lambda session_id: "New Session"
    )

    from backend import model_events, task_events

    monkeypatch.setattr(task_events, "broadcast_tasks", noop)
    monkeypatch.setattr(model_events, "broadcast_model_status", noop)

    asyncio.run(event_router._handle_chat({"text": "hello"}))
    return events


def test_new_session_resets_visible_history(monkeypatch):
    events = _run_chat(monkeypatch, changed=True)

    assert events[0][0] == "SESSION_STARTED"
    assert events[0][1]["session"]["id"] == "session-new"
    assert any(event_type == "SESSION_UPDATED" for event_type, _ in events)


def test_continuing_session_does_not_reset_history(monkeypatch):
    events = _run_chat(monkeypatch, changed=False)

    assert all(event_type != "SESSION_STARTED" for event_type, _ in events)
    assert any(event_type == "SESSION_UPDATED" for event_type, _ in events)
