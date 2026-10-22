"""
Normalization helpers for notch / appearance configuration.

Kept separate from config_manager.py so validation is testable without touching
the user's real %APPDATA% directory.
"""

import re
from typing import Any, Dict, List

DEFAULT_DASHBOARD_TABS: List[str] = [
    "controls",
    "chat",
    "clock",
    "stats",
    "notes",
    "wallpaper",
    "power",
]
VALID_DASHBOARD_TABS = frozenset(DEFAULT_DASHBOARD_TABS)

DEFAULT_CLOCK: Dict[str, Any] = {
    "weather_mode": "auto",
    "weather_city": "",
    "weather_latitude": None,
    "weather_longitude": None,
    "weather_unit": "celsius",
    "weather_label": "",
}

DEFAULT_APPEARANCE: Dict[str, Any] = {
    "dashboard_tabs": list(DEFAULT_DASHBOARD_TABS),
    "theme_mode": "system",
    "glow_style": "glass",
    "glow_color": "source",
    "pill_opacity": 0.88,
    "island_opacity": 0.92,
    "pill_grain": 5,
    "island_grain": 5,
    "pill_pop": 60,
    "island_pop": 60,
    "button_primary": "#E8C56B",
    "button_secondary": "#F4DF9A",
    "button_gradient": True,
    "close_on_outside_click": False,
}

_THEME_MODES = ("system", "light", "dark")
_GLOW_STYLES = ("off", "soft", "glass", "neon", "pulse")
_GLOW_COLORS = ("source", "theme")

DEFAULT_TASKBAR_APPS: Dict[str, Any] = {
    "mode": "mirror",
    "pinned": [],
}

_HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def default_appearance() -> Dict[str, Any]:
    """Returns a fresh appearance section with a copied tab list."""
    return {**DEFAULT_APPEARANCE, "dashboard_tabs": list(DEFAULT_DASHBOARD_TABS)}


def default_taskbar_apps() -> Dict[str, Any]:
    """Returns a fresh taskbar-apps section."""
    return {"mode": "mirror", "pinned": []}


def default_clock() -> Dict[str, Any]:
    """Returns a fresh clock/weather section."""
    return dict(DEFAULT_CLOCK)


def _migrate_tab_id(tab_id: str) -> str:
    """Maps the retired Today id onto the combined Clock & Tasks tab."""
    return "clock" if tab_id == "today" else tab_id


def normalize_dashboard_tabs(value: Any) -> List[str]:
    """Keeps known, unique tab ids in order. Migrates legacy `today`."""
    if not isinstance(value, list):
        return list(DEFAULT_DASHBOARD_TABS)

    seen = set()
    tabs: List[str] = []
    for raw in value:
        if not isinstance(raw, str):
            continue
        tab_id = _migrate_tab_id(raw.strip())
        if tab_id not in VALID_DASHBOARD_TABS or tab_id in seen:
            continue
        seen.add(tab_id)
        tabs.append(tab_id)
    return tabs or list(DEFAULT_DASHBOARD_TABS)


def normalize_hex(value: Any, fallback: str) -> str:
    """Accepts #RGB / #RRGGBB and returns a lowercase #RRGGBB value."""
    if not isinstance(value, str):
        return fallback.lower()
    raw = value.strip()
    if not _HEX_RE.match(raw):
        return fallback.lower()
    if len(raw) == 4:
        raw = "#" + "".join(char * 2 for char in raw[1:])
    return raw.lower()


