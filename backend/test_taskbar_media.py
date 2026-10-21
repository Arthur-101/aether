"""Focused tests for taskbar discovery and SMTC snapshot helpers."""

import sys
from pathlib import Path

import pytest

from backend.config_schema import normalize_taskbar_apps
from backend.os_hooks.media_snapshot import (
    snapshot_differs,
    source_identity,
    unavailable_snapshot,
)
from backend.os_hooks.taskbar_apps import _running_state, split_icon_location
from backend.os_hooks.taskbar_launch import launch_entry, normalize_path
from backend.os_hooks.taskbar_order import pinned_shortcut_order
from backend.os_hooks.taskbar_state import _open_entries, find_app
from backend.os_hooks.window_apps import (
    app_id_from_arguments,
    is_taskbar_window,
)


def test_icon_location_splits_path_and_resource_index():
    assert split_icon_location(r"C:\Apps\Tool.exe,3") == (r"C:\Apps\Tool.exe", 3)
    assert split_icon_location(",0") == ("", 0)
    assert split_icon_location(r"C:\Apps, Inc\Tool.exe") == (
        r"C:\Apps, Inc\Tool.exe",
        0,
    )


def test_taskbar_config_is_sanitized_and_mode_is_bounded():
    normalized = normalize_taskbar_apps(
        {
            "mode": "surprise",
            "pinned": [
                {"id": "one", "name": "App", "path": r"C:\App.exe", "icon": "x"},
                {"id": "", "name": "", "path": ""},
            ],
        }
    )
    assert normalized == {
        "mode": "mirror",
        "pinned": [{"id": "one", "name": "App", "path": r"C:\App.exe"}],
    }


def test_explorer_running_state_is_omitted_not_faked():
    assert _running_state(r"C:\Windows\explorer.exe", set(), {"explorer"}) is None
    assert _running_state(r"C:\Apps\Tool.exe", {normalize_path(r"C:\Apps\Tool.exe")}, set()) is True
    assert _running_state(r"C:\Apps\Tool.exe", set(), set()) is False


def test_web_app_id_parsing_supports_shortcut_argument_forms():
    app_id = "lodlkdfmihgonocnmddehnfgiljnadcf"
    assert app_id_from_arguments(
        f" --profile-directory=Default --app-id={app_id}"
    ) == app_id
    assert app_id_from_arguments(f'--app-id "{app_id}"') == app_id
    assert app_id_from_arguments("--app-id") == ""
    assert app_id_from_arguments("") == ""
    assert app_id_from_arguments("--profile-directory=Default") == ""


def test_pwa_windows_do_not_mark_a_browser_pin_running():
    ulaa = normalize_path(r"C:\Ulaa\ulaa.exe")
    pwa_only = {
        "by_exe": {ulaa: [{"pwa": True}]},
        "pwa_ids": {"x-app-id"},
    }
    assert _running_state(
        r"C:\Ulaa\ulaa.exe", {ulaa}, {"ulaa"}, window_state=pwa_only
    ) is False
    assert _running_state(
        r"C:\Ulaa\ulaa.exe",
        set(),
        set(),
        app_id="x-app-id",
        window_state=pwa_only,
    ) is True
    browser_open = {
        "by_exe": {ulaa: [{"pwa": False}]},
        "pwa_ids": set(),
    }
    assert _running_state(
        r"C:\Ulaa\ulaa.exe", set(), set(), window_state=browser_open
    ) is True


def test_unpinned_pwa_window_becomes_an_open_app_entry(tmp_path):
    source = tmp_path / "X.lnk"
    source.write_bytes(b"")
    pinned = [
        {
            "id": "pin:ulaa",
            "name": "Ulaa",
            "target_path": r"C:\Ulaa\ulaa.exe",
        }
    ]
    window = {
        "hwnd": 42,
        "pid": 100,
        "title": "X - Timeline",
        "class": "Chrome_WidgetWin_1",
        "exe": r"C:\Ulaa\ulaa.exe",
        "process": "ulaa.exe",
        "app_id": "x-app-id",
        "source_shortcut": str(source),
        "pwa": True,
    }
    snapshot = {
        "windows": [window],
        "by_app_id": {"x-app-id": window},
        "by_exe": {normalize_path(window["exe"]): [window]},
        "pwa_ids": {"x-app-id"},
    }
    entries = _open_entries(pinned, snapshot, False, set(), set())
    assert len(entries) == 1
    assert entries[0]["app_id"] == "x-app-id"
    assert entries[0]["name"] == "X"
    assert entries[0]["running"] is True
    assert entries[0]["missing"] is False


