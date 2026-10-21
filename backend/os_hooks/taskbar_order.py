"""Reads the user's real Windows taskbar pin order from Explorer's Taskband."""

from __future__ import annotations

import logging
import re
import winreg
from pathlib import Path
from typing import Iterable, List

logger = logging.getLogger("aether.taskbar.order")
_REG_PATH = r"Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband"


def _candidates(data: bytes) -> Iterable[tuple[int, str]]:
    """Extracts .lnk names from both UTF-16 byte alignments in the shell blob."""
    for offset in (0, 1):
        text = data[offset:].decode("utf-16-le", errors="ignore")
        for match in re.finditer(r"[\x20-\x7e]{2,}\.lnk", text):
            yield offset + match.start() * 2, match.group(0)


def pinned_shortcut_order(folder: Path, shortcuts: List[Path]) -> List[Path]:
    """Returns shortcuts in Taskband order, preserving folder order as fallback."""
    by_name = {item.name.casefold(): item for item in shortcuts}
    if not by_name:
        return shortcuts
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _REG_PATH) as key:
            data, _kind = winreg.QueryValueEx(key, "Favorites")
    except OSError as exc:
        logger.debug("Taskband order unavailable: %s", exc)
        return shortcuts
    found: dict[str, tuple[int, Path]] = {}
    for position, raw in _candidates(data):
        for cut in range(0, 3):
            name = raw[cut:].casefold()
            if name in by_name and name not in found:
                found[name] = (position, by_name[name])
                break
    if not found:
        return shortcuts
    ordered = [item for _position, item in sorted(found.values(), key=lambda pair: pair[0])]
    ordered_names = {item.name.casefold() for item in ordered}
    ordered.extend(item for item in shortcuts if item.name.casefold() not in ordered_names)
    return ordered
