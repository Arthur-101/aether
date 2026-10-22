"""Windows taskbar pin discovery, mirror/custom resolution, and app state."""

from __future__ import annotations

import hashlib
import logging
import os
import threading
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .shell_icons import icon_data_uri
from .taskbar_icons import resolve_icon, split_icon_location, target_from_icon
from .taskbar_launch import normalize_path, running_snapshot
from .taskbar_order import pinned_shortcut_order
from .window_apps import app_id_from_arguments

logger = logging.getLogger("aether.taskbar")
_COM_LOCAL = threading.local()
_PIN_PARTS = (
    "Microsoft",
    "Internet Explorer",
    "Quick Launch",
    "User Pinned",
    "TaskBar",
)
_APP_EXTENSIONS = {".lnk", ".url", ".exe"}


def _stable_id(prefix: str, path: str) -> str:
    digest = hashlib.sha1(normalize_path(path).encode("utf-8")).hexdigest()[:14]
    return f"{prefix}:{digest}"


def pinned_folder() -> Optional[Path]:
    appdata = os.environ.get("APPDATA")
    if not appdata:
        return None
    return Path(appdata).joinpath(*_PIN_PARTS)


def _shortcut_details(path: Path) -> Dict[str, str]:
    """Reads target, arguments, and icon metadata from a .lnk shortcut."""
    try:
        import pythoncom
        import win32com.client

        if not getattr(_COM_LOCAL, "ready", False):
            pythoncom.CoInitialize()
            _COM_LOCAL.ready = True
        shell = getattr(_COM_LOCAL, "shell", None)
        if shell is None:
            shell = win32com.client.Dispatch("WScript.Shell")
            _COM_LOCAL.shell = shell
        shortcut = shell.CreateShortcut(str(path))
        return {
            "target": os.path.expandvars(str(shortcut.TargetPath or "")),
            "arguments": str(shortcut.Arguments or ""),
            "icon": str(shortcut.IconLocation or ""),
            "description": str(shortcut.Description or ""),
        }
    except Exception as exc:
        logger.debug("Shortcut resolution failed for %s: %s", path, exc)
        return {}


def _display_name(source: Path, configured: str = "") -> str:
    name = (configured or "").strip()
    if name:
        return name[:120]
    return (source.stem or source.name).strip()[:120]


def _running_state(
    target: str,
    paths: set[str],
    names: set[str],
    app_id: str = "",
    window_state: Optional[Dict[str, Any]] = None,
) -> Optional[bool]:
    if app_id:
        # A web app shares its browser executable, so only its app id proves
        # that this particular installed app is the one running.
        return bool(
            window_state and app_id.casefold() in window_state.get("pwa_ids", set())
        )
    if not target:
        return None
    normalized = normalize_path(target)
    if window_state is not None:
        windows = window_state.get("by_exe", {}).get(normalized, [])
        if windows:
            # A browser running only a web-app window is not the browser pin.
            # A real browser window (tab strip) counts, even when the process
            # also hosts a web app.
            return any(not window.get("pwa") for window in windows)
    if Path(target).name.lower() == "explorer.exe":
        # explorer.exe is always running as the shell; only a folder window
        # proves the pinned File Explorer entry is in use. Omit rather than lie.
        return None
    if normalized in paths:
        return True
    if Path(target).stem.lower() in names:
        return True
    return False


def _entry(
    source: Path,
    app_id: str,
    configured_name: str = "",
    with_icon: bool = True,
    paths: Optional[set[str]] = None,
    names: Optional[set[str]] = None,
    window_state: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    expanded = Path(os.path.expandvars(str(source)))
    details = _shortcut_details(expanded) if expanded.suffix.lower() == ".lnk" else {}
    target = details.get("target", "") if expanded.suffix.lower() == ".lnk" else str(expanded)
    icon_location = details.get("icon", "")
    arguments = details.get("arguments", "")
    if not target:
        # Some shell shortcuts carry no target and only name their icon path.
        # The icon path is the real executable, so it can stand in.
        target = target_from_icon(icon_location)
    web_app_id = app_id_from_arguments(arguments)
    missing = not expanded.exists() or bool(
        target and not Path(target).exists()
    )
    running = (
        _running_state(
            target,
            paths or set(),
            names or set(),
            app_id=web_app_id,
            window_state=window_state,
        )
        if target
        else None
    )
    entry: Dict[str, Any] = {
        "id": app_id,
        "name": _display_name(expanded, configured_name),
        "path": str(expanded),
        "target_path": target,
        "arguments": arguments,
        "running": running,
        "missing": missing,
    }
    if web_app_id:
        entry["app_id"] = web_app_id
    if with_icon:
        entry["icon"] = resolve_icon(expanded, target, icon_location)
    return entry


def discover_pins(
    with_icons: bool = True,
    window_state: Optional[Dict[str, Any]] = None,
    paths: Optional[set[str]] = None,
    names: Optional[set[str]] = None,
) -> List[Dict[str, Any]]:
    """Enumerates and resolves shortcuts from the Windows pinned TaskBar folder."""
    folder = pinned_folder()
    if not folder or not folder.exists():
        return []
    try:
        shortcuts = [
            item
            for item in folder.iterdir()
            if item.suffix.lower() in _APP_EXTENSIONS and item.is_file()
        ]
    except OSError as exc:
        logger.warning("Could not read pinned taskbar folder: %s", exc)
        return []
    shortcuts = pinned_shortcut_order(folder, shortcuts)
    if paths is None or names is None:
        paths, names = running_snapshot()
    apps = []
    for shortcut in shortcuts:
        apps.append(
            _entry(
                shortcut,
                _stable_id("pin", str(shortcut)),
                with_icon=with_icons,
                paths=paths,
                names=names,
                window_state=window_state,
            )
        )
    return apps


def resolve_custom(
    pinned: Iterable[Dict[str, Any]],
    with_icons: bool = True,
    window_state: Optional[Dict[str, Any]] = None,
    paths: Optional[set[str]] = None,
    names: Optional[set[str]] = None,
) -> List[Dict[str, Any]]:
    if paths is None or names is None:
        paths, names = running_snapshot()
    apps = []
    for item in pinned:
        if not isinstance(item, dict):
            continue
        raw_path = str(item.get("path") or "").strip()
        if not raw_path:
            continue
        source = Path(os.path.expandvars(raw_path))
        app_id = str(item.get("id") or "").strip() or _stable_id("custom", str(source))
        apps.append(
            _entry(
                source,
                app_id,
                configured_name=str(item.get("name") or ""),
                with_icon=with_icons,
                paths=paths,
                names=names,
                window_state=window_state,
            )
        )
    return apps
