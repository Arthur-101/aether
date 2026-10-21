"""Tests for the notch/appearance config normalization."""

from backend.config_schema import (
    DEFAULT_DASHBOARD_TABS,
    normalize_appearance,
    normalize_clock,
    normalize_config,
    normalize_dashboard_tabs,
    normalize_taskbar_apps,
)


def test_dashboard_tabs_keep_order_and_drop_unknowns():
    tabs = normalize_dashboard_tabs(["stats", "chat", "stats", "unknown", "controls"])
    assert tabs == ["stats", "chat", "controls"]


def test_legacy_today_tab_migrates_without_duplicating():
    tabs = normalize_dashboard_tabs(["controls", "today", "chat", "clock", "stats"])
    assert tabs == ["controls", "clock", "chat", "stats"]
    assert "today" not in DEFAULT_DASHBOARD_TABS
    assert "clock" in DEFAULT_DASHBOARD_TABS


def test_dashboard_tabs_never_empty():
    assert normalize_dashboard_tabs([]) == DEFAULT_DASHBOARD_TABS
    assert normalize_dashboard_tabs(["nope"]) == DEFAULT_DASHBOARD_TABS


def test_appearance_is_clamped_and_sanitized():
    appearance = normalize_appearance(
        {
            "pill_opacity": 0.05,
            "island_opacity": 2,
            "button_primary": "#ABC",
            "button_secondary": "not-a-color",
            "button_gradient": "yes",
            "close_on_outside_click": True,
        }
    )
    assert appearance["pill_opacity"] == 0.3
    assert appearance["island_opacity"] == 1.0
    assert appearance["button_primary"] == "#aabbcc"
    assert appearance["button_secondary"] == "#f4df9a"
    assert appearance["button_gradient"] is True
    assert appearance["close_on_outside_click"] is True


def test_taskbar_mode_and_pins_are_normalized():
    taskbar = normalize_taskbar_apps(
        {
            "mode": "custom",
            "pinned": [
                {"name": "Editor", "path": "C:/Tools/editor.exe"},
                {"name": "", "path": ""},
                "invalid",
            ],
        }
    )
    assert taskbar["mode"] == "custom"
    assert taskbar["pinned"] == [
        {"id": "Editor", "name": "Editor", "path": "C:/Tools/editor.exe"}
    ]

    invalid = normalize_taskbar_apps({"mode": "other", "pinned": None})
    assert invalid == {"mode": "mirror", "pinned": []}


def test_clock_config_is_sanitized_and_backfilled():
    clock = normalize_clock(
        {
            "weather_mode": "manual",
            "weather_city": "  London  ",
            "weather_latitude": 999,
            "weather_longitude": "bad",
            "weather_unit": "kelvin",
        }
    )
    assert clock["weather_mode"] == "manual"
    assert clock["weather_city"] == "London"
    assert clock["weather_latitude"] is None
    assert clock["weather_longitude"] is None
    assert clock["weather_unit"] == "celsius"


def test_normalize_config_adds_sections_without_losing_existing_data():
    config = normalize_config({"storage": {"notes_theme": "meadow"}})
    assert config["storage"]["notes_theme"] == "meadow"
    assert "appearance" in config
    assert config["clock"]["weather_mode"] == "auto"
    assert config["taskbar_apps"]["mode"] == "mirror"
