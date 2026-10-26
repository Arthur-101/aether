"""
Screen-region capture for Region to Ask.

The selector lives in the transparent Aether window, so it cannot read the
desktop pixels behind it from the DOM. The Tauri window is hidden before this
module runs; mss then grabs the real desktop rectangle in physical pixels and
writes a PNG that the existing vision/attachment pipeline can consume.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger("aether.region")

MIN_EDGE = 8
_local = threading.local()


def get_captures_dir() -> Path:
    """Returns the folder that holds Region to Ask screenshots."""
    from ..config_manager import get_app_dir

    directory = get_app_dir() / "captures"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _get_capture():
    """One mss instance per worker thread; it owns a GDI handle."""
    capture = getattr(_local, "capture", None)
    if capture is None:
        import mss

        capture = mss.mss()
        _local.capture = capture
    return capture


def _coerce_rect(
    x: int, y: int, width: int, height: int, capture
) -> Dict[str, int]:
    """Clamps the requested rectangle to the virtual desktop."""
    monitor = capture.monitors[0]
    left = max(int(monitor["left"]), int(x))
    top = max(int(monitor["top"]), int(y))
    right = min(
        int(monitor["left"]) + int(monitor["width"]),
        int(x) + int(width),
    )
    bottom = min(
        int(monitor["top"]) + int(monitor["height"]),
        int(y) + int(height),
    )
    clamped_width = right - left
    clamped_height = bottom - top
    if clamped_width < MIN_EDGE or clamped_height < MIN_EDGE:
        raise ValueError("The selected region is outside the desktop.")
    return {
        "left": left,
        "top": top,
        "width": clamped_width,
        "height": clamped_height,
    }


def capture_region(
    x: int,
    y: int,
    width: int,
    height: int,
    capture: Optional[Any] = None,
) -> Dict[str, Any]:
    """Captures a physical-pixel rectangle and saves it as a PNG.

    Coordinates are absolute virtual-desktop pixels, matching mss and the
    per-monitor DPI-aware backend process.
    """
    if int(width) < MIN_EDGE or int(height) < MIN_EDGE:
        raise ValueError("Drag a larger area to capture.")

    active_capture = capture or _get_capture()
    box = _coerce_rect(int(x), int(y), int(width), int(height), active_capture)

    from PIL import Image

    shot = active_capture.grab(box)
    image = Image.frombytes("RGB", shot.size, shot.rgb)

    stamp = time.strftime("%Y%m%d-%H%M%S")
    suffix = uuid.uuid4().hex[:6]
    path = get_captures_dir() / f"region-{stamp}-{suffix}.png"
    image.save(path, format="PNG", optimize=False)

    logger.info(
        "Captured region %sx%s at (%s, %s) -> %s",
        box["width"],
        box["height"],
        box["left"],
        box["top"],
        path,
    )
    return {
        "file_path": str(path),
        "file_name": path.name,
        "width": box["width"],
        "height": box["height"],
        "x": box["left"],
        "y": box["top"],
    }


__all__ = ["capture_region", "get_captures_dir"]
