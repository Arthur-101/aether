"""
Aether Explorer Drag & Drop Spy
Detects file drag operations in Windows Explorer or Desktop and triggers the
Radial Wheel on Shift. Emits a drop event on left-button release so the
frontend can activate the slice under the cursor.
"""

from pathlib import Path
from typing import Any, Callable, Optional, Tuple
import os
import time
import winreg
import pythoncom
import win32com.client
import win32gui
from pynput import keyboard, mouse
from .hotkey_parser import key_name


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


def get_selected_explorer_file() -> Optional[str]:
    """Queries Shell.Application COM for the currently selected/dragged item."""
    pythoncom.CoInitialize()
    try:
        shell = win32com.client.Dispatch("Shell.Application")
        fg_hwnd = win32gui.GetForegroundWindow()
        fg_class = win32gui.GetClassName(fg_hwnd)

        # Desktop icons are not exposed by Shell.Application.Windows().
        if fg_class in ("Progman", "WorkerW"):
            return _desktop_selected_path()

        # 1. Check the foreground Explorer window
        for window in shell.Windows():
            try:
                if int(window.HWND) == int(fg_hwnd):
                    selected = window.Document.SelectedItems()
                    if selected.Count > 0:
                        return selected.Item(0).Path
            except Exception:
                continue
    except Exception:
        pass
    finally:
        pythoncom.CoUninitialize()
    return None


class DragShiftDetector:
    """Monitors drag + Shift and emits (x, y, file_path, ext) plus drops."""

    def __init__(
        self,
        on_trigger_callback: Callable[..., None],
        on_drop_callback: Optional[Callable[[int, int], None]] = None,
        on_move_callback: Optional[Callable[[int, int], None]] = None,
    ):
        self.on_trigger = on_trigger_callback
        self.on_drop = on_drop_callback or (lambda x, y: None)
        self.on_move_callback = on_move_callback or (lambda x, y: None)
        self.left_down = False
        self.shift_down = False
        self.modifier = "shift"
        self.modifiers: set[str] = set()
        self.drag_start_pos: Optional[Tuple[int, int]] = None
        self.current_pos: Tuple[int, int] = (0, 0)
        self.is_dragging = False
        self.wheel_active = False
        self._last_move_emit = 0.0

        self._mouse_listener: Optional[mouse.Listener] = None
        self._key_listener: Optional[keyboard.Listener] = None

    def set_modifier(self, modifier: str) -> None:
        """Changes the modifier required to summon the Radial Wheel."""
        self.modifier = modifier if modifier in ("ctrl", "shift", "alt") else "shift"

    def _modifier_held(self) -> bool:
        return self.modifier in self.modifiers

    def _maybe_open_wheel(self) -> None:
        if not (self.is_dragging and self._modifier_held() and not self.wheel_active):
            return
        file_path = get_selected_explorer_file()
        if file_path and Path(file_path).exists():
            self.wheel_active = True
            self._last_move_emit = 0.0
            ext = Path(file_path).suffix.lstrip(".").lower()
            self.on_trigger(
                x=self.current_pos[0],
                y=self.current_pos[1],
                file_path=file_path,
                ext=ext,
            )

    def on_move(self, x: int, y: int) -> None:
        self.current_pos = (x, y)
        if self.left_down and self.drag_start_pos:
            dx = abs(x - self.drag_start_pos[0])
            dy = abs(y - self.drag_start_pos[1])
            if dx > 8 or dy > 8:
                self.is_dragging = True
                self._maybe_open_wheel()

        # Explorer owns mouse capture during a drag, so stream the cursor to
        # the overlay at ~60 Hz for live slice highlighting.
        if self.wheel_active and self.left_down:
            now = time.monotonic()
            if now - self._last_move_emit >= 0.016:
                self._last_move_emit = now
                self.on_move_callback(x, y)

    def on_click(self, x: int, y: int, button: mouse.Button, pressed: bool) -> None:
        if button != mouse.Button.left:
            return
        if pressed:
            self.left_down = True
            self.drag_start_pos = (x, y)
            self.current_pos = (x, y)
            return

        # Release: let the UI activate the hovered slice, then reset.
        was_active = self.wheel_active
        self.left_down = False
        self.is_dragging = False
        self.wheel_active = False
        self.current_pos = (x, y)
        if was_active:
            self.on_drop(x, y)

    def on_key_press(self, key: Any) -> None:
        name = key_name(key)
        if name in ("ctrl", "shift", "alt", "cmd"):
            self.modifiers.add(name)
        if name == "shift":
            self.shift_down = True
        if name == self.modifier:
            self._maybe_open_wheel()

    def on_key_release(self, key: Any) -> None:
        name = key_name(key)
        if name in ("ctrl", "shift", "alt", "cmd"):
            self.modifiers.discard(name)
        if name == "shift":
            self.shift_down = False

    def start(self) -> None:
        if self._mouse_listener is not None:
            return
        self._mouse_listener = mouse.Listener(
            on_move=self.on_move, on_click=self.on_click
        )
        self._key_listener = keyboard.Listener(
            on_press=self.on_key_press, on_release=self.on_key_release
        )
        self._mouse_listener.daemon = True
        self._key_listener.daemon = True
        self._mouse_listener.start()
        self._key_listener.start()

    def stop(self) -> None:
        if self._mouse_listener:
            self._mouse_listener.stop()
            self._mouse_listener = None
        if self._key_listener:
            self._key_listener.stop()
            self._key_listener = None
