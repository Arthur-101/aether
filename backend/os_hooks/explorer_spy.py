"""Aether Explorer Drag & Drop Spy

Detects file drag operations in Windows Explorer or Desktop and triggers the
Radial Wheel on the configured modifier. Emits a drop event on left-button
release so the frontend can activate the slice under the cursor.
"""

import time
from pathlib import Path
from typing import Any, Callable, Optional, Tuple

from pynput import keyboard, mouse

from .explorer_selection import get_selected_explorer_file
from .hotkey_parser import key_name


class DragShiftDetector:
    """Monitors drag + modifier and emits (x, y, file_path, ext) plus drops."""

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
