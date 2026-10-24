"""Builds the taskbar state, including open windows that have no pin."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from ..config_manager import config_manager
from .taskbar_apps import (
    _entry,
    _shortcut_details,
    _stable_id,
    discover_pins,
    pinned_folder,
    resolve_custom,
)
from .taskbar_launch import normalize_path, running_snapshot
from .window_apps import app_id_from_arguments, window_snapshot

_SHORTCUT_CACHE: Dict[str, Optional[Path]] = {}


def _start_menu_roots() -> List[Path]:
    roots: List[Path] = []
    for variable in ("APPDATA", "PROGRAMDATA"):
        base = os.environ.get(variable)
        if not base:
            continue
        root = (
            Path(base)
            / "Microsoft"
            / "Windows"
            / "Start Menu"
            / "Programs"
        )
        if root.exists():
            roots.append(root)
    return roots


def _shortcut_for_app_id(app_id: str) -> Optional[Path]:
    """Finds an installed web app's Start Menu shortcut by app id."""
    key = app_id.casefold()
    if key in _SHORTCUT_CACHE:
        return _SHORTCUT_CACHE[key]
    found: Optional[Path] = None
    for root in _start_menu_roots():
        try:
            candidates = root.rglob("*.lnk")
        except OSError:
            continue
        for candidate in candidates:
            details = _shortcut_details(candidate)
            if app_id_from_arguments(details.get("arguments", "")).casefold() == key:
                found = candidate
                break
        if found is not None:
            break
    _SHORTCUT_CACHE[key] = found
    return found


def _pwa_source(window: Dict[str, Any]) -> Optional[Path]:
    source = str(window.get("source_shortcut") or "").strip()
    if source:
        shortcut = Path(os.path.expandvars(source))
        if shortcut.exists():
            return shortcut
    app_id = str(window.get("app_id") or "").strip()
    shortcut = _shortcut_for_app_id(app_id) if app_id else None
    if shortcut is not None:
        return shortcut
    exe = str(window.get("exe") or "").strip()
    return Path(exe) if exe else None


def _pwa_name(window: Dict[str, Any], source: Path) -> str:
    if source.suffix.lower() == ".lnk":
        return source.stem[:120] or "Web app"
    title = str(window.get("title") or "").strip()
    for separator in (" - ", " | "):
        if separator in title:
            title = title.split(separator, 1)[0]
            break
    return (title or Path(str(window.get("exe") or "")).stem)[:120] or "Web app"


def _window_name(window: Dict[str, Any]) -> str:
    name = Path(str(window.get("process") or "")).stem
    if not name:
        name = Path(str(window.get("exe") or "")).stem
    return name[:120] or "Open app"


def _open_entries(
    pins: Iterable[Dict[str, Any]],
    snapshot: Dict[str, Any],
    with_icons: bool,
    paths: set[str],
    names: set[str],
) -> List[Dict[str, Any]]:
    """Adds unpinned taskbar windows after the pinned apps."""
    pinned_ids = {
        str(app.get("app_id") or "").casefold()
        for app in pins
        if app.get("app_id")
    }
    pinned_targets = {
        normalize_path(str(app.get("target_path") or ""))
        for app in pins
        if app.get("target_path")
    }
    entries: List[Dict[str, Any]] = []
    seen_apps = set()
    seen_exes = set()
    for window in snapshot.get("windows", []):
        app_id = str(window.get("app_id") or "").strip()
        if app_id:
            key = app_id.casefold()
            if key in pinned_ids or key in seen_apps:
                continue
            source = _pwa_source(window)
            if source is None:
                continue
            entry = _entry(
                source,
                _stable_id("open", key),
                configured_name=_pwa_name(window, source),
                with_icon=with_icons,
                paths=paths,
                names=names,
                window_state=snapshot,
            )
            entry["app_id"] = app_id
            entry["running"] = True
            seen_apps.add(key)
        else:
            exe = str(window.get("exe") or "").strip()
            if not exe:
                continue
            key = normalize_path(exe)
            if key in pinned_targets or key in seen_exes:
                continue
            source = Path(exe)
            entry = _entry(
                source,
                _stable_id("open", key),
                configured_name=_window_name(window),
                with_icon=with_icons,
                paths=paths,
                names=names,
                window_state=snapshot,
            )
            entry["running"] = True
            seen_exes.add(key)
        entries.append(entry)
    return entries


def build_taskbar_state(with_icons: bool = True) -> Dict[str, Any]:
    """Builds the single state payload used by the dock and Settings."""
    config = config_manager.get("taskbar_apps") or {}
    mode = "custom" if config.get("mode") == "custom" else "mirror"
    folder = pinned_folder()
    folder_exists = bool(folder and folder.exists())
    paths, names = running_snapshot()
    snapshot = window_snapshot()
    discovered = (
        discover_pins(
            with_icons=with_icons,
            window_state=snapshot,
            paths=paths,
            names=names,
        )
        if folder_exists
        else []
    )
    pinned = resolve_custom(
        config.get("pinned") or [],
        with_icons=with_icons,
        window_state=snapshot,
        paths=paths,
        names=names,
    )
    apps = pinned if mode == "custom" else discovered
    # Match the Windows taskbar in both modes: the configured/pinned deck
    # stays first, while currently open apps that have no corresponding entry
    # are appended after it.  This is especially important for Chromium PWAs:
    # an installed Brave web app shares brave.exe with the browser, but its
    # app-id and shortcut let _open_entries keep it as its own named/iconed
    # item instead of conflating it with the Brave browser entry.
    apps = [
        *apps,
        *_open_entries(apps, snapshot, with_icons, paths, names),
    ]
    if not folder_exists:
        message = "Windows pinned taskbar folder was not found."
    elif mode == "custom" and not apps:
        message = "No custom apps yet. Add apps in Settings."
    elif not apps:
        message = "No pinned apps found. Pin apps in Windows or add them here."
    else:
        message = ""
    return {
        "mode": mode,
        "pinned": pinned,
        "discovered": discovered,
        "apps": apps,
        "available": folder_exists,
        "message": message,
    }


def find_app(state: Dict[str, Any], app_id: str) -> Optional[Dict[str, Any]]:
    wanted = (app_id or "").strip()
    if not wanted:
        return None
    for app in state.get("apps", []):
        if app.get("id") == wanted:
            return app
    return None
