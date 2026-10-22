"""Shortcut icon and target resolution for taskbar pins."""

from __future__ import annotations

import os
from pathlib import Path
from typing import List, Optional, Tuple

from .shell_icons import icon_data_uri


def split_icon_location(value: str) -> Tuple[str, int]:
    """Splits a shell IconLocation into its path and resource index."""
    raw = os.path.expandvars((value or "").strip().strip('"'))
    if not raw:
        return "", 0
    head, sep, tail = raw.rpartition(",")
    if sep:
        try:
            return head.strip().strip('"'), int(tail)
        except ValueError:
            pass
    return raw, 0


def target_from_icon(icon_location: str) -> str:
    """Derives an executable from an IconLocation.

    Some shell shortcuts carry no target at all and only name their icon
    path, for example the pinned File Explorer entry. The icon path is the
    real executable, so it can stand in for the missing target.
    """
    icon_path, _index = split_icon_location(icon_location)
    if not icon_path:
        return ""
    candidate = Path(os.path.expandvars(icon_path))
    if candidate.suffix.lower() != ".exe":
        return ""
    return str(candidate) if candidate.exists() else ""


def resolve_icon(
    source: Path, target: str, icon_location: str
) -> Optional[str]:
    """Extracts the best available icon image for a shortcut."""
    icon_path, icon_index = split_icon_location(icon_location)
    candidates: List[Path] = []
    if icon_path:
        candidates.append(Path(os.path.expandvars(icon_path)))
    if target:
        candidates.append(Path(target))
    candidates.append(source)
    seen = set()
    for candidate in candidates:
        key = os.path.normcase(str(candidate))
        if key in seen:
            continue
        seen.add(key)
        uri = icon_data_uri(
            str(candidate), icon_index if candidate == candidates[0] else 0
        )
        if uri:
            return uri
    return None
