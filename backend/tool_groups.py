"""Canonical tool loadout groups shared by config and the MCP registry.

Groups are only an organisational switch: disabling one removes its schemas
from the model request and rejects direct calls to those tools. Tools that are
not assigned to a known group stay enabled, so adding a tool never makes it
silently disappear before its group is declared.
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

TOOL_GROUPS: Tuple[Dict[str, str], ...] = (
    {
        "id": "notes",
        "label": "Notes",
        "hint": "Create, read, search, pin, edit, and delete notes in your vault.",
    },
    {
        "id": "media",
        "label": "Media",
        "hint": "Play, pause, skip, and inspect whatever is playing locally.",
    },
    {
        "id": "system",
        "label": "System",
        "hint": "Check system stats and control volume, mute, brightness, Wi-Fi, and Bluetooth.",
    },
    {
        "id": "spotify",
        "label": "Spotify",
        "hint": "Search, queue, and control Spotify playback (Premium for transport).",
    },
    {
        "id": "web",
        "label": "Web",
        "hint": "Search the web and fetch readable page text.",
    },
    {
        "id": "clock",
        "label": "Clock & Tasks",
        "hint": "Timers, alarms, reminders, and recurring routines.",
    },
    {
        "id": "documents",
        "label": "Documents",
        "hint": "Convert PDFs and ask questions about dropped documents.",
    },
    {
        "id": "files",
        "label": "Image & File Tools",
        "hint": "Convert, compress, crop, and strip metadata from image files.",
    },
)

TOOL_GROUP_IDS: Tuple[str, ...] = tuple(group["id"] for group in TOOL_GROUPS)
TOOL_GROUP_LABELS: Dict[str, str] = {
    group["id"]: group["label"] for group in TOOL_GROUPS
}
TOOL_GROUP_HINTS: Dict[str, str] = {
    group["id"]: group["hint"] for group in TOOL_GROUPS
}

# Configs written before the System group existed list exactly these ids. The
# one-time upgrade in config_schema keeps that all-on choice, while custom
# subsets and explicit opt-outs are left alone.
PREVIOUS_TOOL_GROUP_IDS: Tuple[str, ...] = (
    "notes",
    "media",
    "spotify",
    "web",
    "clock",
    "documents",
    "files",
)
TOOL_GROUPS_VERSION = 2

DEFAULT_ENABLED_TOOL_GROUPS: Tuple[str, ...] = TOOL_GROUP_IDS

# The conversational core: everything needed for everyday chat without the
# Spotify, document, and image-conversion schemas.
LEAN_ENABLED_TOOL_GROUPS: Tuple[str, ...] = ("notes", "media", "web", "clock")

MAX_DISABLED_TOOLS = 200


def normalize_enabled_tool_groups(value: Any) -> List[str]:
    """Returns known group ids in canonical order.

    A missing or malformed value means "everything enabled" so an older config
    never loses tools. An explicit empty list is honoured: the user can choose
    to run Aether without any tools.
    """
    if value is None or isinstance(value, str):
        return list(DEFAULT_ENABLED_TOOL_GROUPS)
    try:
        items = list(value)
    except TypeError:
        return list(DEFAULT_ENABLED_TOOL_GROUPS)
    requested = {str(item).strip().lower() for item in items if str(item).strip()}
    return [group_id for group_id in TOOL_GROUP_IDS if group_id in requested]


def normalize_disabled_tools(value: Any) -> List[str]:
    """Returns unique, trimmed tool names for the per-tool denylist."""
    if value is None or isinstance(value, str):
        return []
    try:
        items = list(value)
    except TypeError:
        return []
    seen = set()
    names: List[str] = []
    for item in items:
        if not isinstance(item, str):
            continue
        name = item.strip()
        if not name or name in seen:
            continue
        seen.add(name)
        names.append(name)
        if len(names) >= MAX_DISABLED_TOOLS:
            break
    return names
