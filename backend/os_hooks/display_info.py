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
_physical_mm: Dict[str, int] | None = None


def _read_physical_size() -> Dict[str, int]:
    """EDID's active-panel size, used by the on-screen scale tool.

    Windows exposes the panel size through root\\wmi rather than the display
    mode: ``MaxHorizontalImageSize`` and ``MaxVerticalImageSize`` are in
    centimetres. Some virtual displays report zero, so the caller falls back
    to the standard 96 CSS px/inch calibration when these fields are absent.
    """
    global _physical_mm
    if _physical_mm is not None:
        return _physical_mm

    try:
        import win32com.client
    except ImportError:  # pragma: no cover - non-Windows environments
        _physical_mm = {}
        return _physical_mm

    try:
        locator = win32com.client.Dispatch("WbemScripting.SWbemLocator")
        service = locator.ConnectServer(".", "root\\wmi")
        monitors = service.ExecQuery(
            "SELECT MaxHorizontalImageSize, MaxVerticalImageSize "
            "FROM WmiMonitorBasicDisplayParams"
        )
        for monitor in monitors:
            width_cm = int(getattr(monitor, "MaxHorizontalImageSize", 0) or 0)
            height_cm = int(getattr(monitor, "MaxVerticalImageSize", 0) or 0)
            if width_cm > 0 and height_cm > 0:
                _physical_mm = {"width_mm": width_cm * 10, "height_mm": height_cm * 10}
                return _physical_mm
    except Exception as exc:
        logger.debug("Display physical size unavailable: %s", exc)

    _physical_mm = {}
    return _physical_mm


def _read_display() -> Dict[str, Any]:
    try:
        import win32api
        import win32con
    except ImportError:  # pragma: no cover - non-Windows environments
        return {}

    try:
        device = win32api.EnumDisplayDevices()
    except Exception as exc:
        logger.debug("Display adapter enumeration failed: %s", exc)
        device = None

    # pywin32 on some Intel drivers rejects ENUM_CURRENT_SETTINGS for the
    # explicit \\.\DISPLAY1 name but accepts None (the default display).
    settings = None
    for device_name in (None, getattr(device, "DeviceName", None)):
        try:
            settings = win32api.EnumDisplaySettings(
                device_name, win32con.ENUM_CURRENT_SETTINGS
            )
            break
        except Exception:
            continue

    width = int(getattr(settings, "PelsWidth", 0) or 0)
    height = int(getattr(settings, "PelsHeight", 0) or 0)
    if width <= 0 or height <= 0:
        try:
            width = int(win32api.GetSystemMetrics(0) or 0)
            height = int(win32api.GetSystemMetrics(1) or 0)
        except Exception as exc:
            logger.debug("Display mode enumeration failed: %s", exc)
            return {}

    result: Dict[str, Any] = {
        "name": getattr(device, "DeviceString", "") or "",
        "width": width,
        "height": height,
        "refresh_hz": int(getattr(settings, "DisplayFrequency", 0) or 0),
    }
    result.update(_read_physical_size())
    return result


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
