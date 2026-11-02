"""Tool calls printed as text are recovered instead of being answered as XML."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.ai import llm_router as router_module
from backend.ai.llm_router import llm_router
from backend.ai.tool_call_parser import (
    contains_tool_markup,
    extract_text_tool_calls,
    has_complete_tool_call,
    strip_tool_markup,
)
from backend.db.sessions import _is_bad_memory_turn

DOTS_CALL = (
    '<dots_function_call><invoke name="update_note">'
    '{"note_id": 4, "content": "Ship it"}'
    "</invoke></dots_function_call>"
)


class SequenceEngine:
    """Returns one scripted completion per call and records the conversations."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.conversations = []

    def complete(self, conversation, **_kwargs):
        self.conversations.append([dict(message) for message in conversation])
        return self.replies.pop(0)


def _tools(*names):
    return [
        {"type": "function", "function": {"name": name, "parameters": {}}}
        for name in names
    ]


def _single(content, *names):
    calls = extract_text_tool_calls(content, set(names))
    return calls[0] if calls else None


# ── parsing ────────────────────────────────────────────────────────────────
def test_dots_invoke_json_is_recovered():
    call = _single(DOTS_CALL, "update_note")
    assert call is not None
    assert call["function"]["name"] == "update_note"
    assert '"note_id": 4' in call["function"]["arguments"]


def test_invoke_parameter_blocks_become_arguments():
    content = (
        '<invoke name="create_note">'
        '<parameter name="title">Groceries</parameter>'
        '<parameter name="content">Milk</parameter>'
        "</invoke>"
    )
    call = _single(content, "create_note")
    assert call is not None
    args = call["function"]["arguments"]
    assert '"title": "Groceries"' in args
    assert '"content": "Milk"' in args


def test_tool_call_json_with_string_arguments_is_recovered():
    content = (
        '<tool_call>{"function": {"name": "get_weather", '
        '"arguments": "{\\"city\\": \\"Pune\\"}"}}</tool_call>'
    )
    call = _single(content, "get_weather")
    assert call is not None
    assert '"city": "Pune"' in call["function"]["arguments"]


def test_fenced_json_inside_a_call_is_recovered():
    content = '<tool_call>```json\n{"name": "list_notes"}\n```</tool_call>'
    call = _single(content, "list_notes")
    assert call is not None
    assert call["function"]["arguments"] == "{}"


def test_unavailable_tool_is_ignored():
    assert _single(DOTS_CALL, "list_notes") is None


def test_no_offered_tools_means_nothing_is_recovered():
    assert extract_text_tool_calls(DOTS_CALL, set()) == []
    assert extract_text_tool_calls(DOTS_CALL) == []


def test_identical_calls_are_deduplicated():
    calls = extract_text_tool_calls(DOTS_CALL + DOTS_CALL, {"update_note"})
    assert len(calls) == 1


def test_markup_detection_handles_truncated_calls():
    assert contains_tool_markup(DOTS_CALL) is True
    assert contains_tool_markup('<invoke name="update_note">{"note_id"') is True
    assert contains_tool_markup('<|tool_call|>') is True
    assert has_complete_tool_call('<invoke name="update_note">{"note_id"') is False
    assert contains_tool_markup("The note is updated.") is False


def test_strip_keeps_surrounding_prose():
    content = "Updating that note now.\n" + DOTS_CALL
    assert strip_tool_markup(content) == "Updating that note now."


# ── router ─────────────────────────────────────────────────────────────────
def test_router_runs_a_call_the_model_printed_as_text(monkeypatch):
    engine = SequenceEngine([{"content": DOTS_CALL}, {"content": "Note updated."}])
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)
    monkeypatch.setattr(router_module, "requires_approval", lambda *_a, **_k: False)
    executed = []
    monkeypatch.setattr(
        router_module,
        "execute_tool",
        lambda name, args: executed.append((name, args)) or "ok",
    )

    seen = []
    result = llm_router.chat_completion(
        [{"role": "user", "content": "update note 4"}],
        tools=_tools("update_note"),
        session_id="s1",
        on_tool_call=seen.append,
    )

    assert executed and executed[0][0] == "update_note"
    assert executed[0][1]["note_id"] == 4
    assert result["content"] == "Note updated."
    assert result["tool_calls_executed"][0]["name"] == "update_note"
    assert [event["phase"] for event in seen] == ["started", "finished"]
    # The markup must not travel back to the provider as assistant prose.
    assert engine.conversations[1][-2]["content"] == ""


def test_router_does_not_replay_markup_as_the_answer(monkeypatch):
    engine = SequenceEngine(
        [{"content": DOTS_CALL}, {"content": "I cannot update that note."}]
    )
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)

    result = llm_router.chat_completion(
        [{"role": "user", "content": "update note 4"}],
        tools=_tools("list_notes"),
    )

    assert result["content"] == "I cannot update that note."
    assert engine.conversations[0][-1]["role"] == "user"


# ── memory ─────────────────────────────────────────────────────────────────
def test_tool_markup_turn_is_not_written_to_memory():
    assert _is_bad_memory_turn("update note 4", DOTS_CALL) is True
    assert _is_bad_memory_turn("update note 4", "Note 4 is updated.") is False