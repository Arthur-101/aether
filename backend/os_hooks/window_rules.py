"""Classification helpers for visible Windows taskbar windows.

Kept apart from :mod:`window_apps` so that the discovery loop and the
per-window rules stay readable.
"""

from __future__ import annotations

import ctypes
from pathlib import Path
from typing import Any, List

try:
    import win32gui
except ImportError:  # pragma: no cover - non-Windows environments
    win32gui = None  # type: ignore[assignment]

SKIP_CLASSES = {
    "progman",
    "shell_traywnd",
    "shell_secondarytraywnd",
    "workerw",
    "windows.ui.core.corewindow",
}
SKIP_PROCESSES = {
    "applicationframehost.exe",
    "searchhost.exe",
    "shellexperiencehost.exe",
    "startmenuexperiencehost.exe",
    "systemsettings.exe",
    "textinputhost.exe",
}
SKIP_TITLES = {"aether"}
EXPLORER_CLASSES = {"CabinetWClass", "ExploreWClass"}
RENDER_WIDGET_CLASS = "Chrome_RenderWidgetHostHWND"

_EX_TOOLWINDOW = 0x00000080
_EX_APPWINDOW = 0x00040000
_DWMWA_CLOAKED = 14

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
    if window_class.casefold() in SKIP_CLASSES:
        return False
    process = Path(exe).name.casefold()
    if process == "explorer.exe":
        # explorer.exe also hosts the shell desktop and the taskbar; only its
        # folder windows belong on the taskbar.
        if window_class not in EXPLORER_CLASSES:
            return False
    if process in SKIP_PROCESSES:
        return False
    return title.strip().casefold() not in SKIP_TITLES


def is_cloaked(hwnd: int) -> bool:
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


def is_app_mode_window(hwnd: int, window_class: str) -> bool:
    """Detects a Chromium app-mode (web app) window.

    A normal browser window owns several renderer children: the tab strip,
    the toolbar and the page. An app-mode window renders the page straight
    into the top-level window and owns none.

    This must be decided per window, not per process. A browser started
    through a web-app shortcut keeps ``--app-id`` on the whole process, so
    every window it owns looks like a web app by command line alone.
    """
    if not window_class.startswith("Chrome_WidgetWin"):
        return False
    if win32gui is None:
        return False
    render_widgets = 0

    def visit(child: int, _extra: Any) -> bool:
        nonlocal render_widgets
        try:
            if win32gui.GetClassName(child) == RENDER_WIDGET_CLASS:
                render_widgets += 1
        except Exception:
            pass
        return True

    try:
        win32gui.EnumChildWindows(hwnd, visit, None)
    except Exception:
        return False
    # Do not cache this result. Chromium rearranges child windows while a PWA
    # is starting; caching an early tab-strip observation permanently turns a
    # PWA into a browser entry, which lights the browser's running dot and
    # hides the PWA's own shortcut/icon. The taskbar poller already takes a
    # fresh snapshot, so the current child hierarchy is the right signal.
    return render_widgets == 0
