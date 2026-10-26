"""Tool-call visibility: the LLM router emits started/finished steps per tool."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.ai import llm_router as router_module
from backend.ai.llm_router import llm_router


class FakeEngine:
    """Returns prepared completions in order for each tool round."""

    def __init__(self, replies):
        self._replies = list(replies)

    def complete(self, *_args, **_kwargs):
        return self._replies.pop(0)


def _tool_reply(name, call_id="c1", arguments="{}"):
    return {
        "tool_calls": [
            {"id": call_id, "function": {"name": name, "arguments": arguments}}
        ]
    }


def test_successful_tool_emits_started_then_finished(monkeypatch):
    engine = FakeEngine([_tool_reply("list_notes"), {"content": "All done."}])
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)
    monkeypatch.setattr(router_module, "execute_tool", lambda name, args: "3 notes")

    events = []
    result = llm_router.chat_completion(
        [{"role": "user", "content": "notes?"}],
        tools=[{"type": "function"}],
        session_id="s1",
        on_tool_call=events.append,
    )

    assert result["content"] == "All done."
    assert [event["phase"] for event in events] == ["started", "finished"]
    assert events[0]["name"] == "list_notes"
    assert events[0]["call_id"] == "c1"
    assert events[0]["args"] == {}
    assert events[1]["ok"] is True
    assert events[1]["output"] == "3 notes"


def test_failed_tool_is_marked_not_ok(monkeypatch):
    engine = FakeEngine(
        [_tool_reply("read_note", arguments='{"note": "x"}'), {"content": "done"}]
    )
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)
    monkeypatch.setattr(
        router_module, "execute_tool", lambda name, args: "Error: tool blew up"
    )

    events = []
    llm_router.chat_completion(
        [{"role": "user", "content": "hi"}],
        tools=[{"type": "function"}],
        session_id="s1",
        on_tool_call=events.append,
    )

    finished = [event for event in events if event["phase"] == "finished"]
    started = [event for event in events if event["phase"] == "started"]
    assert finished and finished[0]["ok"] is False
    assert started and started[0]["args"] == {"note": "x"}


def test_no_callback_still_runs_tools(monkeypatch):
    engine = FakeEngine([_tool_reply("list_notes"), {"content": "ok"}])
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)
    monkeypatch.setattr(router_module, "execute_tool", lambda name, args: "fine")

    result = llm_router.chat_completion(
        [{"role": "user", "content": "hi"}],
        tools=[{"type": "function"}],
        session_id="s1",
    )
    assert result["content"] == "ok"
    assert result["tool_calls_executed"][0]["name"] == "list_notes"