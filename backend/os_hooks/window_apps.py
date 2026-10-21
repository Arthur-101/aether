"""Visible-window discovery for running dots and unpinned open apps.

The taskbar pins are only half of the Windows taskbar: running windows that are
not pinned still get their own taskbar buttons.  This module reads those
windows, including Chromium web-app windows that share their browser's
executable but carry a distinct ``--app-id``.
"""

from __future__ import annotations

import ctypes
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

_APP_ID_RE = re.compile(
    r'--app-id(?:=|\s+)(?:"([^"]+)"|([^\s"]+))', re.IGNORECASE
)
_SKIP_CLASSES = {
    "progman",
    "shell_traywnd",
    "shell_secondarytraywnd",
    "workerw",
    "windows.ui.core.corewindow",
}
_SKIP_PROCESSES = {
    "applicationframehost.exe",
    "explorer.exe",
    "searchhost.exe",
    "shellexperiencehost.exe",
    "startmenuexperiencehost.exe",
    "systemsettings.exe",
    "textinputhost.exe",
}
_SKIP_TITLES = {"aether"}
_EX_TOOLWINDOW = 0x00000080
_EX_APPWINDOW = 0x00040000
_DWMWA_CLOAKED = 14


def app_id_from_arguments(arguments: str) -> str:
    """Extracts a Chromium web-app id from shortcut arguments or a command line."""
    match = _APP_ID_RE.search(arguments or "")
    if not match:
        return ""
    return (match.group(1) or match.group(2) or "").strip()


def _option_from_cmdline(cmdline: List[str], name: str) -> str:
    """Reads a ``--name=value`` or ``--name value`` option from an argv list."""
    prefix = f"{name}="
    for index, raw in enumerate(cmdline):
        value = str(raw or "")
        if value.startswith(prefix):
            return value[len(prefix):].strip().strip('"')
        if value == name and index + 1 < len(cmdline):
            return str(cmdline[index + 1] or "").strip().strip('"')
    return ""


def _normalize_path(value: str) -> str:
    return os.path.normcase(
        os.path.normpath(os.path.expandvars((value or "").strip().strip('"')))
    )


def is_taskbar_window(
    hwnd: int,
    pid: int,
    title: str,
    window_class: str,
    exstyle: int,
    owner: int,
    exe: str,
) -> bool:
    """Returns True for an unowned, titled window that belongs on the taskbar."""
    if not hwnd or not pid or not title.strip() or owner:
        return False
    if exstyle & _EX_TOOLWINDOW and not exstyle & _EX_APPWINDOW:
        return False
    if window_class.casefold() in _SKIP_CLASSES:
        return False
    if Path(exe).name.casefold() in _SKIP_PROCESSES:
        return False
    return title.strip().casefold() not in _SKIP_TITLES


def _is_cloaked(hwnd: int) -> bool:
    """Skips UWP/ghost windows that DWM has cloaked off-screen."""
    try:
        cloaked = ctypes.c_int(0)
        result = ctypes.windll.dwmapi.DwmGetWindowAttribute(
            hwnd,
            _DWMWA_CLOAKED,
            ctypes.byref(cloaked),
            ctypes.sizeof(cloaked),
        )
        return result == 0 and cloaked.value != 0
    except Exception:
        return False


def _empty_snapshot() -> Dict[str, Any]:
    return {"windows": [], "by_app_id": {}, "by_exe": {}, "pwa_ids": set()}


def window_snapshot() -> Dict[str, Any]:
    """Returns taskbar-worthy visible windows grouped by app id and executable."""
    try:
        import psutil
        import win32con
        import win32gui
        import win32process
    except ImportError:
        return _empty_snapshot()

    process_cache: Dict[int, Dict[str, Any]] = {}
    windows: List[Dict[str, Any]] = []
    by_app_id: Dict[str, Dict[str, Any]] = {}
    by_exe: Dict[str, List[Dict[str, Any]]] = {}

    def process_info(pid: int) -> Dict[str, Any]:
        cached = process_cache.get(pid)
        if cached is not None:
            return cached
        info: Dict[str, Any] = {"exe": "", "name": "", "cmdline": []}
        try:
            process = psutil.Process(pid)
            info["exe"] = process.exe() or ""
            info["name"] = process.name() or ""
            info["cmdline"] = process.cmdline() or []
        except (psutil.NoSuchProcess, psutil.AccessDenied, OSError):
            pass
        process_cache[pid] = info
        return info

    def visit(hwnd: int, _extra: Any) -> bool:
        try:
            if not win32gui.IsWindowVisible(hwnd):
                return True
            title = win32gui.GetWindowText(hwnd).strip()
            if not title:
                return True
            _thread, pid = win32process.GetWindowThreadProcessId(hwnd)
            if not pid:
                return True
            info = process_info(pid)
            exe = str(info.get("exe") or "")
            if not exe:
                return True
            exstyle = win32gui.GetWindowLong(hwnd, win32con.GWL_EXSTYLE)
            owner = win32gui.GetWindow(hwnd, win32con.GW_OWNER)
            window_class = win32gui.GetClassName(hwnd)
            if not is_taskbar_window(
                hwnd, pid, title, window_class, exstyle, owner, exe
            ):
                return True
            if _is_cloaked(hwnd):
                return True
            cmdline = list(info.get("cmdline") or [])
            app_id = _option_from_cmdline(cmdline, "--app-id")
            source = _option_from_cmdline(cmdline, "--source-shortcut")
            window = {
                "hwnd": hwnd,
                "pid": pid,
                "title": title,
                "class": window_class,
                "exe": exe,
                "process": str(info.get("name") or Path(exe).name),
                "app_id": app_id,
                "source_shortcut": source if source else "",
                "pwa": bool(app_id),
            }
            windows.append(window)
            by_exe.setdefault(_normalize_path(exe), []).append(window)
            if app_id:
                by_app_id.setdefault(app_id.casefold(), window)
        except Exception:
            return True
        return True

    try:
        win32gui.EnumWindows(visit, None)
    except Exception:
        return _empty_snapshot()
    return {
        "windows": windows,
        "by_app_id": by_app_id,
        "by_exe": by_exe,
        "pwa_ids": set(by_app_id),
    }


def matching_windows(target: str, app_id: str = "") -> List[Dict[str, Any]]:
    """Finds windows for a web-app id, or for a non-web-app executable."""
    snapshot = window_snapshot()
    if app_id:
        window = snapshot["by_app_id"].get(app_id.casefold())
        return [window] if window else []
    normalized = _normalize_path(target)
    if not normalized:
        return []
    return [
        window
        for window in snapshot["by_exe"].get(normalized, [])
        if not window.get("pwa")
    ]
