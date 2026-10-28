"""Final-answer handling for reasoning leaks and empty provider replies."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.ai.llm_router import llm_router

LEAK = (
    "The user said they want the note updated. They want all tools listed. "
    "Let me think about the best structure and then write the final answer."
)


class SequenceEngine:
    """Returns one scripted completion per call."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = 0

    def complete(self, *_args, **_kwargs):
        self.calls += 1
        return self.replies.pop(0)


def _run(monkeypatch, replies):
    engine = SequenceEngine(replies)
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)
    result = llm_router.chat_completion(
        [{"role": "user", "content": "update the note"}], tools=None
    )
    return engine, result


def test_reasoning_only_reply_is_retried_once(monkeypatch):
    engine, result = _run(
        monkeypatch,
        [
            {"content": "", "reasoning": LEAK, "tool_calls": []},
            {"content": "The note is updated.", "reasoning": "", "tool_calls": []},
        ],
    )

    assert result["content"] == "The note is updated."
    assert engine.calls == 2
    assert "failed" not in result


def test_reasoning_leaked_into_content_is_retried(monkeypatch):
    engine, result = _run(
        monkeypatch,
        [
            {"content": LEAK, "reasoning": "", "tool_calls": []},
            {"content": "The note is updated.", "reasoning": "", "tool_calls": []},
        ],
    )

    assert result["content"] == "The note is updated."
    assert engine.calls == 2


def test_persistent_reasoning_returns_a_clear_error(monkeypatch):
    engine, result = _run(
        monkeypatch,
        [
            {"content": "", "reasoning": LEAK, "tool_calls": []},
            {"content": "", "reasoning": LEAK, "tool_calls": []},
        ],
    )

    assert result["content"].startswith("The model returned only reasoning")
    assert result["failed"] is True
    assert engine.calls == 2


def test_empty_reply_is_retried_and_reported(monkeypatch):
    engine, result = _run(
        monkeypatch,
        [
            {"content": "", "reasoning": "", "tool_calls": []},
            {"content": "", "reasoning": "", "tool_calls": []},
        ],
    )

    assert result["content"].startswith("The model returned an empty response")
    assert result["failed"] is True
    assert engine.calls == 2


def test_normal_reply_is_not_retried(monkeypatch):
    engine, result = _run(
        monkeypatch,
        [{"content": "Here is the summary.", "reasoning": "", "tool_calls": []}],
    )

    assert result["content"] == "Here is the summary."
    assert engine.calls == 1
