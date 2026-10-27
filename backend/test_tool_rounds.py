"""Configurable model→tool loop budget tests."""

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
    """Requests one tool call on every completion."""

    def __init__(self):
        self.calls = 0

    def complete(self, *_args, **_kwargs):
        self.calls += 1
        return {
            "tool_calls": [
                {
                    "id": f"call-{self.calls}",
                    "function": {"name": "list_notes", "arguments": "{}"},
                }
            ]
        }


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
