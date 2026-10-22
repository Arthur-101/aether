"""
Primary display geometry for the Island's Display panel.

``EnumDisplaySettings`` reports the mode the desktop is actually running at,
so the readout stays honest when the user changes resolution or refresh rate
outside Aether.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

logger = logging.getLogger("aether.display")

_CACHE_SECONDS = 3.0
_cache: Dict[str, Any] = {"value": None, "ts": 0.0}


def _read_display() -> Dict[str, Any]:
    try:
        import win32api
        import win32con
    except ImportError:  # pragma: no cover - non-Windows environments
        return {}

    try:
        device = win32api.EnumDisplayDevices()
        settings = win32api.EnumDisplaySettings(
            device.DeviceName, win32con.ENUM_CURRENT_SETTINGS
        )
    except Exception as exc:
        logger.debug("Display enumeration failed: %s", exc)
        return {}

    return {
        "name": getattr(device, "DeviceString", "") or "",
        "width": int(getattr(settings, "PelsWidth", 0) or 0),
        "height": int(getattr(settings, "PelsHeight", 0) or 0),
        "refresh_hz": int(getattr(settings, "DisplayFrequency", 0) or 0),
    }


def get_display_info() -> Dict[str, Any]:
    """Returns the primary display's name, resolution and refresh rate."""
    import time

    now = time.time()
    cached = _cache.get("value")
    if cached is not None and now - float(_cache["ts"]) < _CACHE_SECONDS:
        return dict(cached)  # type: ignore[arg-type]

    value = _read_display()
    if not value:
        return {}
    _cache.update({"value": value, "ts": time.time()})
    return dict(value)


__all__ = ["get_display_info"]
