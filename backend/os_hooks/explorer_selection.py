"""Windows Explorer selection lookup used by the Radial Wheel."""

import os
from pathlib import Path
from typing import Any, Optional

import pythoncom
import win32com.client
import win32gui
import winreg


def _desktop_dirs() -> list[Path]:
    """Resolves the user and public desktop folders, including redirection."""
    candidates: list[Path] = []
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders",
        )
        with key:
            value, _ = winreg.QueryValueEx(key, "Desktop")
            candidates.append(Path(os.path.expandvars(value)))
    except Exception:
        pass
    candidates.append(Path(os.path.expanduser("~")) / "Desktop")
    public = os.getenv("PUBLIC", "")
    if public:
        candidates.append(Path(public) / "Desktop")
    return [path for path in candidates if path.is_dir()]


def _resolve_desktop_name(name: str) -> Optional[str]:
    """Maps a desktop icon label (often extensionless) to a real path."""
    if not name:
        return None
    for base in _desktop_dirs():
        direct = base / name
        if direct.exists():
            return str(direct)
        matches = [
            item
            for item in base.iterdir()
            if item.stem.casefold() == name.casefold()
            or item.name.casefold() == name.casefold()
        ]
        if matches:
            return str(matches[0])
    return None


def _desktop_selected_path() -> Optional[str]:
    """Reads the selected item from the Desktop's SysListView32 control."""
    try:
        from pywinauto.controls.common_controls import ListViewWrapper

        progman = win32gui.FindWindow("Progman", None)
        defview = (
            win32gui.FindWindowEx(progman, 0, "SHELLDLL_DefView", None)
            if progman
            else 0
        )
        if not defview:
            workerw = 0
            while True:
                workerw = win32gui.FindWindowEx(0, workerw, "WorkerW", None)
                if not workerw:
                    break
                defview = win32gui.FindWindowEx(
                    workerw, 0, "SHELLDLL_DefView", None
                )
                if defview:
                    break
        if not defview:
            return None

        listview = win32gui.FindWindowEx(defview, 0, "SysListView32", None)
        if not listview:
            return None

        wrapper = ListViewWrapper(listview)
        if wrapper.get_selected_count() < 1:
            return None
        for index in range(wrapper.item_count()):
            item = wrapper.get_item(index)
            if item.is_selected():
                return _resolve_desktop_name(item.text())
    except Exception:
        return None
    return None


def _window_selected_path(window: Any) -> Optional[str]:
    """Reads the selected (or focused) item from a Shell browser window."""
    try:
        selected = window.Document.SelectedItems()
        if selected.Count > 0:
            return selected.Item(0).Path
    except Exception:
        pass
    try:
        # Explorer can report zero selected items while a drag operation is
        # active even though the dragged item is still focused.
        focused = window.Document.FocusedItem
        if focused is not None:
            return focused.Path
    except Exception:
        pass
    return None


def get_selected_explorer_file() -> Optional[str]:
    """Queries Shell.Application COM for the currently selected/dragged item."""
    pythoncom.CoInitialize()
    try:
        shell = win32com.client.Dispatch("Shell.Application")
        fg_hwnd = win32gui.GetForegroundWindow()
        fg_root = win32gui.GetAncestor(fg_hwnd, 2)  # GA_ROOT
        fg_class = win32gui.GetClassName(fg_hwnd)

        # Desktop icons are not exposed by Shell.Application.Windows().
        if fg_class in ("Progman", "WorkerW"):
            return _desktop_selected_path()

        # Check the foreground Explorer window (or its top-level ancestor).
        for window in shell.Windows():
            try:
                if int(window.HWND) in (int(fg_hwnd), int(fg_root)):
                    path = _window_selected_path(window)
                    if path:
                        return path
            except Exception:
                continue
    except Exception:
        pass
    finally:
        pythoncom.CoUninitialize()
    return None
