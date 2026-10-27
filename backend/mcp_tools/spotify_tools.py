"""Spotify playback, search, device, and library tools.

All calls go through the Web API using the PKCE session from
``os_hooks/spotify_auth.py``. Tools are synchronous and run in the existing
chat worker thread, never on the WebSocket loop.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from ..os_hooks import spotify_auth
from ..os_hooks.spotify_auth import SpotifyAuthError

API_BASE = "https://api.spotify.com/v1"
NETWORK_TIMEOUT = 12.0
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
MAX_SEARCH = 10
MAX_LIKED = 50
USER_AGENT = "Aether/0.2 (local assistant; Spotify integration)"
_URI_RE = re.compile(r"^spotify:(track|album|artist|playlist):([A-Za-z0-9]+)$")


class SpotifyAPIError(RuntimeError):
    """User-facing Spotify Web API failure."""

    def __init__(self, message: str, status: int = 0) -> None:
        super().__init__(message)
        self.status = status


def _http_error(exc: HTTPError) -> SpotifyAPIError:
    payload: Any = {}
    try:
        payload = json.loads(exc.read().decode("utf-8"))
    except (OSError, ValueError):
        payload = {}
    error = payload.get("error") if isinstance(payload, dict) else None
    reason = str(error.get("reason") or "") if isinstance(error, dict) else ""
    detail = str(error.get("message") or "") if isinstance(error, dict) else ""
    if exc.code == 401:
        return SpotifyAPIError(
            "Spotify rejected the session. Reconnect in Settings → Integrations.", 401
        )
    if exc.code == 403:
        return SpotifyAPIError(
            "Spotify refused this action. Playback control requires Spotify Premium, "
            "and some devices block volume changes.",
            403,
        )
    if exc.code == 404:
        if reason in {"", "NO_ACTIVE_DEVICE"}:
            return SpotifyAPIError(
                "No active Spotify device. Open Spotify and start playback, or use "
                "spotify_list_devices.",
                404,
            )
        return SpotifyAPIError("Spotify could not find that item.", 404)
    if exc.code == 429:
        retry = exc.headers.get("Retry-After") if exc.headers else None
        suffix = f" in {retry} seconds" if retry else " shortly"
        return SpotifyAPIError(f"Spotify rate limit reached. Try again{suffix}.", 429)
    if exc.code >= 500:
        return SpotifyAPIError(
            f"Spotify is unavailable right now (HTTP {exc.code}).", exc.code
        )
    return SpotifyAPIError(
        detail or f"Spotify request failed (HTTP {exc.code}).", exc.code
    )


def _api(
    method: str,
    path: str,
    params: Optional[Dict[str, Any]] = None,
    body: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Calls the Web API, refreshing once on a 401."""
    url = API_BASE + path
    if params:
        url += "?" + urlencode(
            {key: value for key, value in params.items() if value is not None}
        )
    data = json.dumps(body).encode("utf-8") if body is not None else None

    for attempt in (0, 1):
        headers = {
            "Authorization": f"Bearer {spotify_auth.get_access_token(force_refresh=attempt == 1)}",
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        }
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = Request(url, data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=NETWORK_TIMEOUT) as response:
                raw = response.read(MAX_RESPONSE_BYTES)
        except HTTPError as exc:
            if exc.code == 401 and attempt == 0:
                continue
            if exc.code == 401:
                spotify_auth.forget_session()
            raise _http_error(exc) from exc
        except (URLError, TimeoutError) as exc:
            raise SpotifyAPIError(f"Could not reach Spotify: {exc}") from exc
        if not raw:
            return {}
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise SpotifyAPIError("Spotify returned an unreadable response.") from exc
        return payload if isinstance(payload, dict) else {}

    raise SpotifyAPIError("Spotify rejected the session. Reconnect in Settings → Integrations.", 401)


def _spotify_uri(value: str) -> Optional[str]:
    match = _URI_RE.match((value or "").strip())
    return f"spotify:{match.group(1)}:{match.group(2)}" if match else None


def _uri_kind(uri: str) -> str:
    return uri.split(":")[1]


def _artists(item: Dict[str, Any]) -> str:
    names = [
        str(artist.get("name") or "")
        for artist in item.get("artists") or []
        if isinstance(artist, dict)
    ]
    return ", ".join(name for name in names if name) or "Unknown artist"


def _duration(ms: Any) -> str:
    try:
        seconds = int(ms) // 1000
    except (TypeError, ValueError):
        return ""
    return f"{seconds // 60}:{seconds % 60:02d}"


def _clamp_int(value: Any, default: int, low: int, high: int) -> int:
    try:
        return max(low, min(high, int(value)))
    except (TypeError, ValueError):
        return default


