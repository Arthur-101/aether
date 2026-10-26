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

DEFAULT_BRAND_NAME = "Aether"
MAX_BRAND_NAME_LENGTH = 24

DEFAULT_CLOCK: Dict[str, Any] = {
    "weather_mode": "auto",
    "weather_city": "",
    "weather_latitude": None,
    "weather_longitude": None,
    "weather_unit": "celsius",
    "weather_label": "",
}

DEFAULT_WALLPAPER: Dict[str, Any] = {
    "folder": "",
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
    "widget_opacity": 0.9,
    "widget_grain": 5,
    "widget_pop": 60,
    "widget_radius": 16,
    "widget_clock_seconds": True,
    "widget_clock_daydate": True,
    "widget_theme": "default",
    "widget_text_color": "",
    "button_primary": "#E8C56B",
    "button_secondary": "#F4DF9A",
    "button_gradient": True,
    "close_on_outside_click": False,
    "auto_hide_pill": False,
    "time_format": "12h",
}

_THEME_MODES = ("system", "light", "dark")
_GLOW_STYLES = ("off", "soft", "glass", "neon", "pulse")
_GLOW_COLORS = ("source", "theme")
_TIME_FORMATS = ("12h", "24h")
_WIDGET_THEMES = ("default", "cozy", "newsprint", "aura", "blueprint")

DEFAULT_TASKBAR_APPS: Dict[str, Any] = {
    "mode": "mirror",
    "pinned": [],
}

