"""F1 approval tests: guarded calls pause, then resume into one final reply."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.ai import llm_router as router_module
from backend.ai.llm_router import llm_router
from backend.mcp_tools import tool_permissions


class FakeEngine:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def complete(self, messages, **kwargs):
        self.calls.append(messages)
        return self.replies.pop(0)


def _guarded_tool_call():
    return {
        "content": "I can do that.",
        "tool_calls": [{
            "id": "guarded-1",
            "function": {"name": "test_destructive", "arguments": '{"value": 1}'},
        }],
    }


def _register_guarded(monkeypatch):
    monkeypatch.setitem(
        tool_permissions.TOOL_PERMISSIONS,
        "test_destructive",
        tool_permissions.ToolPermission("destructive", "tests"),
    )


def test_guarded_tool_pauses_without_executing(monkeypatch):
    _register_guarded(monkeypatch)
    engine = FakeEngine([_guarded_tool_call()])
    called = []
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)
    monkeypatch.setattr(router_module, "execute_tool", lambda *args: called.append(args))

    result = llm_router.chat_completion(
        [{"role": "user", "content": "delete it"}], session_id="session-1"
    )

    assert called == []
    assert result["approval_required"]["name"] == "test_destructive"
    assert result["approval_required"]["risk"] == "destructive"
    assert result["tool_calls_executed"] == []


def test_approval_executes_then_gets_final_model_reply(monkeypatch):
    _register_guarded(monkeypatch)
    engine = FakeEngine([_guarded_tool_call(), {"content": "Deleted successfully."}])
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)
    monkeypatch.setattr(router_module, "execute_tool", lambda *_args: "Deleted record.")

    paused = llm_router.chat_completion(
        [{"role": "user", "content": "delete it"}], session_id="session-2"
    )
    result = llm_router.resolve_approval(
        paused["approval_required"]["approval_id"], "session-2", True
    )

    assert result["content"] == "Deleted successfully."
    assert result["tool_calls_executed"] == [{
        "name": "test_destructive", "args": {"value": 1}, "output": "Deleted record.",
    }]
    final_messages = engine.calls[-1]
    assert final_messages[-1]["content"] == "Deleted record."


def test_decline_resumes_with_decline_result(monkeypatch):
    _register_guarded(monkeypatch)
    engine = FakeEngine([_guarded_tool_call(), {"content": "Okay, I did not delete it."}])
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)
    monkeypatch.setattr(router_module, "execute_tool", lambda *_args: "should not run")

    paused = llm_router.chat_completion(
        [{"role": "user", "content": "delete it"}], session_id="session-3"
    )
    result = llm_router.resolve_approval(
        paused["approval_required"]["approval_id"], "session-3", False
    )

    assert result["content"] == "Okay, I did not delete it."
    assert result["tool_calls_executed"][0]["output"] == "The user declined this action."


def test_approval_cannot_be_used_from_another_session(monkeypatch):
    _register_guarded(monkeypatch)
    monkeypatch.setattr(llm_router, "_engine", lambda: FakeEngine([_guarded_tool_call()]))
    paused = llm_router.chat_completion(
        [{"role": "user", "content": "delete it"}], session_id="session-4"
    )

    result = llm_router.resolve_approval(
        paused["approval_required"]["approval_id"], "different-session", True
    )
    assert result["error"] == "This approval request is no longer available."
