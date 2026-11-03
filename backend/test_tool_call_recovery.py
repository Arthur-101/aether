"""Recovery when llama-server rejects a malformed (truncated) tool call."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from backend.ai.errors import ModelNotConfiguredError, ToolCallParseError
from backend.ai.llm_router import llm_router
from backend.ai.local_engine import _server_error

PARSE_BODY = (
    '{"error":{"code":500,"message":"Failed to parse tool call arguments as '
    'JSON: [json.exception.parse_error.101] ..."}}'
)


def test_server_error_flags_tool_parse_failures():
    err = _server_error(500, PARSE_BODY)
    assert isinstance(err, ToolCallParseError)
    assert "incomplete tool call" in str(err)


def test_server_error_stays_generic_for_other_failures():
    err = _server_error(500, '{"error":{"message":"model not found"}}')
    assert isinstance(err, ModelNotConfiguredError)
    assert not isinstance(err, ToolCallParseError)


class ScriptedEngine:
    """Raises or returns one scripted step per ``complete`` call."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def complete(self, _messages, **kwargs):
        self.calls.append(kwargs)
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        return step


TOOLS = [{"type": "function", "function": {"name": "create_note"}}]


def test_router_retries_a_truncated_tool_call_with_more_room(monkeypatch):
    engine = ScriptedEngine([
        ToolCallParseError("cut short"),
        {"content": "Done.", "reasoning": "", "tool_calls": []},
    ])
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)

    result = llm_router.chat_completion(
        [{"role": "user", "content": "create the note"}], tools=TOOLS
    )

    assert result["content"] == "Done."
    assert len(engine.calls) == 2
    assert engine.calls[1]["max_tokens"] > engine.calls[0]["max_tokens"]
    assert engine.calls[1]["tools"] == TOOLS


def test_router_does_not_retry_without_tools(monkeypatch):
    engine = ScriptedEngine([ToolCallParseError("cut short")])
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)

    with pytest.raises(ToolCallParseError):
        llm_router.chat_completion([{"role": "user", "content": "hi"}], tools=None)

    assert len(engine.calls) == 1


def test_chat_turns_get_a_roomy_default_output_budget(monkeypatch):
    engine = ScriptedEngine([{"content": "ok", "reasoning": "", "tool_calls": []}])
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)

    llm_router.chat_completion([{"role": "user", "content": "hi"}], tools=None)

    assert engine.calls[0]["max_tokens"] >= 4096
