"""Configurable model→tool loop budget tests."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.ai import llm_router as router_module
from backend.ai.llm_router import llm_router
from backend.config_schema import (
    DEFAULT_MAX_TOOL_ROUNDS,
    MAX_MAX_TOOL_ROUNDS,
    MIN_MAX_TOOL_ROUNDS,
    normalize_ai_provider,
    normalize_max_tool_rounds,
)


class EndlessToolEngine:
    """Requests a different tool call on every completion."""

    def __init__(self):
        self.calls = 0

    def complete(self, *_args, **_kwargs):
        self.calls += 1
        return {
            "tool_calls": [
                {
                    "id": f"call-{self.calls}",
                    "function": {
                        "name": "search_notes",
                        "arguments": json.dumps({"query": f"query-{self.calls}"}),
                    },
                }
            ]
        }


class RepeatingToolEngine:
    """Repeats the same zero-argument call until the guard forces a final answer."""

    def __init__(self):
        self.calls = 0

    def complete(self, *_args, **_kwargs):
        self.calls += 1
        if self.calls <= 3:
            return {
                "tool_calls": [
                    {
                        "id": f"call-{self.calls}",
                        "function": {"name": "read_clipboard", "arguments": "{}"},
                    }
                ]
            }
        return {"content": "The clipboard has already been read.", "tool_calls": []}


class ReadWriteReadEngine:
    """Reads, writes, then reads again; the re-read must not be deduplicated."""

    def __init__(self):
        self.calls = 0

    def complete(self, *_args, **_kwargs):
        self.calls += 1
        if self.calls == 1:
            return {
                "tool_calls": [
                    {
                        "id": "call-read-1",
                        "function": {"name": "read_clipboard", "arguments": "{}"},
                    }
                ]
            }
        if self.calls == 2:
            return {
                "tool_calls": [
                    {
                        "id": "call-write",
                        "function": {
                            "name": "write_clipboard",
                            "arguments": json.dumps({"text": "new text"}),
                        },
                    }
                ]
            }
        if self.calls == 3:
            return {
                "tool_calls": [
                    {
                        "id": "call-read-2",
                        "function": {"name": "read_clipboard", "arguments": "{}"},
                    }
                ]
            }
        return {"content": "Copied and verified.", "tool_calls": []}


def test_normalize_max_tool_rounds_clamps_values():
    assert normalize_max_tool_rounds(None) == DEFAULT_MAX_TOOL_ROUNDS
    assert normalize_max_tool_rounds("nope") == DEFAULT_MAX_TOOL_ROUNDS
    assert normalize_max_tool_rounds(0) == MIN_MAX_TOOL_ROUNDS
    assert normalize_max_tool_rounds(99) == MAX_MAX_TOOL_ROUNDS
    assert normalize_max_tool_rounds("5") == 5


def test_ai_provider_normalization_keeps_tool_rounds():
    assert normalize_ai_provider({"max_tool_rounds": 7})["max_tool_rounds"] == 7
    assert (
        normalize_ai_provider({"max_tool_rounds": 100})["max_tool_rounds"]
        == MAX_MAX_TOOL_ROUNDS
    )


def test_explicit_tool_round_limit_controls_the_loop(monkeypatch):
    engine = EndlessToolEngine()
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)
    monkeypatch.setattr(router_module, "execute_tool", lambda *_args: "ok")

    result = llm_router.chat_completion(
        [{"role": "user", "content": "keep going"}],
        tools=[{"type": "function"}],
        session_id="tool-rounds-explicit",
        max_tool_rounds=5,
    )

    assert engine.calls == 6
    assert result["content"].startswith("I reached the maximum number of tool steps")


def test_saved_tool_round_limit_is_used_by_default(monkeypatch):
    engine = EndlessToolEngine()
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)
    monkeypatch.setattr(router_module, "execute_tool", lambda *_args: "ok")

    def fake_get(section, key=None, default=None):
        if section == "ai_provider" and key == "max_tool_rounds":
            return 2
        return default

    monkeypatch.setattr(router_module.config_manager, "get", fake_get)

    result = llm_router.chat_completion(
        [{"role": "user", "content": "keep going"}],
        tools=[{"type": "function"}],
        session_id="tool-rounds-config",
    )

    assert engine.calls == 3
    assert result["content"].startswith("I reached the maximum number of tool steps")


def test_repeated_identical_tool_calls_stop_early(monkeypatch):
    engine = RepeatingToolEngine()
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)
    monkeypatch.setattr(router_module, "execute_tool", lambda *_args: "clipboard text")

    result = llm_router.chat_completion(
        [{"role": "user", "content": "read it"}],
        tools=[{"type": "function"}],
        session_id="tool-loop-guard",
        max_tool_rounds=5,
    )

    assert result["content"] == "The clipboard has already been read."
    assert [call["name"] for call in result["tool_calls_executed"]] == [
        "read_clipboard"
    ]
    assert engine.calls == 4


def test_reread_after_write_is_not_deduplicated(monkeypatch):
    engine = ReadWriteReadEngine()
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)
    monkeypatch.setattr(router_module, "execute_tool", lambda *_args: "ok")

    result = llm_router.chat_completion(
        [{"role": "user", "content": "copy and verify"}],
        tools=[{"type": "function"}],
        session_id="tool-loop-reread",
        max_tool_rounds=5,
    )

    assert result["content"] == "Copied and verified."
    assert [call["name"] for call in result["tool_calls_executed"]] == [
        "read_clipboard",
        "write_clipboard",
        "read_clipboard",
    ]
