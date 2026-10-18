"""
Aether Explorer Drag & Drop Spy
Detects file drag operations in Windows Explorer or Desktop and triggers the Radial Wheel on Shift.
Uses Windows COM (Shell.Application) and pynput mouse/keyboard hooks.
"""

from pathlib import Path
from typing import Any, Callable, Optional, Tuple
import pythoncom
import win32com.client
import win32gui
from pynput import keyboard, mouse


def get_selected_explorer_file() -> Optional[str]:
    """
    Queries Windows Shell.Application COM for the currently selected/dragged item.
    Works for both open File Explorer windows and the Windows Desktop.
    """
    pythoncom.CoInitialize()
    try:
        shell = win32com.client.Dispatch("Shell.Application")
        fg_hwnd = win32gui.GetForegroundWindow()

        # 1. Check open Explorer windows first
        for window in shell.Windows():
            try:
                if int(window.HWND) == int(fg_hwnd):
                    selected = window.Document.SelectedItems()
                    if selected.Count > 0:
                        return selected.Item(0).Path
            except Exception:
                continue

        # 2. Check Windows Desktop (Progman / WorkerW)
        desktop_title = win32gui.GetWindowText(fg_hwnd).lower()
        if "program manager" in desktop_title or not desktop_title:
            for window in shell.Windows():
                try:
                    if "explorer.exe" in window.FullName.lower():
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
    """
    Monitors mouse drag + Shift key press.
    When user holds left-click, drags > 8px, and presses Shift:
    Queries dragged file path and fires on_trigger(x, y, file_path, ext).
    """

    def __init__(self, on_trigger_callback: Callable[..., None]):
        self.on_trigger = on_trigger_callback
        self.left_down = False
        self.drag_start_pos: Optional[Tuple[int, int]] = None
        self.current_pos: Tuple[int, int] = (0, 0)
        self.is_dragging = False
        self.wheel_active = False

        self._mouse_listener: Optional[mouse.Listener] = None
        self._key_listener: Optional[keyboard.Listener] = None

    def on_move(self, x: int, y: int) -> None:
        self.current_pos = (x, y)
        if self.left_down and self.drag_start_pos:
            dx = abs(x - self.drag_start_pos[0])
            dy = abs(y - self.drag_start_pos[1])
            if dx > 8 or dy > 8:
                self.is_dragging = True

    def on_click(self, x: int, y: int, button: mouse.Button, pressed: bool) -> None:
        if button == mouse.Button.left:
            self.left_down = pressed
            if pressed:
                self.drag_start_pos = (x, y)
            else:
                self.is_dragging = False
                self.wheel_active = False

    def on_key_press(self, key: Any) -> None:
        if key in (keyboard.Key.shift, keyboard.Key.shift_l, keyboard.Key.shift_r):
            if self.is_dragging and not self.wheel_active:
                file_path = get_selected_explorer_file()
                if file_path and Path(file_path).exists():
                    self.wheel_active = True
                    ext = Path(file_path).suffix.lstrip(".").lower()
                    self.on_trigger(
                        x=self.current_pos[0],
                        y=self.current_pos[1],
                        file_path=file_path,
                        ext=ext
                    )

    def start(self) -> None:
        """Starts background mouse and keyboard listeners."""
        self._mouse_listener = mouse.Listener(on_move=self.on_move, on_click=self.on_click)
        self._key_listener = keyboard.Listener(on_press=self.on_key_press)
        self._mouse_listener.daemon = True
        self._key_listener.daemon = True
        self._mouse_listener.start()
        self._key_listener.start()

    def stop(self) -> None:
        """Stops listeners cleanly."""
        if self._mouse_listener:
            self._mouse_listener.stop()
        if self._key_listener:
            self._key_listener.stop()
