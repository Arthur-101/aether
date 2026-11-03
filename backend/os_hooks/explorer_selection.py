"""Windows Explorer selection lookup used by the Radial Wheel."""

import os
from pathlib import Path
from typing import Any, Optional

import pythoncom
import win32com.client
import win32gui
import winreg


def _is_file_path(path: Any) -> bool:
    """True only for an existing file.

    Folders are not valid Radial Wheel payloads, so they are rejected here
    rather than being passed to image/document tools.
    """
    try:
        return bool(path) and Path(str(path)).is_file()
    except (OSError, ValueError):
        return False


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


def _item_file_path(item: Any) -> Optional[str]:
    """Returns the path of a Shell item only when it is a real file.

    Folders are deliberately rejected: the Radial Wheel only ever acts on
    files, and handing a directory to the image/document tools fails.
    """
    if item is None:
        return None
    try:
        if item.IsFolder:
            return None
        path = item.Path
    except Exception:
        return None
    return str(path) if _is_file_path(path) else None


def _window_selected_path(window: Any) -> Optional[str]:
    """Reads the selected (or focused) file from a Shell browser window."""
    try:
        selected = window.Document.SelectedItems()
    except Exception:
        selected = None
    if selected is not None:
        try:
            count = selected.Count
        except Exception:
            count = 0
        for index in range(count):
            try:
                item = selected.Item(index)
            except Exception:
                continue
            path = _item_file_path(item)
            if path:
                return path
    try:
        # Explorer can report zero selected items while a drag operation is
        # active even though the dragged item is still focused.
        focused = window.Document.FocusedItem
    except Exception:
        focused = None
    return _item_file_path(focused)


def _clipboard_selected_path() -> Optional[str]:
    """Best-effort read of files an in-flight drag exposed on the clipboard."""
    try:
        import win32clipboard
        import win32con
    except Exception:
        return None
    data: Any = None
    try:
        win32clipboard.OpenClipboard()
    except Exception:
        return None
    try:
        if win32clipboard.IsClipboardFormatAvailable(win32con.CF_HDROP):
            data = win32clipboard.GetClipboardData(win32con.CF_HDROP)
    except Exception:
        data = None
    finally:
        try:
            win32clipboard.CloseClipboard()
        except Exception:
            pass
    entries = data if isinstance(data, (list, tuple)) else [data]
    for entry in entries:
        if _is_file_path(entry):
            return str(entry)
    return None


def _window_for_hwnd(shell: Any, target: int) -> Optional[Any]:
    """Finds the Shell browser window whose HWND equals ``target``."""
    for window in shell.Windows():
        try:
            if int(window.HWND) == target:
                return window
        except Exception:
            continue
    return None


def get_selected_explorer_file(hwnd: Optional[int] = None) -> Optional[str]:
    """Queries Shell.Application COM for the currently selected/dragged file.

    ``hwnd`` should be the window under the drag's initial mouse-down. When
    given, it takes priority over the foreground window so a drag started in
    one Explorer window is not misattributed to whichever window is focused.
    Only real files are returned; folders are never valid wheel payloads.
    """
    pythoncom.CoInitialize()
    try:
        shell = win32com.client.Dispatch("Shell.Application")

        # Prefer the recorded drag source.
        if hwnd:
            root = win32gui.GetAncestor(int(hwnd), 2)  # GA_ROOT
            for target in (int(hwnd), int(root)):
                try:
                    cls = win32gui.GetClassName(target)
                except Exception:
                    cls = ""
                if cls in ("Progman", "WorkerW"):
                    path = _desktop_selected_path()
                    if path:
                        return path
                window = _window_for_hwnd(shell, target)
                if window is not None:
                    path = _window_selected_path(window)
                    if path:
                        return path

        # Fall back to the foreground window (or its top-level ancestor).
        fg_hwnd = win32gui.GetForegroundWindow()
        fg_root = win32gui.GetAncestor(fg_hwnd, 2)  # GA_ROOT
        fg_class = win32gui.GetClassName(fg_hwnd)

        # Desktop icons are not exposed by Shell.Application.Windows().
        if fg_class in ("Progman", "WorkerW"):
            path = _desktop_selected_path()
            if path:
                return path

        for window in shell.Windows():
            try:
                if int(window.HWND) in (int(fg_hwnd), int(fg_root)):
                    path = _window_selected_path(window)
                    if path:
                        return path
            except Exception:
                continue

        # Last resort: an in-flight drag may have published the files on the
        # clipboard even though no window reports a usable selection.
        return _clipboard_selected_path()
    except Exception:
        return None
    finally:
        pythoncom.CoUninitialize()
