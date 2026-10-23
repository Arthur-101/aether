"""
Wallpaper library, thumbnail cache, and apply action.

The renderer never receives a file-system URL. Each preview is a small JPEG
data URI produced here and cached under the app data directory, so the WebView
does not need file-protocol access to the user's folders.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config_manager import config_manager, get_app_dir

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".gif"}
MAX_RECENT = 16
MAX_FOLDER_ITEMS = 24
THUMB_SIZE = (360, 202)
THUMB_QUALITY = 78
CACHE_VERSION = 1
HISTORY_NAME = "wallpaper_history.json"

_THUMB_LOCK = threading.Lock()


def _history_path() -> Path:
    return get_app_dir() / HISTORY_NAME


def _thumbnail_dir() -> Path:
    path = get_app_dir() / "cache" / "wallpaper-thumbs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _read_history() -> List[str]:
    path = _history_path()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    if not isinstance(raw, list):
        return []
    return [str(item) for item in raw if isinstance(item, str)]


def _write_history(paths: List[str]) -> None:
    path = _history_path()
    temp = path.with_suffix(".tmp")
    try:
        temp.write_text(json.dumps(paths, indent=2), encoding="utf-8")
        temp.replace(path)
    except Exception:
        pass


def _remember(path: str) -> None:
    """Moves an applied wallpaper to the front of the recent list."""
    resolved = str(Path(path).resolve())
    history = [item for item in _read_history() if not _same_path(item, resolved)]
    history.insert(0, resolved)
    _write_history(history[:MAX_RECENT])


def _same_path(left: str, right: str) -> bool:
    if not left or not right:
        return False
    try:
        return os.path.normcase(os.path.abspath(left)) == os.path.normcase(
            os.path.abspath(right)
        )
    except Exception:
        return False


def _is_image(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS


def _thumb_cache_path(path: Path) -> Path:
    stat = path.stat()
    key = (
        f"{CACHE_VERSION}|{path.resolve()}|{stat.st_mtime_ns}|{stat.st_size}|"
        f"{THUMB_SIZE[0]}x{THUMB_SIZE[1]}"
    )
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()
    return _thumbnail_dir() / f"{digest}.jpg"


def _current_wallpaper() -> str:
    from .os_hooks.system_controls import get_desktop_wallpaper

    return get_desktop_wallpaper()


def _set_wallpaper(path: str) -> bool:
    from .os_hooks.system_controls import set_desktop_wallpaper

    return set_desktop_wallpaper(path)


def _thumbnail_data_uri(path: Path) -> str:
    """Returns a cached JPEG data URI, or an empty string if unreadable."""
    try:
        from PIL import Image, ImageOps

        cache_path = _thumb_cache_path(path)
        if not cache_path.exists():
            with _THUMB_LOCK:
                if not cache_path.exists():
                    with Image.open(path) as source:
                        image = ImageOps.exif_transpose(source).convert("RGB")
                        image = ImageOps.fit(
                            image,
                            THUMB_SIZE,
                            method=Image.Resampling.LANCZOS,
                        )
                        buffer = io.BytesIO()
                        image.save(
                            buffer,
                            format="JPEG",
                            quality=THUMB_QUALITY,
                            optimize=True,
                        )
                    temp = cache_path.with_suffix(".tmp")
                    temp.write_bytes(buffer.getvalue())
                    temp.replace(cache_path)
        encoded = base64.b64encode(cache_path.read_bytes()).decode("ascii")
        return f"data:image/jpeg;base64,{encoded}"
    except Exception:
        return ""


def _item(path: Path, current: str) -> Dict[str, Any]:
    try:
        modified = int(path.stat().st_mtime)
    except Exception:
        modified = 0
    return {
        "path": str(path),
        "name": path.name or "Current wallpaper",
        "thumbnail": _thumbnail_data_uri(path),
        "modified": modified,
        "is_current": _same_path(str(path), current),
    }


def _recent_items(current: str) -> List[Dict[str, Any]]:
    paths: List[str] = []
    if current:
        paths.append(current)
    for item in _read_history():
        if not any(_same_path(item, existing) for existing in paths):
            paths.append(item)

    items: List[Dict[str, Any]] = []
    for raw in paths:
        path = Path(raw)
        if not _is_image(path) and not _same_path(raw, current):
            continue
        if not path.is_file():
            continue
        items.append(_item(path, current))
        if len(items) >= MAX_RECENT:
            break
    return items


def _folder_items(folder: str, current: str) -> List[Dict[str, Any]]:
    root = Path(folder)
    if not folder or not root.is_dir():
        return []
    try:
        candidates = [path for path in root.iterdir() if _is_image(path)]
    except Exception:
        return []

    def modified(path: Path) -> float:
        try:
            return path.stat().st_mtime
        except Exception:
            return 0.0

    candidates.sort(key=modified, reverse=True)
    return [_item(path, current) for path in candidates[:MAX_FOLDER_ITEMS]]


def build_wallpaper_state() -> Dict[str, Any]:
    """Builds the full payload for the Wallpaper tab."""
    current = _current_wallpaper()
    folder = str(config_manager.get("wallpaper", "folder", "") or "").strip()
    recent = _recent_items(current)
    folder_items = _folder_items(folder, current)
    available = bool(recent or folder_items)

    if not available:
        message = "No wallpapers found yet. Choose a folder to browse your own."
    elif not folder:
        message = "Choose a folder to browse your own wallpapers."
    else:
        message = ""

    return {
        "current": current,
        "current_name": Path(current).name if current else "",
        "recent": recent,
        "folder": folder_items,
        "folder_path": folder,
        "available": available,
        "message": message,
    }


def validate_wallpaper_path(path: str) -> Optional[str]:
    """Returns an error message, or None when the path is a usable image."""
    if not path:
        return "No wallpaper was selected."
    candidate = Path(path)
    if not candidate.is_file():
        return "That wallpaper file no longer exists."
    if candidate.suffix.lower() not in IMAGE_EXTENSIONS:
        if not _same_path(str(candidate), _current_wallpaper()):
            return "That file is not a supported image."
    return None


def apply_wallpaper(path: str) -> Dict[str, Any]:
    """Applies a wallpaper and returns the result. Runs off the event loop."""
    error = validate_wallpaper_path(path)
    if error:
        return {"ok": False, "path": path, "message": error}

    resolved = str(Path(path).resolve())
    previous = _current_wallpaper()
    if not _set_wallpaper(resolved):
        return {
            "ok": False,
            "path": resolved,
            "message": "Windows rejected the wallpaper change.",
        }
    # Keep the outgoing wallpaper in Recent so the user can switch back to it.
    if previous and not _same_path(previous, resolved) and _is_image(Path(previous)):
        _remember(previous)
    _remember(resolved)
    return {"ok": True, "path": resolved, "message": "Wallpaper applied."}
