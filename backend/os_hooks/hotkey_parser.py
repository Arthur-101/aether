"""
Aether Hotkey Parsing
Normalizes human-readable (`Ctrl + Space`) and pynput (`<ctrl>+<space>`)
hotkey strings into a stable modifier/key binding used by HotkeyManager.
"""

from dataclasses import dataclass
import re
from typing import FrozenSet, Optional

from pynput import keyboard

_MODIFIERS = {
    "ctrl": "ctrl",
    "control": "ctrl",
    "cmd": "cmd",
    "win": "cmd",
    "windows": "cmd",
    "super": "cmd",
    "meta": "cmd",
    "shift": "shift",
    "alt": "alt",
}
_KEY_ALIASES = {
    "space": "space",
    "esc": "esc",
    "escape": "esc",
    "enter": "enter",
    "return": "enter",
    "tab": "tab",
    "backspace": "backspace",
    "delete": "delete",
    "up": "up",
    "down": "down",
    "left": "left",
    "right": "right",
    "home": "home",
    "end": "end",
    "page_up": "page_up",
    "page_down": "page_down",
}
_CTRL_KEYS = (keyboard.Key.ctrl, keyboard.Key.ctrl_l, keyboard.Key.ctrl_r)
_CMD_KEYS = (keyboard.Key.cmd, keyboard.Key.cmd_l, keyboard.Key.cmd_r)
_SHIFT_KEYS = (keyboard.Key.shift, keyboard.Key.shift_l, keyboard.Key.shift_r)
_ALT_KEYS = (keyboard.Key.alt, keyboard.Key.alt_l, keyboard.Key.alt_r)


@dataclass(frozen=True)
class HotkeyBinding:
    modifiers: FrozenSet[str]
    key: Optional[str] = None

    def matches(self, pressed: FrozenSet[str]) -> bool:
        if not self.modifiers.issubset(pressed):
            return False
        return self.key is None or self.key in pressed


def _tokens(value: str) -> list[str]:
    parts = re.split(r"\s*\+\s*", (value or "").strip().lower())
    return [part.strip().strip("<>").strip() for part in parts if part.strip()]


def parse_hotkey(value: str) -> HotkeyBinding:
    """Parses a configured combo; a lone modifier becomes a modifier-only hold."""
    modifiers: set[str] = set()
    key: Optional[str] = None
    for token in _tokens(value):
        if token in _MODIFIERS:
            modifiers.add(_MODIFIERS[token])
        elif token in _KEY_ALIASES:
            key = _KEY_ALIASES[token]
        elif re.fullmatch(r"f(?:[1-9]|1[0-2])", token):
            key = token
        elif len(token) == 1:
            key = token
        elif token:
            key = token
    return HotkeyBinding(frozenset(modifiers), key)


def modifier_name(value: str) -> str:
    """Extracts the drag modifier used by the Radial Wheel."""
    for token in _tokens(value):
        if token in _MODIFIERS and _MODIFIERS[token] in ("ctrl", "shift", "alt"):
            return _MODIFIERS[token]
    return "shift"


def key_name(key) -> str:
    """Converts a pynput key event into a normalized identifier."""
    if key in _CTRL_KEYS:
        return "ctrl"
    if key in _CMD_KEYS:
        return "cmd"
    if key in _SHIFT_KEYS:
        return "shift"
    if key in _ALT_KEYS:
        return "alt"
    char = getattr(key, "char", None)
    if isinstance(char, str) and char:
        return char.lower()
    name = getattr(key, "name", None)
    if name:
        return str(name).lower().replace(" ", "_")
    text = str(key).lower()
    if text.startswith("key."):
        text = text[4:]
    return text
