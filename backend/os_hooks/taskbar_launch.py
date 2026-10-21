"""Safe taskbar app launching and focus handling for Windows."""

from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, Set, Tuple

import psutil

from .window_apps import matching_windows

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


def _focus_window(hwnd: int) -> None:
    """Best-effort foreground activation, including the thread-attach fallback."""
    try:
        import win32api
        import win32con
        import win32gui
        import win32process
    except ImportError:
        return

    try:
        if win32gui.IsIconic(hwnd):
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.BringWindowToTop(hwnd)
        win32gui.SetForegroundWindow(hwnd)
        if win32gui.GetForegroundWindow() == hwnd:
            return

        foreground = win32gui.GetForegroundWindow()
        foreground_thread, _ = win32process.GetWindowThreadProcessId(foreground)
        target_thread, _ = win32process.GetWindowThreadProcessId(hwnd)
        current_thread = win32api.GetCurrentThreadId()
        attached = []
        try:
            if foreground_thread and foreground_thread != current_thread:
                win32process.AttachThreadInput(current_thread, foreground_thread, True)
                attached.append(foreground_thread)
            if target_thread and target_thread not in attached:
                win32process.AttachThreadInput(current_thread, target_thread, True)
                attached.append(target_thread)
            win32gui.BringWindowToTop(hwnd)
            win32gui.SetForegroundWindow(hwnd)
            win32gui.SetActiveWindow(hwnd)
            win32gui.SetFocus(hwnd)
        finally:
            for thread in attached:
                try:
                    win32process.AttachThreadInput(current_thread, thread, False)
                except Exception:
                    pass
    except Exception as exc:
        logger.debug("Window focus failed: %s", exc)


def focus_existing(target: str, app_id: str = "") -> bool:
    """Brings an already-running app forward. Returns True when focused."""
    if not app_id and (
        not target or Path(target).name.lower() == "explorer.exe"
    ):
        return False
    for window in matching_windows(target, app_id):
        _focus_window(int(window["hwnd"]))
        return True
    return False


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
    return {"ok": True, "action": "launched", "message": "App launched."}