def _describe(kind: str, item: Dict[str, Any]) -> str:
    name = str(item.get("name") or "Untitled")
    if kind == "track":
        return f"{name} by {_artists(item)}"
    if kind == "album":
        return f"album {name} by {_artists(item)}"
    if kind == "playlist":
        return f"playlist {name}"
    return name


def _format_item(kind: str, item: Dict[str, Any]) -> str:
    name = str(item.get("name") or "Untitled")
    uri = str(item.get("uri") or "")
    if kind == "track":
        album = str((item.get("album") or {}).get("name") or "")
        duration = _duration(item.get("duration_ms"))
        extra = f" ({album})" if album else ""
        return f"{name} — {_artists(item)}{extra}{f' · {duration}' if duration else ''} [{uri}]"
    if kind == "playlist":
        owner = str((item.get("owner") or {}).get("display_name") or "")
        section = item.get("items") or item.get("tracks") or {}
        total = section.get("total") if isinstance(section, dict) else None
        bits = [name]
        if owner:
            bits.append(f"by {owner}")
        if isinstance(total, int):
            bits.append(f"{total} tracks")
        return f"{' · '.join(bits)} [{uri}]"
    if kind == "album":
        release = str(item.get("release_date") or "")[:4]
        return f"{name} — {_artists(item)}{f' · {release}' if release else ''} [{uri}]"
    return f"{name} [{uri}]"


def _search(query: str, kind: str, limit: int) -> List[Dict[str, Any]]:
    payload = _api(
        "GET",
        "/search",
        {
            "q": query[:200],
            "type": kind,
            "limit": _clamp_int(limit, 5, 1, MAX_SEARCH),
            "market": "from_token",
        },
    )
    section = payload.get(kind + "s") or {}
    items = section.get("items") if isinstance(section, dict) else []
    return [item for item in items or [] if isinstance(item, dict)]


def _devices() -> List[Dict[str, Any]]:
    payload = _api("GET", "/me/player/devices")
    devices = payload.get("devices") if isinstance(payload, dict) else []
    return [device for device in devices or [] if isinstance(device, dict)]


def _device_label(device: Dict[str, Any]) -> str:
    return str(device.get("name") or "Unknown device")


def _ensure_device() -> Optional[str]:
    """Returns an error string when no active device can be selected."""
    devices = _devices()
    if not devices:
        return "No Spotify devices are online. Open Spotify on a phone or computer first."
    if any(device.get("is_active") for device in devices):
        return None
    usable = [device for device in devices if device.get("id")]
    if len(usable) == 1:
        _api("PUT", "/me/player", body={"device_ids": [usable[0]["id"]], "play": False})
        return None
    names = ", ".join(_device_label(device) for device in usable)
    return f"No active Spotify device. Available: {names}. Use spotify_transfer to choose one."


def _resolve_playable(query: str) -> Tuple[str, str, str]:
    """Returns (kind, uri, human label) for a URI or search phrase."""
    text = (query or "").strip()
    if not text:
        raise SpotifyAPIError("Provide a track, album, artist, or playlist to play.")
    uri = _spotify_uri(text)
    if uri:
        return _uri_kind(uri), uri, ""
    for kind in ("track", "playlist", "album", "artist"):
        items = _search(text, kind, 1)
        if items:
            item = items[0]
            item_uri = str(item.get("uri") or "")
            if item_uri:
                return kind, item_uri, _describe(kind, item)
    raise SpotifyAPIError(f"No Spotify match for '{text}'.")


def _find_device(
    devices: List[Dict[str, Any]], wanted: str
) -> Tuple[Optional[Dict[str, Any]], str]:
    text = (wanted or "").strip()
    if not text:
        return None, "Provide a Spotify device name or id."
    usable = [device for device in devices if device.get("id")]
    exact_id = [device for device in usable if str(device["id"]) == text]
    if len(exact_id) == 1:
        return exact_id[0], ""
    exact_name = [
        device
        for device in usable
        if str(device.get("name") or "").casefold() == text.casefold()
    ]
    if len(exact_name) == 1:
        return exact_name[0], ""
    matches = [
        device
        for device in usable
        if text.casefold() in str(device.get("name") or "").casefold()
    ]
    if len(matches) == 1:
        return matches[0], ""
    available = ", ".join(_device_label(device) for device in usable) or "none"
    if not matches:
        return None, f"No Spotify device matches '{text}'. Available: {available}."
    names = ", ".join(_device_label(device) for device in matches)
    return None, f"Multiple devices match '{text}': {names}. Use the full name or id."


