"""
Screen-region capture for Region to Ask.

The selector lives in the transparent Aether window, so it cannot read the
desktop pixels behind it from the DOM. The Tauri window is hidden before this
module runs; mss then grabs the real desktop rectangle in physical pixels and
writes a PNG that the existing vision/attachment pipeline can consume.
"""

from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

logger = logging.getLogger("aether.region")

MIN_EDGE = 8
CAPTURE_PREFIX = "region-"
ORPHAN_MAX_AGE_HOURS = 24
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


def _normalized(path: Any) -> str:
    """Case- and separator-stable key for comparing file paths on Windows."""
    try:
        return os.path.normcase(str(Path(str(path)).resolve()))
    except (OSError, ValueError):
        return os.path.normcase(str(path))


def _referenced_paths(override: Optional[Iterable[str]]) -> set:
    """Attachment paths still in use, or an explicit set for tests."""
    if override is not None:
        return {_normalized(p) for p in override}
    try:
        from ..db.attachments import attachment_paths

        return {_normalized(p) for p in attachment_paths()}
    except Exception:
        logger.debug("Attachment lookup failed; assuming no references")
        return set()


def is_capture_path(path: Any) -> bool:
    """True only for `region-*.png` files inside the captures folder."""
    if not path:
        return False
    name = Path(str(path)).name
    if not name.startswith(CAPTURE_PREFIX) or Path(name).suffix.lower() != ".png":
        return False
    try:
        captures = _normalized(get_captures_dir())
    except OSError:
        return False
    return os.path.dirname(_normalized(path)) == captures


def discard_capture(
    path: Any, referenced_paths: Optional[Iterable[str]] = None
) -> bool:
    """Deletes a Region to Ask PNG once nothing references it.

    Only files under `get_captures_dir()` matching `region-*.png` are eligible,
    so dropped user images are never touched. Returns True when a file was
    removed. When `referenced_paths` is omitted, live attachment rows are read.
    """
    if not is_capture_path(path):
        return False
    target = Path(path).resolve()
    if _normalized(target) in _referenced_paths(referenced_paths):
        return False
    try:
        target.unlink()
        return True
    except OSError as exc:
        logger.debug("Could not delete capture %s: %s", target, exc)
        return False


def sweep_orphan_captures(
    max_age_hours: float = ORPHAN_MAX_AGE_HOURS,
    referenced_paths: Optional[Iterable[str]] = None,
) -> int:
    """Removes stale captures that no attachment row references.

    Runs once at startup rather than on a timer: it catches leftovers from
    crashes, deleted sessions, and captures made before this cleanup existed.
    Returns the number of files removed.
    """
    referenced = _referenced_paths(referenced_paths)
    try:
        directory = get_captures_dir()
    except OSError:
        return 0
    cutoff = time.time() - max(0.0, float(max_age_hours)) * 3600
    removed = 0
    for entry in directory.glob(f"{CAPTURE_PREFIX}*.png"):
        try:
            if entry.stat().st_mtime >= cutoff:
                continue
            if _normalized(entry) in referenced:
                continue
            entry.unlink()
            removed += 1
        except OSError:
            continue
    if removed:
        logger.info("Removed %d orphaned Region to Ask capture(s)", removed)
    return removed


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


__all__ = [
    "capture_region",
    "get_captures_dir",
    "is_capture_path",
    "discard_capture",
    "sweep_orphan_captures",
]
