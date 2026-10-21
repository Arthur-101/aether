"""SMTC snapshot construction for the shared Aether media widget."""

from __future__ import annotations

import asyncio
import base64
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger("aether.media")


def seconds(value: Any) -> float:
    """Converts a winsdk timedelta or number into non-negative seconds."""
    if value is None:
        return 0.0
    try:
        return max(0.0, float(value.total_seconds()))
    except AttributeError:
        try:
            return max(0.0, float(value))
        except (TypeError, ValueError):
            return 0.0


def source_identity(raw: str) -> tuple[str, str, bool]:
    """Returns (source_id, display label, is_spotify)."""
    cleaned = (raw or "").strip()
    lower = cleaned.lower()
    if not lower:
        return "", "Media", False
    stem = lower.rsplit("\\", 1)[-1].rsplit("/", 1)[-1]
    if "!" in stem:
        stem = stem.split("!", 1)[0].split("_", 1)[0]
    if stem.endswith(".exe"):
        stem = stem[:-4]
    is_spotify = "spotify" in lower or "spotif" in lower
    labels = {
        "spotify": "Spotify",
        "spotifast": "Spotifast",
        "chrome": "Chrome",
        "msedge": "Edge",
        "firefox": "Firefox",
        "brave": "Brave",
        "opera": "Opera",
        "vlc": "VLC",
        "wmplayer": "Media Player",
        "music": "Media",
    }
    label = labels.get(stem, stem.replace("_", " ").title() or "Media")
    return stem, label, is_spotify


def status_name(status: int) -> str:
    return dict(zip(range(6), ("closed", "opened", "changing", "stopped", "playing", "paused"))).get(
        status, "unknown"
    )


def unavailable_snapshot(
    message: str = "Windows media controls are unavailable.",
) -> Dict[str, Any]:
    return {
        "available": False,
        "has_session": False,
        "is_playing": False,
        "status": "unavailable",
        "source": "",
        "source_id": "",
        "source_label": "",
        "is_spotify": False,
        "title": "",
        "artist": "",
        "album": "",
        "artwork": None,
        "position_seconds": 0.0,
        "duration_seconds": 0.0,
        "can_play": False,
        "can_pause": False,
        "can_next": False,
        "can_previous": False,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "message": message,
    }


def empty_session_snapshot(
    message: str = "No active media session.",
) -> Dict[str, Any]:
    snapshot = unavailable_snapshot(message)
    snapshot.update({"available": True, "status": "idle"})
    return snapshot


async def _read_artwork(
    thumbnail: Any, cache: Optional[Dict[str, Any]], key: str
) -> Optional[str]:
    if not thumbnail:
        return None
    if cache is not None and cache.get("key") == key:
        return cache.get("value")
    try:
        from winsdk.windows.storage.streams import DataReader

        stream = await thumbnail.open_read_async()
        size = int(getattr(stream, "size", 0) or 0)
        if size <= 0 or size > 8 * 1024 * 1024:
            return None
        reader = DataReader(stream)
        await reader.load_async(size)
        buffer = reader.read_buffer(size)
        payload = bytes(memoryview(buffer))
        raw_mime = getattr(stream, "content_type", "") or ""
        if payload.startswith(b"\xff\xd8\xff"):
            mime = "image/jpeg"
        elif payload.startswith(b"\x89PNG\r\n\x1a\n"):
            mime = "image/png"
        elif payload[:4] == b"RIFF" and payload[8:12] == b"WEBP":
            mime = "image/webp"
        else:
            mime = raw_mime.split(",", 1)[0].strip() or "image/jpeg"
        uri = f"data:{mime};base64,{base64.b64encode(payload).decode('ascii')}"
        if cache is not None:
            cache["key"] = key
            cache["value"] = uri
        return uri
    except Exception as exc:
        logger.debug("Album art read failed: %s", exc)
        return None


