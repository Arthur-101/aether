"""Risk metadata and approval requests for guarded MCP tools."""

from __future__ import annotations

import secrets
import threading
from dataclasses import dataclass
from typing import Any, Dict, Literal, Optional

ToolRisk = Literal["read", "write", "destructive", "system"]
GUARDED_RISKS = {"destructive", "system"}


@dataclass(frozen=True)
class ToolPermission:
    """Risk classification for one deterministic tool."""

    risk: ToolRisk
    group: str


# Unlisted tools are `write`: they execute but are visible through F2. Guarded
# registrations are added alongside their tools, so the default never silently
# grants destructive/system access.
TOOL_PERMISSIONS: Dict[str, ToolPermission] = {
    "list_notes": ToolPermission("read", "notes"),
    "search_notes": ToolPermission("read", "notes"),
    "read_note": ToolPermission("read", "notes"),
    "create_note": ToolPermission("write", "notes"),
    "append_to_note": ToolPermission("write", "notes"),
    "set_note_pinned": ToolPermission("write", "notes"),
    "update_note": ToolPermission("destructive", "notes"),
    "delete_note": ToolPermission("destructive", "notes"),
    "now_playing": ToolPermission("read", "media"),
    "media_play": ToolPermission("write", "media"),
    "media_pause": ToolPermission("write", "media"),
    "media_toggle": ToolPermission("write", "media"),
    "media_next": ToolPermission("write", "media"),
    "media_previous": ToolPermission("write", "media"),
    "get_system_stats": ToolPermission("read", "system"),
    "set_volume": ToolPermission("write", "system"),
    "set_mute": ToolPermission("system", "system"),
    "set_brightness": ToolPermission("write", "system"),
    "set_wifi": ToolPermission("system", "system"),
    "set_bluetooth": ToolPermission("system", "system"),
    "web_search": ToolPermission("read", "web"),
    "fetch_url": ToolPermission("read", "web"),
    "spotify_search": ToolPermission("read", "spotify"),
    "spotify_list_devices": ToolPermission("read", "spotify"),
    "spotify_liked_songs": ToolPermission("read", "spotify"),
    "spotify_play": ToolPermission("write", "spotify"),
    "spotify_queue": ToolPermission("write", "spotify"),
    "spotify_set_shuffle": ToolPermission("write", "spotify"),
    "spotify_set_repeat": ToolPermission("write", "spotify"),
    "spotify_set_volume": ToolPermission("write", "spotify"),
    "spotify_transfer": ToolPermission("write", "spotify"),
    "spotify_like": ToolPermission("write", "spotify"),
    "schedule_one_time_task": ToolPermission("write", "clock"),
    "schedule_recurring_routine": ToolPermission("write", "clock"),
    "schedule_custom_task": ToolPermission("write", "clock"),
    "schedule_alarm": ToolPermission("write", "clock"),
    "list_scheduled_tasks": ToolPermission("read", "clock"),
    "update_scheduled_task": ToolPermission("write", "clock"),
    "cancel_scheduled_task": ToolPermission("write", "clock"),
    "complete_scheduled_task": ToolPermission("write", "clock"),
    "pause_scheduled_task": ToolPermission("write", "clock"),
    "resume_scheduled_task": ToolPermission("write", "clock"),
    "convert_document": ToolPermission("write", "documents"),
    "search_dropped_file": ToolPermission("read", "documents"),
    "convert_image_format": ToolPermission("write", "files"),
    "compress_media": ToolPermission("write", "files"),
    "strip_image_metadata": ToolPermission("write", "files"),
    "crop_image": ToolPermission("write", "files"),
    "add_background": ToolPermission("write", "files"),
}


def tool_permission(name: str) -> ToolPermission:
    """Returns a tool's risk metadata; unknown tools remain reversible writes."""
    return TOOL_PERMISSIONS.get(name, ToolPermission("write", "other"))


def requires_approval(name: str) -> bool:
    """Whether a call must stop for explicit user approval."""
    return tool_permission(name).risk in GUARDED_RISKS


@dataclass
class PendingApproval:
    """One ephemeral model turn paused at a guarded tool call."""

    approval_id: str
    session_id: str
    name: str
    args: Dict[str, Any]
    call_id: str
    conversation: list[Dict[str, Any]]
    tools: list[Dict[str, Any]]
    max_tokens: int
    temperature: Optional[float]
    thinking_mode: Optional[bool]
    loadout: Optional[Dict[str, list[str]]] = None


class ApprovalStore:
    """Thread-safe in-memory approval store; records vanish after one decision."""

    def __init__(self) -> None:
        self._items: Dict[str, PendingApproval] = {}
        self._lock = threading.Lock()

    def put(self, pending: PendingApproval) -> None:
        with self._lock:
            self._items[pending.approval_id] = pending

    def take(self, approval_id: str, session_id: str) -> Optional[PendingApproval]:
        """Consumes an approval only when it belongs to the active session."""
        with self._lock:
            pending = self._items.get(approval_id)
            if pending is None or pending.session_id != session_id:
                return None
            return self._items.pop(approval_id)

    def create_id(self) -> str:
        return secrets.token_urlsafe(18)


approval_store = ApprovalStore()
