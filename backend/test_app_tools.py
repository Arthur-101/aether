"""T7 launch/focus tests: taskbar allow-list, matching, and prompt wiring."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.ai.prompts import build_assistant_messages
from backend.mcp_tools import app_tools, tool_permissions
from backend.mcp_tools.server import (
    TOOL_DISPATCH,
    execute_tool,
    get_openai_tool_schemas,
)
from backend.tool_groups import TOOL_GROUP_IDS

APP_TOOLS = {"launch_app", "focus_window"}

SPOTIFY = {
    "id": "pin:spotify",
    "name": "Spotify",
    "path": (
        r"C:\Users\Test\AppData\Roaming\Microsoft\Internet Explorer"
        r"\Quick Launch\User Pinned\TaskBar\Spotify.lnk"
    ),
    "target_path": r"C:\Users\Test\AppData\Roaming\Spotify\Spotify.exe",
    "missing": False,
}

VSCODE = {
    "id": "pin:vscode",
    "name": "Visual Studio Code",
    "path": (
        r"C:\Users\Test\AppData\Roaming\Microsoft\Internet Explorer"
        r"\Quick Launch\User Pinned\TaskBar\Visual Studio Code.lnk"
    ),
    "target_path": r"C:\Users\Test\AppData\Local\Programs\Microsoft VS Code\Code.exe",
    "missing": False,
}


def _state(*apps):
    return {"apps": list(apps)}


def _app(name: str) -> dict:
    return {
        "id": f"pin:{name.casefold()}",
        "name": name,
        "path": rf"C:\Pins\{name}.lnk",
        "target_path": rf"C:\Apps\{name}\{name}.exe",
        "missing": False,
    }


@pytest.fixture(autouse=True)
def _clear_launch_guard():
    app_tools.reset_launch_guard()
    yield
    app_tools.reset_launch_guard()


def test_app_tools_are_registered_system_tools_without_approval():
    assert APP_TOOLS <= set(TOOL_DISPATCH)
    all_names = {schema["function"]["name"] for schema in get_openai_tool_schemas()}
    assert APP_TOOLS <= all_names

    for name in APP_TOOLS:
        permission = tool_permissions.tool_permission(name)
        assert permission.group == "system"
        assert permission.risk == "write"
        assert tool_permissions.requires_approval(name) is False


def test_launch_app_opens_an_exact_taskbar_name(monkeypatch):
    seen = []
    monkeypatch.setattr(
        app_tools, "build_taskbar_state", lambda **_kwargs: _state(SPOTIFY)
    )
    monkeypatch.setattr(
        app_tools,
        "launch_entry",
        lambda entry: seen.append(entry) or {"ok": True, "action": "launched"},
    )

    assert app_tools.launch_app("spotify") == "Opened Spotify."
    assert seen == [SPOTIFY]


def test_launch_app_resolves_a_common_short_name(monkeypatch):
    monkeypatch.setattr(
        app_tools, "build_taskbar_state", lambda **_kwargs: _state(VSCODE)
    )
    monkeypatch.setattr(
        app_tools,
        "launch_entry",
        lambda _entry: {"ok": True, "action": "launched"},
    )

    assert app_tools.launch_app("VS Code") == "Opened Visual Studio Code."
    assert app_tools.launch_app("VSCode") == "Opened Visual Studio Code."


def test_launch_app_accepts_an_exact_allow_listed_path(monkeypatch):
    seen = []
    monkeypatch.setattr(
        app_tools, "build_taskbar_state", lambda **_kwargs: _state(SPOTIFY)
    )
    monkeypatch.setattr(
        app_tools,
        "launch_entry",
        lambda entry: seen.append(entry) or {"ok": True, "action": "launched"},
    )

    result = app_tools.launch_app(SPOTIFY["target_path"])

    assert result == "Opened Spotify."
    assert seen == [SPOTIFY]


def test_launch_app_rejects_a_path_outside_the_allow_list(monkeypatch):
    seen = []
    monkeypatch.setattr(
        app_tools, "build_taskbar_state", lambda **_kwargs: _state(SPOTIFY)
    )
    monkeypatch.setattr(
        app_tools,
        "launch_entry",
        lambda entry: seen.append(entry) or {"ok": True, "action": "launched"},
    )

    result = app_tools.launch_app(r"C:\Temp\evil.exe")

    assert "only launches apps from your taskbar deck" in result
    assert seen == []


def test_launch_app_reports_a_missing_shortcut(monkeypatch):
    missing = {**SPOTIFY, "missing": True}
    monkeypatch.setattr(
        app_tools, "build_taskbar_state", lambda **_kwargs: _state(missing)
    )
    monkeypatch.setattr(
        app_tools,
        "launch_entry",
        lambda _entry: (_ for _ in ()).throw(AssertionError("must not launch")),
    )

    result = app_tools.launch_app("Spotify")

    assert "shortcut is missing" in result


def test_launch_app_reports_an_unknown_app(monkeypatch):
    monkeypatch.setattr(
        app_tools, "build_taskbar_state", lambda **_kwargs: _state(SPOTIFY)
    )

    result = app_tools.launch_app("Slack")

    assert "couldn't find 'Slack'" in result
    assert "Taskbar dock" in result


def test_launch_app_asks_for_approval_after_three_launches_in_a_minute(
    monkeypatch,
):
    launched = []
    apps = [_app("Brave"), _app("Spotify"), _app("Discord"), _app("Notion")]
    monkeypatch.setattr(
        app_tools, "build_taskbar_state", lambda **_kwargs: _state(*apps)
    )
    monkeypatch.setattr(
        app_tools,
        "launch_entry",
        lambda entry: launched.append(entry["name"])
        or {"ok": True, "action": "launched"},
    )

    for name in ("Brave", "Spotify", "Discord"):
        assert tool_permissions.requires_approval(
            "launch_app", {"name_or_path": name}
        ) is False
        assert app_tools.launch_app(name) == f"Opened {name}."

    assert tool_permissions.requires_approval(
        "launch_app", {"name_or_path": "Notion"}
    ) is True
    assert launched == ["Brave", "Spotify", "Discord"]


def test_launch_approval_clears_after_a_minute(monkeypatch):
    now = [1000.0]
    apps = [_app("Brave"), _app("Spotify"), _app("Discord"), _app("Notion")]
    monkeypatch.setattr(app_tools.time, "monotonic", lambda: now[0])
    monkeypatch.setattr(
        app_tools, "build_taskbar_state", lambda **_kwargs: _state(*apps)
    )
    monkeypatch.setattr(
        app_tools,
        "launch_entry",
        lambda _entry: {"ok": True, "action": "launched"},
    )

    for name in ("Brave", "Spotify", "Discord"):
        assert app_tools.launch_app(name) == f"Opened {name}."
    assert tool_permissions.requires_approval(
        "launch_app", {"name_or_path": "Notion"}
    ) is True

    now[0] += 61
    assert tool_permissions.requires_approval(
        "launch_app", {"name_or_path": "Notion"}
    ) is False


def test_a_failed_launch_does_not_count_toward_approval(monkeypatch):
    attempts = []
    apps = [_app("Brave"), _app("Spotify"), _app("Discord")]
    monkeypatch.setattr(
        app_tools, "build_taskbar_state", lambda **_kwargs: _state(*apps)
    )

    def fake_launch(entry):
        attempts.append(entry["name"])
        if len(attempts) == 1:
            return {"ok": False, "message": "Windows could not launch Brave."}
        return {"ok": True, "action": "launched"}

    monkeypatch.setattr(app_tools, "launch_entry", fake_launch)

    assert app_tools.launch_app("Brave") == "Windows could not launch Brave."
    for name in ("Brave", "Spotify", "Discord"):
        assert app_tools.launch_app(name) == f"Opened {name}."

    assert tool_permissions.requires_approval(
        "launch_app", {"name_or_path": "Brave"}
    ) is True


def test_focus_window_uses_the_taskbar_app_window(monkeypatch):
    focused = []
    monkeypatch.setattr(
        app_tools, "build_taskbar_state", lambda **_kwargs: _state(VSCODE)
    )
    monkeypatch.setattr(app_tools, "window_snapshot", lambda: {"windows": []})
    monkeypatch.setattr(
        app_tools,
        "matching_windows",
        lambda _target, _app_id: [
            {"hwnd": 42, "title": "main.py - Visual Studio Code"}
        ],
    )
    monkeypatch.setattr(
        app_tools,
        "bring_window_to_front",
        lambda hwnd: focused.append(hwnd) or True,
    )

    assert app_tools.focus_window("VS Code") == (
        "Brought Visual Studio Code forward."
    )
    assert focused == [42]


def test_focus_window_matches_an_open_window_title(monkeypatch):
    focused = []
    monkeypatch.setattr(
        app_tools,
        "build_taskbar_state",
        lambda **_kwargs: (_ for _ in ()).throw(
            AssertionError("a title match must not build the taskbar deck")
        ),
    )
    monkeypatch.setattr(
        app_tools,
        "window_snapshot",
        lambda: {
            "windows": [
                {"hwnd": 7, "title": "Settings"},
                {"hwnd": 8, "title": "Q3 invoice.pdf - Microsoft Edge"},
            ]
        },
    )
    monkeypatch.setattr(
        app_tools,
        "bring_window_to_front",
        lambda hwnd: focused.append(hwnd) or True,
    )

    result = app_tools.focus_window("invoice")

    assert result == "Brought Q3 invoice.pdf - Microsoft Edge forward."
    assert focused == [8]


def test_focus_window_reports_an_app_that_is_not_open(monkeypatch):
    monkeypatch.setattr(
        app_tools, "build_taskbar_state", lambda **_kwargs: _state(VSCODE)
    )
    monkeypatch.setattr(app_tools, "window_snapshot", lambda: {"windows": []})
    monkeypatch.setattr(app_tools, "matching_windows", lambda _target, _app_id: [])

    assert app_tools.focus_window("VS Code") == (
        "Visual Studio Code isn't open. Use launch_app to open it."
    )


def test_focus_window_prefers_an_exact_title_over_an_app_prefix(monkeypatch):
    focused = []
    monkeypatch.setattr(
        app_tools,
        "build_taskbar_state",
        lambda **_kwargs: (_ for _ in ()).throw(
            AssertionError("a title match must not build the taskbar deck")
        ),
    )
    monkeypatch.setattr(
        app_tools,
        "window_snapshot",
        lambda: {"windows": [{"hwnd": 9, "title": "Settings"}]},
    )
    monkeypatch.setattr(
        app_tools,
        "bring_window_to_front",
        lambda hwnd: focused.append(hwnd) or True,
    )

    assert app_tools.focus_window("Settings") == "Brought Settings forward."
    assert focused == [9]


def test_focus_window_reports_an_unknown_window(monkeypatch):
    monkeypatch.setattr(app_tools, "build_taskbar_state", lambda **_kwargs: _state())
    monkeypatch.setattr(
        app_tools,
        "window_snapshot",
        lambda: {"windows": [{"hwnd": 1, "title": "Settings"}]},
    )

    result = app_tools.focus_window("invoice")

    assert "couldn't find an open window" in result


def test_app_prompt_names_tools_only_when_available():
    default = build_assistant_messages("hi")[0]["content"]
    assert "launch_app" in default
    assert "focus_window" in default
    assert "taskbar name" in default

    enabled = build_assistant_messages(
        "hi", enabled_tool_groups=["system"], disabled_tools=[]
    )[0]["content"]
    assert "launch_app" in enabled
    assert "focus_window" in enabled

    generic = build_assistant_messages(
        "hi",
        enabled_tool_groups=["system"],
        disabled_tools=["launch_app"],
    )[0]["content"]
    assert "launch_app" not in generic
    assert "focus_window" not in generic
    assert "available app tool" in generic

    disabled = build_assistant_messages(
        "hi", enabled_tool_groups=["notes"], disabled_tools=[]
    )[0]["content"]
    assert "launch_app" not in disabled
    assert "focus_window" not in disabled


def test_execute_tool_dispatches_launch_app(monkeypatch):
    monkeypatch.setattr(
        app_tools, "build_taskbar_state", lambda **_kwargs: _state(SPOTIFY)
    )
    monkeypatch.setattr(
        app_tools,
        "launch_entry",
        lambda _entry: {"ok": True, "action": "launched"},
    )

    result = execute_tool(
        "launch_app",
        {"name_or_path": "Spotify"},
        enabled_groups=TOOL_GROUP_IDS,
        disabled_tools=[],
    )

    assert result == "Opened Spotify."