def spotify_search(query: str, type: str = "track", n: int = 5) -> str:
    """Searches Spotify for tracks, albums, artists, or playlists."""
    phrase = (query or "").strip()
    if not phrase:
        return "Provide a search query."
    kind = (type or "track").strip().lower()
    if kind not in {"track", "album", "artist", "playlist"}:
        return "Search type must be track, album, artist, or playlist."
    try:
        items = _search(phrase, kind, n)
    except (SpotifyAuthError, SpotifyAPIError) as exc:
        return str(exc)
    if not items:
        return f"No Spotify {kind} results for '{phrase}'."
    lines = [f"Spotify {kind} results for '{phrase}':"]
    for index, item in enumerate(items, start=1):
        lines.append(f"{index}. {_format_item(kind, item)}")
    return "\n".join(lines)


def spotify_play(query: str) -> str:
    """Plays a track, album, artist, or playlist on the active device."""
    try:
        kind, uri, label = _resolve_playable(query)
        error = _ensure_device()
        if error:
            return error
        body = {"uris": [uri]} if kind == "track" else {"context_uri": uri}
        _api("PUT", "/me/player/play", body=body)
    except (SpotifyAuthError, SpotifyAPIError) as exc:
        return str(exc)
    return f"Playing {label}." if label else f"Playing {uri}."


def spotify_queue(query: str) -> str:
    """Adds a track to the Spotify queue."""
    try:
        text = (query or "").strip()
        if not text:
            return "Provide a track to queue."
        uri = _spotify_uri(text)
        if uri and _uri_kind(uri) != "track":
            return "Only tracks can be added to the queue."
        label = ""
        if not uri:
            items = _search(text, "track", 1)
            if not items:
                return f"No Spotify track found for '{text}'."
            item = items[0]
            uri = str(item.get("uri") or "")
            label = _describe("track", item)
        if not uri:
            return f"No Spotify track found for '{text}'."
        error = _ensure_device()
        if error:
            return error
        _api("POST", "/me/player/queue", params={"uri": uri})
    except (SpotifyAuthError, SpotifyAPIError) as exc:
        return str(exc)
    return f"Queued {label}." if label else f"Queued {uri}."


def spotify_set_shuffle(enabled: bool) -> str:
    """Turns Spotify shuffle on or off."""
    try:
        error = _ensure_device()
        if error:
            return error
        _api("PUT", "/me/player/shuffle", params={"state": "true" if enabled else "false"})
    except (SpotifyAuthError, SpotifyAPIError) as exc:
        return str(exc)
    return f"Spotify shuffle {'on' if enabled else 'off'}."


def spotify_set_repeat(state: str) -> str:
    """Sets Spotify repeat mode to track, context, or off."""
    value = (state or "").strip().lower()
    if value not in {"track", "context", "off"}:
        return "Repeat state must be track, context, or off."
    try:
        error = _ensure_device()
        if error:
            return error
        _api("PUT", "/me/player/repeat", params={"state": value})
    except (SpotifyAuthError, SpotifyAPIError) as exc:
        return str(exc)
    return f"Spotify repeat set to {value}."


def spotify_set_volume(percent: int) -> str:
    """Sets Spotify playback volume between 0 and 100."""
    try:
        level = max(0, min(100, int(percent)))
    except (TypeError, ValueError):
        return "Volume must be a number from 0 to 100."
    try:
        error = _ensure_device()
        if error:
            return error
        _api("PUT", "/me/player/volume", params={"volume_percent": level})
    except (SpotifyAuthError, SpotifyAPIError) as exc:
        return str(exc)
    return f"Spotify volume set to {level}%."


def spotify_list_devices() -> str:
    """Lists available Spotify Connect devices."""
    try:
        devices = _devices()
    except (SpotifyAuthError, SpotifyAPIError) as exc:
        return str(exc)
    if not devices:
        return "No Spotify devices are online. Open Spotify on a phone or computer first."
    lines = ["Spotify devices:"]
    for index, device in enumerate(devices, start=1):
        bits = [
            str(device.get("name") or "Unknown device"),
            f"({device.get('type') or 'unknown'})",
        ]
        if device.get("is_active"):
            bits.append("active")
        volume = device.get("volume_percent")
        if isinstance(volume, int):
            bits.append(f"volume {volume}%")
        if device.get("id"):
            bits.append(f"id {device['id']}")
        lines.append(f"{index}. {' — '.join(bits)}")
    return "\n".join(lines)


def spotify_transfer(device: str, play: bool = False) -> str:
    """Moves playback to another Spotify device."""
    try:
        devices = _devices()
        if not devices:
            return "No Spotify devices are online. Open Spotify on a phone or computer first."
        match, error = _find_device(devices, device)
        if error:
            return error
        assert match is not None
        _api(
            "PUT",
            "/me/player",
            body={"device_ids": [match["id"]], "play": bool(play)},
        )
    except (SpotifyAuthError, SpotifyAPIError) as exc:
        return str(exc)
    suffix = " and resumed playback." if play else "."
    return f"Transferred playback to {_device_label(match)}{suffix}"


