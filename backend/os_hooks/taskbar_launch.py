"""Safe taskbar app launching and focus handling for Windows."""

from __future__ import annotations

import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, Set, Tuple

import psutil

from .window_apps import matching_windows
from .window_focus import (
    explorer_windows,
    focus_window,
    window_handles,
)

logger = logging.getLogger("aether.taskbar.launch")


def normalize_path(value: str) -> str:
    """Normalizes a Windows path for comparisons without shell expansion."""
    return os.path.normcase(
        os.path.normpath(os.path.expandvars(value.strip().strip('"')))
    )


def running_snapshot() -> Tuple[Set[str], Set[str]]:
    """Returns currently running executable paths and base names."""
    paths: Set[str] = set()
    names: Set[str] = set()
    for process in psutil.process_iter(["exe", "name"]):
        try:
            info = process.info
            exe = info.get("exe") or ""
            name = info.get("name") or ""
            if exe:
                paths.add(normalize_path(exe))
            if name:
                names.add(Path(name).stem.lower())
        except (psutil.NoSuchProcess, psutil.AccessDenied, OSError):
            continue
    return paths, names


def focus_existing(target: str, app_id: str = "") -> bool:
    """Brings an already-running app forward. Returns True when focused."""
    if not app_id and Path(target).name.lower() == "explorer.exe":
        # The pinned File Explorer entry resolves to no target, so match the
        # open folder windows directly instead of always opening a new one.
        for hwnd in explorer_windows():
            focus_window(hwnd)
            return True
        return False
    if not app_id and not target:
        return False
    for window in matching_windows(target, app_id):
        focus_window(int(window["hwnd"]))
        return True
    return False


def _raise_new_window(
    before: set[int], target: str, app_id: str, timeout: float = 3.0
) -> None:
    """Raises the window a just-launched app opened.

    A background process has no foreground rights, so a newly opened window
    lands behind whatever is on top. This waits for the app's own new window
    and pulls it forward, which is what a taskbar click is expected to do.
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        for window in matching_windows(target, app_id):
            hwnd = int(window["hwnd"])
            if hwnd in before:
                continue
            focus_window(hwnd)
            return
        time.sleep(0.15)


def launch_entry(entry: Dict[str, Any]) -> Dict[str, Any]:
    """Launches a validated taskbar entry without constructing shell strings."""
    path = str(entry.get("path") or "").strip()
    target = str(entry.get("target_path") or "").strip()
    app_id = str(entry.get("app_id") or "").strip()
    if not path:
        return {"ok": False, "message": "This app has no resolved path."}
    if entry.get("missing"):
        return {"ok": False, "message": f"{entry.get('name') or 'This app'} is missing."}

    if (app_id or target) and focus_existing(target, app_id):
        return {"ok": True, "action": "focused", "message": "Brought the app forward."}

    before = window_handles()
    try:
        if path.lower().endswith((".lnk", ".url")):
            # Windows resolves shortcut arguments and launch verbs safely.
            os.startfile(path)  # type: ignore[attr-defined]
        elif path.lower().endswith(".exe"):
            subprocess.Popen(
                [path],
                cwd=os.path.dirname(path) or None,
                close_fds=True,
                shell=False,
            )
        else:
            os.startfile(path)  # type: ignore[attr-defined]
    except Exception as exc:
        logger.warning("Could not launch %s: %s", path, exc)
        return {"ok": False, "message": f"Windows could not launch {entry.get('name') or path}."}

    _raise_new_window(before, target, app_id)
    return {"ok": True, "action": "launched", "message": "App launched."}