def _clamp_opacity(value: Any, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return round(max(0.3, min(1.0, number)), 2)


def _clamp_percent(value: Any, fallback: int) -> int:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return int(round(max(0.0, min(100.0, number))))


def _as_bool(value: Any, fallback: bool) -> bool:
    return value if isinstance(value, bool) else fallback


def normalize_appearance(value: Any) -> Dict[str, Any]:
    """Backfills, clamps, and sanitizes the appearance section."""
    raw = value if isinstance(value, dict) else {}
    theme_mode = str(raw.get("theme_mode") or "").strip().lower()
    glow_style = str(raw.get("glow_style") or "").strip().lower()
    glow_color = str(raw.get("glow_color") or "").strip().lower()
    return {
        "dashboard_tabs": normalize_dashboard_tabs(raw.get("dashboard_tabs")),
        "theme_mode": (
            theme_mode if theme_mode in _THEME_MODES else DEFAULT_APPEARANCE["theme_mode"]
        ),
        "glow_style": (
            glow_style if glow_style in _GLOW_STYLES else DEFAULT_APPEARANCE["glow_style"]
        ),
        "glow_color": (
            glow_color if glow_color in _GLOW_COLORS else DEFAULT_APPEARANCE["glow_color"]
        ),
        "pill_opacity": _clamp_opacity(
            raw.get("pill_opacity"), DEFAULT_APPEARANCE["pill_opacity"]
        ),
        "island_opacity": _clamp_opacity(
            raw.get("island_opacity"), DEFAULT_APPEARANCE["island_opacity"]
        ),
        "pill_grain": _clamp_percent(
            raw.get("pill_grain"), DEFAULT_APPEARANCE["pill_grain"]
        ),
        "island_grain": _clamp_percent(
            raw.get("island_grain"), DEFAULT_APPEARANCE["island_grain"]
        ),
        "pill_pop": _clamp_percent(
            raw.get("pill_pop"), DEFAULT_APPEARANCE["pill_pop"]
        ),
        "island_pop": _clamp_percent(
            raw.get("island_pop"), DEFAULT_APPEARANCE["island_pop"]
        ),
        "button_primary": normalize_hex(
            raw.get("button_primary"), DEFAULT_APPEARANCE["button_primary"]
        ),
        "button_secondary": normalize_hex(
            raw.get("button_secondary"), DEFAULT_APPEARANCE["button_secondary"]
        ),
        "button_gradient": _as_bool(
            raw.get("button_gradient"), DEFAULT_APPEARANCE["button_gradient"]
        ),
        "close_on_outside_click": _as_bool(
            raw.get("close_on_outside_click"),
            DEFAULT_APPEARANCE["close_on_outside_click"],
        ),
    }


def _normalize_pinned_apps(value: Any) -> List[Dict[str, str]]:
    if not isinstance(value, list):
        return []
    apps: List[Dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path") or "").strip()
        name = str(item.get("name") or "").strip()
        if not path and not name:
            continue
        app_id = str(item.get("id") or "").strip() or name or path
        apps.append({"id": app_id, "name": name or path, "path": path})
    return apps


def normalize_taskbar_apps(value: Any) -> Dict[str, Any]:
    """Sanitizes mirror/custom mode and pinned-app entries."""
    raw = value if isinstance(value, dict) else {}
    mode = raw.get("mode")
    if mode not in {"mirror", "custom"}:
        mode = "mirror"
    return {"mode": mode, "pinned": _normalize_pinned_apps(raw.get("pinned"))}


def _optional_float(value: Any, low: float, high: float) -> Any:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not low <= number <= high:
        return None
    return round(number, 6)


def _optional_text(value: Any, limit: int = 120) -> str:
    return str(value or "").strip()[:limit]


def normalize_clock(value: Any) -> Dict[str, Any]:
    """Sanitizes the weather/timer configuration section."""
    raw = value if isinstance(value, dict) else {}
    mode = raw.get("weather_mode")
    if mode not in {"auto", "manual"}:
        mode = DEFAULT_CLOCK["weather_mode"]
    unit = raw.get("weather_unit")
    if unit not in {"celsius", "fahrenheit"}:
        unit = DEFAULT_CLOCK["weather_unit"]
    return {
        "weather_mode": mode,
        "weather_city": _optional_text(raw.get("weather_city")),
        "weather_latitude": _optional_float(raw.get("weather_latitude"), -90, 90),
        "weather_longitude": _optional_float(
            raw.get("weather_longitude"), -180, 180
        ),
        "weather_unit": unit,
        "weather_label": _optional_text(raw.get("weather_label")),
    }


def normalize_config(config: Any) -> Dict[str, Any]:
    """Returns the config with valid appearance/clock/taskbar sections."""
    normalized = dict(config) if isinstance(config, dict) else {}
    normalized["appearance"] = normalize_appearance(normalized.get("appearance"))
    normalized["clock"] = normalize_clock(normalized.get("clock"))
    normalized["taskbar_apps"] = normalize_taskbar_apps(normalized.get("taskbar_apps"))
    return normalized