DEFAULT_CLOUD_PROVIDERS: Dict[str, Dict[str, str]] = {
    "gemini": {"api_key": "", "model": "gemini-2.5-flash"},
    "groq": {"api_key": "", "model": "llama-3.3-70b-versatile"},
    "openai": {"api_key": "", "model": "gpt-4o-mini"},
    "openrouter": {"api_key": "", "model": "openai/gpt-4o-mini"},
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


def default_wallpaper() -> Dict[str, Any]:
    """Returns a fresh wallpaper section."""
    return dict(DEFAULT_WALLPAPER)


def normalize_brand_name(value: Any) -> str:
    """Keeps the header label to one readable line and backfills the fallback."""
    text = " ".join(str(value or "").split())
    return text[:MAX_BRAND_NAME_LENGTH] or DEFAULT_BRAND_NAME


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


def _clamp_opacity(value: Any, fallback: float, minimum: float = 0.3) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return round(max(minimum, min(1.0, number)), 2)


def _clamp_percent(value: Any, fallback: int) -> int:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return int(round(max(0.0, min(100.0, number))))


def _clamp_pixels(value: Any, fallback: int, limit: int) -> int:
    """Clamps a pixel length, used for the widget corner radius."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return int(round(max(0.0, min(float(limit), number))))


def _as_bool(value: Any, fallback: bool) -> bool:
    return value if isinstance(value, bool) else fallback


def _optional_hex(value: Any) -> str:
    """Accepts a #RGB/#RRGGBB colour, or an empty value for "follow theme"."""
    if not isinstance(value, str):
        return ""
    raw = value.strip()
    if not raw:
        return ""
    return normalize_hex(raw, "")


def normalize_appearance(value: Any) -> Dict[str, Any]:
    """Backfills, clamps, and sanitizes the appearance section."""
    raw = value if isinstance(value, dict) else {}
    theme_mode = str(raw.get("theme_mode") or "").strip().lower()
    glow_style = str(raw.get("glow_style") or "").strip().lower()
    glow_color = str(raw.get("glow_color") or "").strip().lower()
    time_format = str(raw.get("time_format") or "").strip().lower()
    widget_theme = str(raw.get("widget_theme") or "").strip().lower()
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
        "widget_opacity": _clamp_opacity(
            raw.get("widget_opacity"),
            DEFAULT_APPEARANCE["widget_opacity"],
            minimum=0.0,
        ),
        "widget_grain": _clamp_percent(
            raw.get("widget_grain"), DEFAULT_APPEARANCE["widget_grain"]
        ),
        "widget_pop": _clamp_percent(
            raw.get("widget_pop"), DEFAULT_APPEARANCE["widget_pop"]
        ),
        "widget_radius": _clamp_pixels(
            raw.get("widget_radius"), DEFAULT_APPEARANCE["widget_radius"], 32
        ),
        "widget_clock_seconds": _as_bool(
            raw.get("widget_clock_seconds"),
            DEFAULT_APPEARANCE["widget_clock_seconds"],
        ),
        "widget_clock_daydate": _as_bool(
            raw.get("widget_clock_daydate"),
            DEFAULT_APPEARANCE["widget_clock_daydate"],
        ),
        "widget_theme": (
            widget_theme if widget_theme in _WIDGET_THEMES else "default"
        ),
        "widget_text_color": _optional_hex(raw.get("widget_text_color")),
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
        "auto_hide_pill": _as_bool(
            raw.get("auto_hide_pill"),
            DEFAULT_APPEARANCE["auto_hide_pill"],
        ),
        "time_format": (
            time_format if time_format in _TIME_FORMATS else DEFAULT_APPEARANCE["time_format"]
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


def normalize_wallpaper(value: Any) -> Dict[str, Any]:
    """Sanitizes the wallpaper folder. An empty value means no custom folder."""
    raw = value if isinstance(value, dict) else {}
    return {"folder": _optional_text(raw.get("folder"), 260)}


def normalize_ai_provider(value: Any) -> Dict[str, Any]:
    """
    Sanitizes the cloud credential store and migrates the original single key.

    `cloud_providers` keeps one key and model per provider. The legacy
    `api_key` / `cloud_model` fields are mirrored from the selected provider so
    older readers (and QuickChat) keep working unchanged.
    """
    raw = dict(value) if isinstance(value, dict) else {}
    incoming = raw.get("cloud_providers")
    incoming = incoming if isinstance(incoming, dict) else {}

    selected = _optional_text(raw.get("cloud_provider"), 40).lower()
    if selected not in DEFAULT_CLOUD_PROVIDERS:
        selected = "gemini"

    providers = {name: dict(entry) for name, entry in DEFAULT_CLOUD_PROVIDERS.items()}
    for name, entry in incoming.items():
        if name not in providers or not isinstance(entry, dict):
            continue
        providers[name]["api_key"] = _optional_text(entry.get("api_key"), 400)
        providers[name]["model"] = _optional_text(entry.get("model"), 200)

    if not incoming:
        # One-time migration from the pre-0.2 single-key config: keep the
        # selected provider's credentials and drop nothing else.
        legacy_key = _optional_text(raw.get("api_key"), 400)
        legacy_model = _optional_text(raw.get("cloud_model"), 200)
        if legacy_key:
            providers[selected]["api_key"] = legacy_key
        if legacy_model:
            providers[selected]["model"] = legacy_model

    raw["cloud_provider"] = selected
    raw["cloud_providers"] = providers
    raw["api_key"] = providers[selected]["api_key"]
    raw["cloud_model"] = providers[selected]["model"]
    return raw


def normalize_config(config: Any) -> Dict[str, Any]:
    """Returns the config with valid brand/appearance/clock/taskbar sections."""
    normalized = dict(config) if isinstance(config, dict) else {}
    normalized["brand_name"] = normalize_brand_name(normalized.get("brand_name"))
    normalized["ai_provider"] = normalize_ai_provider(normalized.get("ai_provider"))
    normalized["appearance"] = normalize_appearance(normalized.get("appearance"))
    normalized["clock"] = normalize_clock(normalized.get("clock"))
    normalized["taskbar_apps"] = normalize_taskbar_apps(normalized.get("taskbar_apps"))
    normalized["wallpaper"] = normalize_wallpaper(normalized.get("wallpaper"))
    return normalized