def test_open_app_entries_skip_windows_already_represented_by_pins(tmp_path):
    source = tmp_path / "X.lnk"
    source.write_bytes(b"")
    window = {
        "exe": r"C:\Ulaa\ulaa.exe",
        "process": "ulaa.exe",
        "app_id": "x-app-id",
        "source_shortcut": str(source),
        "pwa": True,
    }
    snapshot = {
        "windows": [window],
        "by_app_id": {"x-app-id": window},
        "by_exe": {normalize_path(window["exe"]): [window]},
        "pwa_ids": {"x-app-id"},
    }
    assert _open_entries(
        [{"id": "pin:x", "app_id": "x-app-id"}],
        snapshot,
        False,
        set(),
        set(),
    ) == []
    assert _open_entries(
        [{"id": "pin:ulaa", "target_path": window["exe"]}],
        {
            **snapshot,
            "windows": [{**window, "app_id": "", "pwa": False}],
            "by_app_id": {},
            "pwa_ids": set(),
        },
        False,
        set(),
        set(),
    ) == []


def test_taskbar_window_filter_rejects_tool_and_aether_windows():
    assert is_taskbar_window(
        10, 100, "Document", "Chrome_WidgetWin_1", 0, 0, r"C:\Apps\App.exe"
    ) is True
    assert is_taskbar_window(
        10, 100, "Aether", "Tauri Window", 0, 0, r"C:\Apps\Aether.exe"
    ) is False
    assert is_taskbar_window(
        10, 100, "Tool", "Chrome_WidgetWin_1", 0x80, 0, r"C:\Apps\App.exe"
    ) is False
    assert is_taskbar_window(
        10, 100, "Unowned child", "Chrome_WidgetWin_1", 0, 99, r"C:\Apps\App.exe"
    ) is False


def test_find_app_matches_stable_id():
    state = {"apps": [{"id": "pin:1", "name": "One"}, {"id": "pin:2", "name": "Two"}]}
    assert find_app(state, "pin:2")["name"] == "Two"
    assert find_app(state, "missing") is None
    assert find_app(state, "") is None


def test_launch_entry_rejects_unresolved_or_missing_apps():
    assert launch_entry({"path": ""})["ok"] is False
    result = launch_entry({"path": r"C:\Apps\Gone.exe", "name": "Gone", "missing": True})
    assert result["ok"] is False
    assert "missing" in result["message"]


def test_taskband_registry_order_wins_over_alphabetical(tmp_path):
    from unittest.mock import patch

    brave = tmp_path / "Brave.lnk"
    spotify = tmp_path / "Spotify.lnk"
    brave.write_bytes(b"")
    spotify.write_bytes(b"")
    shortcuts = [brave, spotify]
    with (
        patch("backend.os_hooks.taskbar_order.winreg.OpenKey") as open_key,
        patch(
            "backend.os_hooks.taskbar_order.winreg.QueryValueEx",
            return_value=(b"", 3),
        ),
        patch(
            "backend.os_hooks.taskbar_order._candidates",
            return_value=[(300, "XSpotify.lnk"), (100, "ABrave.lnk")],
        ),
    ):
        open_key.return_value.__enter__.return_value = object()
        ordered = pinned_shortcut_order(tmp_path, shortcuts)
    assert [item.name for item in ordered] == ["Brave.lnk", "Spotify.lnk"]


def test_source_identity_marks_spotify_variants():
    assert source_identity("Spotify.exe") == ("spotify", "Spotify", True)
    assert source_identity("spotifast.exe") == ("spotifast", "Spotifast", True)
    assert source_identity("msedge.exe") == ("msedge", "Edge", False)
    assert source_identity("") == ("", "Media", False)


def test_unavailable_snapshot_has_stable_widget_contract():
    snapshot = unavailable_snapshot("offline")
    assert snapshot["available"] is False
    assert snapshot["has_session"] is False
    assert snapshot["status"] == "unavailable"
    assert snapshot["message"] == "offline"
    assert snapshot["position_seconds"] == 0.0


def test_snapshot_diff_detects_track_and_progress_changes():
    base = unavailable_snapshot()
    assert snapshot_differs(None, base) is True
    assert snapshot_differs(base, dict(base)) is False
    playing = dict(base, is_playing=True, position_seconds=10.0)
    assert snapshot_differs(playing, dict(playing, position_seconds=12.0)) is True
    assert snapshot_differs(playing, dict(playing, title="New")) is True


@pytest.mark.skipif(sys.platform != "win32", reason="Windows shell icon extraction")
def test_shell_icon_extraction_returns_png_data_uri():
    from backend.os_hooks.shell_icons import icon_data_uri

    uri = icon_data_uri(str(Path(sys.executable)))
    assert uri is not None
    assert uri.startswith("data:image/png;base64,")
