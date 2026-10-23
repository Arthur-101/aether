"""Tests for the notch/appearance config normalization."""

from backend.config_schema import (
    DEFAULT_BRAND_NAME,
    DEFAULT_DASHBOARD_TABS,
    MAX_BRAND_NAME_LENGTH,
    normalize_appearance,
    normalize_brand_name,
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
            "auto_hide_pill": True,
        }
    )
    assert appearance["pill_opacity"] == 0.3
    assert appearance["island_opacity"] == 1.0
    assert appearance["button_primary"] == "#aabbcc"
    assert appearance["button_secondary"] == "#f4df9a"
    assert appearance["button_gradient"] is True
    assert appearance["close_on_outside_click"] is True
    assert appearance["auto_hide_pill"] is True


def test_appearance_grain_and_pop_are_clamped_and_backfilled():
    appearance = normalize_appearance(
        {
            "pill_grain": -12,
            "island_grain": 999,
            "pill_pop": "12.6",
            "island_pop": "bad",
        }
    )
    assert appearance["pill_grain"] == 0
    assert appearance["island_grain"] == 100
    assert appearance["pill_pop"] == 13
    assert appearance["island_pop"] == 60

    defaults = normalize_appearance({})
    assert defaults["pill_grain"] == 5
    assert defaults["island_grain"] == 5
    assert defaults["pill_pop"] == 60
    assert defaults["island_pop"] == 60


def test_appearance_no_longer_carries_blur_fields():
    appearance = normalize_appearance({"pill_blur": 30, "island_blur": 30})
    assert "pill_blur" not in appearance
    assert "island_blur" not in appearance


def test_theme_mode_defaults_to_system_and_rejects_nonsense():
    """The overlay follows the Windows theme unless the user overrides it."""
    assert normalize_appearance({})["theme_mode"] == "system"
    assert normalize_appearance({"theme_mode": "light"})["theme_mode"] == "light"
    assert normalize_appearance({"theme_mode": "dark"})["theme_mode"] == "dark"
    assert normalize_appearance({"theme_mode": "neon"})["theme_mode"] == "system"
    assert normalize_appearance({"theme_mode": None})["theme_mode"] == "system"


def test_time_format_defaults_to_12h_and_accepts_24h():
    assert normalize_appearance({})["time_format"] == "12h"
    assert normalize_appearance({"time_format": "12h"})["time_format"] == "12h"
    assert normalize_appearance({"time_format": "24h"})["time_format"] == "24h"
    assert normalize_appearance({"time_format": "military"})["time_format"] == "12h"
    assert normalize_appearance({"time_format": None})["time_format"] == "12h"


def test_auto_hide_pill_defaults_off_and_requires_a_boolean():
    assert normalize_appearance({})["auto_hide_pill"] is False
    assert normalize_appearance({"auto_hide_pill": True})["auto_hide_pill"] is True
    assert normalize_appearance({"auto_hide_pill": "yes"})["auto_hide_pill"] is False


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


def test_brand_name_is_trimmed_limited_and_backfilled():
    assert normalize_brand_name("  Studio   Aether  ") == "Studio Aether"
    assert normalize_brand_name("") == DEFAULT_BRAND_NAME
    assert normalize_brand_name(None) == DEFAULT_BRAND_NAME
    assert len(normalize_brand_name("x" * 80)) == MAX_BRAND_NAME_LENGTH


def test_normalize_config_adds_sections_without_losing_existing_data():
    config = normalize_config({"storage": {"notes_theme": "meadow"}})
    assert config["storage"]["notes_theme"] == "meadow"
    assert config["brand_name"] == DEFAULT_BRAND_NAME
    assert "appearance" in config
    assert config["clock"]["weather_mode"] == "auto"
    assert config["taskbar_apps"]["mode"] == "mirror"
