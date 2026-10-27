"""F3 tool loadout tests: schema filtering, dispatch gate, and config defaults."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.ai import llm_router as router_module
from backend.ai.llm_router import llm_router
from backend.ai.prompts import build_assistant_messages
from backend.config_schema import normalize_config
from backend.mcp_tools import server, tool_permissions
from backend.mcp_tools.server import (
    TOOL_DISPATCH,
    execute_tool,
    get_openai_tool_schemas,
    tool_group_summary,
)
from backend.mcp_tools.tool_permissions import tool_permission
from backend.tool_groups import (
    LEAN_ENABLED_TOOL_GROUPS,
    TOOL_GROUP_IDS,
    normalize_disabled_tools,
    normalize_enabled_tool_groups,
)


class FakeEngine:
    def __init__(self, replies):
        self.replies = list(replies)

    def complete(self, messages, **kwargs):
        return self.replies.pop(0)


class CaptureEngine:
    def __init__(self):
        self.tools = None

    def complete(self, messages, tools=None, **kwargs):
        self.tools = tools
        return {"content": "done", "reasoning": "", "tool_calls": []}


def test_every_dispatch_tool_has_a_known_group():
    missing = {
        name
        for name in TOOL_DISPATCH
        if tool_permission(name).group not in TOOL_GROUP_IDS
    }
    assert missing == set()


def test_default_config_enables_every_group():
    tools = normalize_config({})["tools"]
    assert tools["enabled_groups"] == list(TOOL_GROUP_IDS)
    assert tools["disabled_tools"] == []
    assert tools["groups_version"] == 3


def test_legacy_all_on_configs_gain_new_groups_once():
    pre_system = ["notes", "media", "spotify", "web", "clock", "documents", "files"]
    tools = normalize_config({"tools": {"enabled_groups": pre_system}})["tools"]
    assert "system" in tools["enabled_groups"]
    assert "clipboard" in tools["enabled_groups"]
    assert tools["groups_version"] == 3

    pre_clipboard = pre_system + ["system"]
    tools = normalize_config(
        {
            "tools": {
                "enabled_groups": pre_clipboard,
                "groups_version": 2,
            }
        }
    )["tools"]
    assert "clipboard" in tools["enabled_groups"]
    assert tools["groups_version"] == 3

    opted_out = {
        "tools": {
            "enabled_groups": pre_clipboard,
            "disabled_tools": [],
            "groups_version": 3,
        }
    }
    assert "clipboard" not in normalize_config(opted_out)["tools"]["enabled_groups"]


def test_custom_legacy_selection_does_not_gain_new_groups():
    tools = normalize_config(
        {"tools": {"enabled_groups": ["notes", "web"]}}
    )["tools"]
    assert tools["enabled_groups"] == ["notes", "web"]


def test_explicit_empty_selection_stays_empty_after_upgrade():
    tools = normalize_config({"tools": {"enabled_groups": []}})["tools"]
    assert tools["enabled_groups"] == []


def test_group_normalization_filters_unknown_and_keeps_canonical_order():
    assert normalize_enabled_tool_groups(
        ["web", "bogus", "notes", "web"]
    ) == ["notes", "web"]


def test_empty_group_list_is_honoured():
    assert normalize_enabled_tool_groups([]) == []


def test_malformed_group_value_falls_back_to_all():
    assert normalize_enabled_tool_groups("notes") == list(TOOL_GROUP_IDS)
    assert normalize_enabled_tool_groups(None) == list(TOOL_GROUP_IDS)


def test_disabled_tools_are_trimmed_and_deduplicated():
    assert normalize_disabled_tools(
        [" delete_note ", "delete_note", "", None]
    ) == ["delete_note"]


def test_schema_filter_omits_disabled_groups():
    names = {
        schema["function"]["name"]
        for schema in get_openai_tool_schemas(["notes", "web"])
    }
    assert "list_notes" in names
    assert "web_search" in names
    assert "spotify_play" not in names
    assert "schedule_alarm" not in names


def test_schema_filter_honours_individual_tool_exceptions():
    names = {
        schema["function"]["name"]
        for schema in get_openai_tool_schemas(TOOL_GROUP_IDS, ["delete_note"])
    }
    assert "delete_note" not in names
    assert "list_notes" in names
    assert len(names) == 48


def test_empty_loadout_returns_no_schemas():
    assert get_openai_tool_schemas([], []) == []


def test_execute_tool_rejects_disabled_group():
    result = execute_tool("list_notes", {}, enabled_groups=["web"])
    assert result.startswith("Error")
    assert "disabled" in result.lower()


def test_execute_tool_rejects_individually_disabled_tool():
    result = execute_tool(
        "list_notes", {}, enabled_groups=TOOL_GROUP_IDS, disabled_tools=["list_notes"]
    )
    assert result.startswith("Error")
    assert "disabled" in result.lower()


def test_execute_tool_allows_enabled_tool(monkeypatch):
    monkeypatch.setitem(
        tool_permissions.TOOL_PERMISSIONS,
        "probe_tool",
        tool_permissions.ToolPermission("read", "notes"),
    )
    monkeypatch.setitem(server.TOOL_DISPATCH, "probe_tool", lambda: "ok")
    assert execute_tool("probe_tool", {}, enabled_groups=["notes"]) == "ok"


def test_tool_group_summary_reports_counts_and_tokens():
    summary = tool_group_summary(TOOL_GROUP_IDS, [])
    assert summary["total_tools"] == 49
    assert summary["enabled_tools"] == 49
    assert summary["total_tokens"] == summary["enabled_tokens"]
    assert {group["id"] for group in summary["groups"]} == set(TOOL_GROUP_IDS)
    assert all(group["tools"] for group in summary["groups"])

    lean = tool_group_summary(LEAN_ENABLED_TOOL_GROUPS, [])
    assert lean["enabled_tools"] < lean["total_tools"]
    assert lean["enabled_tokens"] < lean["total_tokens"]


def test_clock_prompt_names_tools_only_when_available():
    default = build_assistant_messages("hi")[0]["content"]
    assert "schedule_alarm" in default

    clock_on = build_assistant_messages(
        "hi", enabled_tool_groups=["clock"], disabled_tools=[]
    )[0]["content"]
    assert "schedule_alarm" in clock_on

    one_off = build_assistant_messages(
        "hi", enabled_tool_groups=["clock"], disabled_tools=["schedule_alarm"]
    )[0]["content"]
    assert "schedule_alarm" not in one_off
    assert "scheduling tool" in one_off

    clock_off = build_assistant_messages(
        "hi", enabled_tool_groups=["notes"], disabled_tools=[]
    )[0]["content"]
    assert "scheduling tool" not in clock_off


def test_engine_receives_only_enabled_schemas(monkeypatch):
    engine = CaptureEngine()
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)

    result = llm_router.chat_completion(
        [{"role": "user", "content": "search the web"}],
        tools=get_openai_tool_schemas(),
        loadout={"enabled_groups": ["web"], "disabled_tools": []},
    )

    assert result["content"] == "done"
    assert {schema["function"]["name"] for schema in engine.tools} == {
        "web_search",
        "fetch_url",
    }


def test_approval_resume_reuses_the_saved_loadout(monkeypatch):
    monkeypatch.setitem(
        tool_permissions.TOOL_PERMISSIONS,
        "probe_delete",
        tool_permissions.ToolPermission("destructive", "notes"),
    )
    engine = FakeEngine([
        {
            "content": "",
            "tool_calls": [{
                "id": "probe-1",
                "function": {"name": "probe_delete", "arguments": "{}"},
            }],
        },
        {"content": "Deleted."},
    ])
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)

    captured = {}

    def fake_execute(name, args, **kwargs):
        captured.update(kwargs)
        return "Deleted."

    monkeypatch.setattr(router_module, "execute_tool", fake_execute)

    loadout = {"enabled_groups": ["notes"], "disabled_tools": ["delete_note"]}
    paused = llm_router.chat_completion(
        [{"role": "user", "content": "delete it"}],
        tools=get_openai_tool_schemas(),
        session_id="loadout-approval",
        loadout=loadout,
    )
    result = llm_router.resolve_approval(
        paused["approval_required"]["approval_id"], "loadout-approval", True
    )

    assert result["content"] == "Deleted."
    assert captured == loadout