def spotify_like(query: str = "") -> str:
    """Saves a track to the user's library; empty means the current track."""
    try:
        text = (query or "").strip()
        uri = ""
        label = ""
        if not text or text.casefold() in {
            "current",
            "current song",
            "this",
            "this song",
            "now",
        }:
            payload = _api("GET", "/me/player/currently-playing")
            item = payload.get("item") if isinstance(payload, dict) else None
            if not isinstance(item, dict) or not item.get("uri"):
                return "Nothing is playing on Spotify right now."
            if item.get("type") not in {None, "track"}:
                return "The current Spotify item is not a track."
            uri = str(item["uri"])
            label = _describe("track", item)
        else:
            uri = _spotify_uri(text) or ""
            if uri and _uri_kind(uri) != "track":
                return "Only tracks can be saved to your library."
            if not uri:
                items = _search(text, "track", 1)
                if not items:
                    return f"No Spotify track found for '{text}'."
                item = items[0]
                uri = str(item.get("uri") or "")
                label = _describe("track", item)
        if not uri:
            return f"No Spotify track found for '{text}'."
        _api("PUT", "/me/library", params={"uris": uri})
    except (SpotifyAuthError, SpotifyAPIError) as exc:
        return str(exc)
    return f"Saved {label} to your library." if label else "Saved the track to your library."


def spotify_liked_songs(limit: int = 20) -> str:
    """Lists the user's most recently liked songs."""
    try:
        count = _clamp_int(limit, 20, 1, MAX_LIKED)
        payload = _api("GET", "/me/tracks", params={"limit": count, "offset": 0})
    except (SpotifyAuthError, SpotifyAPIError) as exc:
        return str(exc)
    items = payload.get("items") if isinstance(payload, dict) else []
    if not items:
        return "Your liked songs list is empty."
    lines = [f"Your {len(items)} most recent liked songs:"]
    for index, entry in enumerate(items, start=1):
        track = entry.get("track") if isinstance(entry, dict) else None
        if isinstance(track, dict):
            lines.append(f"{index}. {_format_item('track', track)}")
    if len(lines) == 1:
        return "No playable liked songs found."
    return "\n".join(lines)


def get_spotify_tool_schemas() -> List[Dict[str, Any]]:
    """OpenAI/GGUF function schemas for the Spotify tool group."""
    return [
        {
            "type": "function",
            "function": {
                "name": "spotify_search",
                "description": (
                    "Search Spotify for tracks, albums, artists, or playlists. "
                    "Requires Spotify connected in Settings → Integrations."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search phrase."},
                        "type": {
                            "type": "string",
                            "enum": ["track", "album", "artist", "playlist"],
                            "description": "Item type (default track).",
                        },
                        "n": {
                            "type": "integer",
                            "description": "Results per type, 1 to 10 (default 5).",
                        },
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "spotify_play",
                "description": (
                    "Play a track, album, artist, or playlist on the active Spotify device. "
                    "Pass a search phrase or a spotify: URI. Requires Spotify Premium."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search phrase or spotify: track/album/artist/playlist URI.",
                        }
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "spotify_queue",
                "description": "Add a track to the Spotify queue.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search phrase or spotify:track URI.",
                        }
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "spotify_set_shuffle",
                "description": "Turn Spotify shuffle on or off.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "enabled": {"type": "boolean", "description": "True for on."}
                    },
                    "required": ["enabled"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "spotify_set_repeat",
                "description": "Set Spotify repeat mode.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "state": {
                            "type": "string",
                            "enum": ["track", "context", "off"],
                            "description": "Repeat mode.",
                        }
                    },
                    "required": ["state"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "spotify_set_volume",
                "description": "Set Spotify playback volume from 0 to 100.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "percent": {
                            "type": "integer",
                            "description": "Volume percentage, 0 to 100.",
                        }
                    },
                    "required": ["percent"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "spotify_list_devices",
                "description": "List available Spotify Connect devices.",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "spotify_transfer",
                "description": "Move Spotify playback to a device by name or id.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "device": {
                            "type": "string",
                            "description": "Device name or Spotify device id.",
                        },
                        "play": {
                            "type": "boolean",
                            "description": "Resume playback after transferring.",
                        },
                    },
                    "required": ["device"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "spotify_like",
                "description": (
                    "Save a track to the user's Spotify library. Omit query to save the "
                    "currently playing track."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search phrase or spotify:track URI; omit for current track.",
                        }
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "spotify_liked_songs",
                "description": "List the user's most recently liked Spotify songs.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "description": "Number of songs, 1 to 50 (default 20).",
                        }
                    },
                },
            },
        },
    ]
