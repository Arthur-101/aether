"""T8 system tools: formatting, clamping, permissions, and dispatch wiring."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.mcp_tools import system_tools, tool_permissions
from backend.mcp_tools.server import (
    TOOL_DISPATCH,
    execute_tool,
    get_openai_tool_schemas,
)
from backend.tool_groups import LEAN_ENABLED_TOOL_GROUPS, TOOL_GROUP_IDS

SYSTEM_TOOLS = {
    "get_system_stats",
    "set_volume",
    "set_mute",
    "set_brightness",
    "set_wifi",
    "set_bluetooth",
}


def test_system_tools_are_registered_and_grouped():
    assert SYSTEM_TOOLS <= set(TOOL_DISPATCH)
    all_names = {schema["function"]["name"] for schema in get_openai_tool_schemas()}
    assert SYSTEM_TOOLS <= all_names
    assert all(
        tool_permissions.tool_permission(name).group == "system"
        for name in SYSTEM_TOOLS
    )
    assert "system" in TOOL_GROUP_IDS
    assert "system" not in LEAN_ENABLED_TOOL_GROUPS


def test_system_schemas_are_filtered_with_their_group():
    notes_only = {
        schema["function"]["name"]
        for schema in get_openai_tool_schemas(["notes"])
    }
    assert not (SYSTEM_TOOLS & notes_only)
    result = execute_tool("get_system_stats", {}, enabled_groups=["notes"])
    assert result.startswith("Error")
    assert "disabled" in result.lower()


def test_only_mute_and_radios_require_approval():
    for name in ("set_mute", "set_wifi", "set_bluetooth"):
        assert tool_permissions.tool_permission(name).risk == "system"
        assert tool_permissions.requires_approval(name) is True

    for name in ("get_system_stats", "set_volume", "set_brightness"):
        assert tool_permissions.requires_approval(name) is False

    assert tool_permissions.tool_permission("get_system_stats").risk == "read"
    assert tool_permissions.tool_permission("set_volume").risk == "write"
    assert tool_permissions.tool_permission("set_brightness").risk == "write"


def test_set_volume_converts_percent_and_clamps(monkeypatch):
    seen = []
    monkeypatch.setattr(
        system_tools.system_controls,
        "set_master_volume",
        lambda level: seen.append(level) or level,
    )

    assert system_tools.set_volume(65) == "System volume set to 65%."
    assert seen == [0.65]

    assert system_tools.set_volume(150) == "System volume set to 100%."
    assert seen[-1] == 1.0

    assert system_tools.set_volume(-5) == "System volume set to 0%."
    assert seen[-1] == 0.0


def test_set_volume_rejects_non_numeric_level():
    with pytest.raises(ValueError, match="0 to 100"):
        system_tools.set_volume("loud")


def test_set_mute_reports_state(monkeypatch):
    monkeypatch.setattr(
        system_tools.system_controls,
        "set_mute_state",
        lambda muted: muted,
    )

    assert system_tools.set_mute(True) == "System audio muted."
    assert system_tools.set_mute(False) == "System audio unmuted."
    assert system_tools.set_mute("false") == "System audio unmuted."


def test_set_brightness_clamps(monkeypatch):
    seen = []
    monkeypatch.setattr(
        system_tools.brightness_controls,
        "set_brightness",
        lambda level: seen.append(level) or level,
    )

    assert system_tools.set_brightness(72) == "Brightness set to 72%."
    assert system_tools.set_brightness(250) == "Brightness set to 100%."
    assert seen == [72, 100]


def test_radio_changes_report_denial(monkeypatch):
    monkeypatch.setattr(
        system_tools.network_controls, "set_wifi_enabled", lambda enabled: False
    )
    assert "did not allow" in system_tools.set_wifi(False).lower()

    monkeypatch.setattr(
        system_tools.network_controls, "set_wifi_enabled", lambda enabled: True
    )
    assert system_tools.set_wifi(True) == "Wi-Fi turned on."

    monkeypatch.setattr(
        system_tools.network_controls, "set_bluetooth_enabled", lambda enabled: False
    )
    assert "did not allow" in system_tools.set_bluetooth(False).lower()

    monkeypatch.setattr(
        system_tools.network_controls, "set_bluetooth_enabled", lambda enabled: True
    )
    assert system_tools.set_bluetooth(False) == "Bluetooth turned off."


def test_system_stats_formatting(monkeypatch):
    monkeypatch.setattr(
        system_tools.system_controls,
        "get_system_telemetry",
        lambda: {
            "cpu_percent": 12.5,
            "cpu_cores": 8,
            "cpu_threads": 16,
            "ram_percent": 43.1,
            "ram_used_gb": 6.9,
            "ram_total_gb": 15.9,
            "disk_percent": 55.2,
            "disk_used_gb": 255.0,
            "disk_total_gb": 476.9,
            "gpu_name": "NVIDIA GeForce RTX 3060",
            "gpu_percent": 12.4,
            "gpu_vram_used_gb": 1.2,
            "gpu_vram_total_gb": 6.0,
            "gpu_temp_c": 48.2,
            "volume": 0.65,
            "muted": False,
            "brightness": 70,
            "wifi": True,
            "wifi_ssid": "HomeNet",
            "bluetooth": True,
            "bluetooth_device": "WH-1000XM5",
            "airplane_mode": False,
            "hotspot": None,
            "uptime_seconds": 93720,
            "dark_mode": True,
        },
    )

    class Battery:
        percent = 82.4
        power_plugged = True

    monkeypatch.setattr(system_tools.psutil, "sensors_battery", lambda: Battery())

    text = system_tools.get_system_stats()
    assert "CPU: 12.5% (8 cores / 16 threads)" in text
    assert "RAM: 43.1% used (6.9 of 15.9 GB)" in text
    assert "Disk (C:): 55.2% used (255.0 of 476.9 GB)" in text
    assert "GPU: NVIDIA GeForce RTX 3060 · 12% · 1.2 of 6.0 GB VRAM · 48°C" in text
    assert "Battery: 82% · plugged in" in text
    assert "Volume: 65% · not muted" in text
    assert "Brightness: 70%" in text
    assert 'Wi-Fi: on · "HomeNet"' in text
    assert 'Bluetooth: on · "WH-1000XM5"' in text
    assert "Airplane mode: off" in text
    assert "Mobile hotspot: unknown" in text
    assert "Uptime: 1d 2h 2m" in text
    assert "Dark mode: on" in text


def test_execute_tool_dispatches_system_tools(monkeypatch):
    seen = []
    monkeypatch.setattr(
        system_tools.system_controls,
        "set_master_volume",
        lambda level: seen.append(level) or level,
    )

    result = execute_tool(
        "set_volume",
        {"level": 40},
        enabled_groups=TOOL_GROUP_IDS,
        disabled_tools=[],
    )

    assert result == "System volume set to 40%."
    assert seen == [0.4]