async def capture_snapshot(
    manager: Any, art_cache: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Reads one now-playing snapshot from the active SMTC session."""
    session = manager.get_current_session()
    if session is None:
        sessions = list(manager.get_sessions() or [])
        session = sessions[0] if sessions else None
    if session is None:
        return empty_session_snapshot()

    try:
        properties = await session.try_get_media_properties_async()
    except Exception:
        properties = None
    if properties is None:
        return empty_session_snapshot()

    try:
        playback = session.get_playback_info()
    except Exception:
        playback = None
    try:
        timeline = session.get_timeline_properties()
    except Exception:
        timeline = None
    controls = getattr(playback, "controls", None) if playback else None
    raw_status = getattr(playback, "playback_status", 0) if playback else 0
    try:
        status = int(raw_status)
    except (TypeError, ValueError):
        status = 0
    playing = status == 4

    start = seconds(getattr(timeline, "start_time", 0)) if timeline else 0.0
    end = seconds(getattr(timeline, "end_time", 0)) if timeline else 0.0
    position = seconds(getattr(timeline, "position", 0)) if timeline else 0.0
    position = max(0.0, position - start)
    duration = max(0.0, end - start)
    if playing and timeline is not None:
        updated = getattr(timeline, "last_updated_time", None)
        if updated:
            try:
                elapsed = (datetime.now(timezone.utc) - updated).total_seconds()
                position += max(0.0, min(elapsed, 4.0))
            except Exception:
                pass
    if duration:
        position = min(position, duration)

    raw_source = str(getattr(session, "source_app_user_model_id", "") or "")
    source_id, source_label, is_spotify = source_identity(raw_source)
    title = str(getattr(properties, "title", "") or "").strip()
    artist = str(getattr(properties, "artist", "") or "").strip()
    album = str(getattr(properties, "album_title", "") or "").strip()
    art_key = f"{source_id}|{title}|{artist}|{album}"
    artwork = await _read_artwork(
        getattr(properties, "thumbnail", None), art_cache, art_key
    )
    return {
        "available": True,
        "has_session": True,
        "is_playing": playing,
        "status": status_name(status),
        "source": raw_source,
        "source_id": source_id,
        "source_label": source_label,
        "is_spotify": is_spotify,
        "title": title or "Unknown track",
        "artist": artist or "Unknown artist",
        "album": album,
        "artwork": artwork,
        "position_seconds": round(position, 2),
        "duration_seconds": round(duration, 2),
        "can_play": bool(getattr(controls, "is_play_enabled", False)),
        "can_pause": bool(getattr(controls, "is_pause_enabled", False)),
        "can_next": bool(getattr(controls, "is_next_enabled", False)),
        "can_previous": bool(getattr(controls, "is_previous_enabled", False)),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "message": "",
    }


def snapshot_differs(old: Optional[Dict[str, Any]], new: Dict[str, Any]) -> bool:
    if old is None:
        return True
    fields = (
        "available", "has_session", "is_playing", "status", "source_id", "title",
        "artist", "album", "artwork", "duration_seconds", "can_play", "can_pause",
        "can_next", "can_previous", "message",
    )
    if any(old.get(field) != new.get(field) for field in fields):
        return True
    return new.get("is_playing") and int(old.get("position_seconds", 0)) != int(
        new.get("position_seconds", 0)
    )


async def _capture_once() -> Dict[str, Any]:
    try:
        from winsdk.windows.media.control import (
            GlobalSystemMediaTransportControlsSessionManager as Manager,
        )

        manager = await Manager.request_async()
        return await capture_snapshot(manager)
    except Exception as exc:
        logger.debug("Media capture unavailable: %s", exc)
        return unavailable_snapshot(str(exc) or "Windows media controls are unavailable.")


def capture_media() -> Dict[str, Any]:
    """Synchronous one-shot snapshot for request handlers and tests."""
    try:
        return asyncio.run(_capture_once())
    except Exception as exc:
        return unavailable_snapshot(str(exc))
