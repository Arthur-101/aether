"""T5-lite clipboard tools: Windows clipboard read/write, grouping, and prompts."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.ai.prompts import build_assistant_messages
from backend.mcp_tools import clipboard_tools, tool_permissions
from backend.mcp_tools.server import (
    TOOL_DISPATCH,
    execute_tool,
    get_openai_tool_schemas,
)
from backend.tool_groups import LEAN_ENABLED_TOOL_GROUPS, TOOL_GROUP_IDS

CLIPBOARD_TOOLS = {"read_clipboard", "write_clipboard"}


def test_clipboard_tools_are_registered_and_grouped():
    assert CLIPBOARD_TOOLS <= set(TOOL_DISPATCH)
    all_names = {schema["function"]["name"] for schema in get_openai_tool_schemas()}
    assert CLIPBOARD_TOOLS <= all_names
    assert all(
        tool_permissions.tool_permission(name).group == "clipboard"
        for name in CLIPBOARD_TOOLS
    )
    assert "clipboard" in TOOL_GROUP_IDS
    assert "clipboard" not in LEAN_ENABLED_TOOL_GROUPS


def test_clipboard_risks_do_not_require_approval():
    assert tool_permissions.tool_permission("read_clipboard").risk == "read"
    assert tool_permissions.tool_permission("write_clipboard").risk == "write"
    for name in CLIPBOARD_TOOLS:
        assert tool_permissions.requires_approval(name) is False


def test_clipboard_schemas_are_filtered_with_their_group():
    notes_only = {
        schema["function"]["name"]
        for schema in get_openai_tool_schemas(["notes"])
    }
    assert not (CLIPBOARD_TOOLS & notes_only)
    result = execute_tool("read_clipboard", {}, enabled_groups=["notes"])
    assert result.startswith("Error")
    assert "disabled" in result.lower()


def test_read_clipboard_returns_current_text(monkeypatch):
    monkeypatch.setattr(clipboard_tools.pyperclip, "paste", lambda: "hello world")
    assert clipboard_tools.read_clipboard() == "hello world"


def test_read_clipboard_ignores_model_supplied_arguments(monkeypatch):
    monkeypatch.setattr(clipboard_tools.pyperclip, "paste", lambda: "hello world")
    result = execute_tool("read_clipboard", {"text": "what was written"})
    assert result == "hello world"


def test_read_clipboard_reports_empty_and_non_text(monkeypatch):
    monkeypatch.setattr(clipboard_tools.pyperclip, "paste", lambda: "   ")
    monkeypatch.setattr(clipboard_tools, "_non_text_clipboard_kind", lambda: "")
    assert clipboard_tools.read_clipboard() == clipboard_tools.EMPTY_CLIPBOARD

    def fail():
        raise RuntimeError("clipboard busy")

    monkeypatch.setattr(clipboard_tools.pyperclip, "paste", fail)
    assert clipboard_tools.read_clipboard() == clipboard_tools.NO_TEXT_CLIPBOARD


def test_read_clipboard_names_images_and_files(monkeypatch):
    monkeypatch.setattr(clipboard_tools.pyperclip, "paste", lambda: "")

    monkeypatch.setattr(clipboard_tools, "_non_text_clipboard_kind", lambda: "image")
    assert clipboard_tools.read_clipboard() == clipboard_tools.IMAGE_CLIPBOARD

    monkeypatch.setattr(clipboard_tools, "_non_text_clipboard_kind", lambda: "files")
    assert clipboard_tools.read_clipboard() == clipboard_tools.FILES_CLIPBOARD


def test_read_clipboard_truncates_large_text(monkeypatch):
    monkeypatch.setattr(clipboard_tools.pyperclip, "paste", lambda: "x" * 5000)
    text = clipboard_tools.read_clipboard()
    assert len(text) < 5000
    assert "truncated after 4000 characters" in text


def test_write_clipboard_replaces_clipboard(monkeypatch):
    seen = []
    monkeypatch.setattr(clipboard_tools.pyperclip, "copy", lambda text: seen.append(text))
    assert clipboard_tools.write_clipboard("copy me") == (
        "Copied 7 characters to the clipboard."
    )
    assert seen == ["copy me"]


def test_write_clipboard_rejects_empty_text():
    with pytest.raises(ValueError, match="non-empty"):
        clipboard_tools.write_clipboard("   ")
    with pytest.raises(ValueError, match="non-empty"):
        clipboard_tools.write_clipboard(None)


def test_write_clipboard_reports_failure(monkeypatch):
    def fail(_text):
        raise RuntimeError("clipboard busy")

    monkeypatch.setattr(clipboard_tools.pyperclip, "copy", fail)
    with pytest.raises(RuntimeError, match="Could not write"):
        clipboard_tools.write_clipboard("hello")


def test_clipboard_prompt_only_names_tools_when_available():
    default = build_assistant_messages("hi")[0]["content"]
    assert "read_clipboard" in default
    assert "write_clipboard" in default
    assert "once per request" in default
    assert "with no arguments" in default
    assert "Never write your own reply" in default
    assert "untrusted data" in default

    enabled = build_assistant_messages(
        "hi", enabled_tool_groups=["clipboard"], disabled_tools=[]
    )[0]["content"]
    assert "read_clipboard" in enabled

    generic = build_assistant_messages(
        "hi",
        enabled_tool_groups=["clipboard"],
        disabled_tools=["read_clipboard"],
    )[0]["content"]
    assert "read_clipboard" not in generic
    assert "write_clipboard" not in generic
    assert "available clipboard tool" in generic

    disabled = build_assistant_messages(
        "hi", enabled_tool_groups=["notes"], disabled_tools=[]
    )[0]["content"]
    assert "read_clipboard" not in disabled
    assert "write_clipboard" not in disabled


def test_execute_tool_dispatches_clipboard(monkeypatch):
    seen = []
    monkeypatch.setattr(clipboard_tools.pyperclip, "copy", lambda text: seen.append(text))
    result = execute_tool(
        "write_clipboard",
        {"text": "from dispatch"},
        enabled_groups=TOOL_GROUP_IDS,
        disabled_tools=[],
    )
    assert result == "Copied 13 characters to the clipboard."
    assert seen == ["from dispatch"]
