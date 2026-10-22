"""
Screen color sampling for the Island's color picker.

The picker overlay lives in a transparent window, so it cannot read the
desktop pixels behind it from the DOM. Windows can: ``mss`` grabs a small
patch around the real cursor, which doubles as the magnifier image and the
center color.
"""

from __future__ import annotations

import base64
import io
import logging
import threading
from typing import Any, Dict

logger = logging.getLogger("aether.color")

DEFAULT_RADIUS = 10
MIN_RADIUS = 4
MAX_RADIUS = 24
_local = threading.local()


def _get_capture():
    """One mss instance per worker thread; it owns a GDI handle."""
    capture = getattr(_local, "capture", None)
    if capture is None:
        import mss

        capture = mss.mss()
        _local.capture = capture
    return capture


def _unavailable(message: str, request_id: str = "") -> Dict[str, Any]:
    return {
        "request_id": request_id,
        "available": False,
        "message": message,
        "x": 0,
        "y": 0,
        "hex": "#000000",
        "rgb": [0, 0, 0],
        "patch": "",
        "patch_width": 0,
        "patch_height": 0,
        "cursor_x": 0,
        "cursor_y": 0,
        "screen_width": 0,
        "screen_height": 0,
    }


def _build_sample(
    image,
    screen_x: int,
    screen_y: int,
    cursor_x: int,
    cursor_y: int,
    request_id: str = "",
    screen_width: int = 0,
    screen_height: int = 0,
) -> Dict[str, Any]:
    """Turns a grabbed RGB image into the compact shape the overlay renders."""
    width, height = image.size
    if width < 1 or height < 1:
        return _unavailable("The screen patch was empty.", request_id)

    x = min(max(int(cursor_x), 0), width - 1)
    y = min(max(int(cursor_y), 0), height - 1)
    red, green, blue = image.getpixel((x, y))[:3]
    red, green, blue = int(red), int(green), int(blue)

    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=False)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return {
        "request_id": request_id,
        "available": True,
        "message": "",
        "x": int(screen_x),
        "y": int(screen_y),
        "hex": f"#{red:02X}{green:02X}{blue:02X}",
        "rgb": [red, green, blue],
        "patch": f"data:image/png;base64,{encoded}",
        "patch_width": width,
        "patch_height": height,
        "cursor_x": x,
        "cursor_y": y,
        "screen_width": int(screen_width),
        "screen_height": int(screen_height),
    }


def sample_at(
    screen_x: int,
    screen_y: int,
    radius: int = DEFAULT_RADIUS,
    capture=None,
    request_id: str = "",
) -> Dict[str, Any]:
    """Samples around a screen point without moving the real cursor.

    The patch is clamped to the virtual desktop, so picking close to an edge
    still works; ``cursor_x``/``cursor_y`` say where the exact pixel sits in
    the returned image.
    """
    size = max(1, min(int(radius), MAX_RADIUS) * 2 + 1)
    left = int(screen_x) - size // 2
    top = int(screen_y) - size // 2

    try:
        from PIL import Image

        capture = capture or _get_capture()
        monitor = capture.monitors[0]
        right = min(monitor["left"] + monitor["width"], left + size)
        bottom = min(monitor["top"] + monitor["height"], top + size)
        left = max(monitor["left"], left)
        top = max(monitor["top"], top)
        if right <= left or bottom <= top:
            return _unavailable("The cursor is outside the desktop.", request_id)

        shot = capture.grab(
            {
                "left": left,
                "top": top,
                "width": right - left,
                "height": bottom - top,
            }
        )
        image = Image.frombytes("RGB", shot.size, shot.rgb)
        return _build_sample(
            image,
            int(screen_x),
            int(screen_y),
            int(screen_x) - left,
            int(screen_y) - top,
            request_id,
            int(monitor["width"]),
            int(monitor["height"]),
        )
    except Exception as exc:  # pragma: no cover - depends on Windows desktop state
        logger.debug("Screen sampling failed: %s", exc)
        return _unavailable("Windows would not share the screen pixels.", request_id)


def sample_screen(radius: int = DEFAULT_RADIUS) -> Dict[str, Any]:
    """Samples the pixel under the real Windows cursor."""
    try:
        import win32api

        x, y = win32api.GetCursorPos()
    except Exception as exc:  # pragma: no cover - non-Windows fallback
        logger.debug("Cursor position unavailable: %s", exc)
        return _unavailable("The cursor position is unavailable.")

    clamped = min(max(int(radius), MIN_RADIUS), MAX_RADIUS)
    return sample_at(int(x), int(y), clamped)


__all__ = ["sample_screen", "sample_at", "DEFAULT_RADIUS"]
