"""
Aether Media Control Tools
Deterministic music transport tools for the LLM: play / pause / toggle, track
skip, and a read-only now-playing report.

SMTC is owned by the media poller's own thread (Rule 5). The transport tools
push onto that queue through `control_media_sync`, and `now_playing` only reads
the poller's cached snapshot. No tool talks to WinRT directly.

Every function returns a human-readable string because the result is fed back
to the model as a tool message.
"""

from typing import Any, Dict, List

from ..os_hooks.media_service import control_media_sync, latest_media_snapshot

CONTROL_FAILED = "The media player did not accept that command."


def _clock(seconds: Any) -> str:
    """Formats a duration as m:ss, or h:mm:ss once it passes an hour."""
    try:
        total = max(0, int(float(seconds)))
    except (TypeError, ValueError):
        total = 0
    minutes, secs = divmod(total, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def _transport(action: str, confirmation: str) -> str:
    """Runs one transport action and returns a human-readable result."""
    return confirmation if control_media_sync(action) else CONTROL_FAILED


def media_play() -> str:
    """Resumes playback on the active media player."""
    return _transport("play", "Playing.")


def media_pause() -> str:
    """Pauses the active media player."""
    return _transport("pause", "Paused.")


def media_toggle() -> str:
    """Toggles play/pause on the active media player."""
    return _transport("play_pause", "Toggled play/pause.")


def media_next() -> str:
    """Skips to the next track."""
    return _transport("next", "Skipped to the next track.")


def media_previous() -> str:
    """Returns to the previous track."""
    return _transport("previous", "Went to the previous track.")


def now_playing() -> str:
    """Reports what the active media player is playing right now."""
    snapshot = latest_media_snapshot()
    if not snapshot.get("available"):
        message = str(snapshot.get("message") or "Windows media controls are unavailable.")
        return f"Media controls are unavailable: {message}"
    if not snapshot.get("has_session"):
        return "Nothing is playing right now."

    title = str(snapshot.get("title") or "Unknown track")
    artist = str(snapshot.get("artist") or "")
    album = str(snapshot.get("album") or "")
    source = str(snapshot.get("source_label") or "")
    state = "playing" if snapshot.get("is_playing") else str(snapshot.get("status") or "paused")

    lines = [f"{title} — {artist}" if artist else title]
    if album:
        lines.append(f"Album: {album}")
    if source:
        lines.append(f"Player: {source}")
    duration = _clock(snapshot.get("duration_seconds"))
    if duration != "0:00":
        lines.append(f"Status: {state} · {_clock(snapshot.get('position_seconds'))} / {duration}")
    else:
        lines.append(f"Status: {state}")
    return "\n".join(lines)


def get_media_control_tool_schemas() -> List[Dict[str, Any]]:
    """OpenAI/GGUF function schemas for the music transport tool group."""
    return [
        {
            "type": "function",
            "function": {
                "name": "media_play",
                "description": "Resume playback on the active media player (Spotify, browser, etc.).",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "media_pause",
                "description": "Pause the active media player.",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "media_toggle",
                "description": "Toggle play/pause on the active media player.",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "media_next",
                "description": "Skip to the next track.",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "media_previous",
                "description": "Go back to the previous track.",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "now_playing",
                "description": "Report what the active media player is playing right now.",
                "parameters": {"type": "object", "properties": {}},
            },
        },
    ]
