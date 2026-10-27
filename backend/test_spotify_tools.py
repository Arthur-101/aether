"""Tests for Spotify tool formatting, resolution, and error mapping."""

import io
import json
from urllib.error import HTTPError

from backend.mcp_tools import spotify_tools

TRACK = {
    "type": "track",
    "name": "One More Time",
    "uri": "spotify:track:abc123",
    "duration_ms": 320000,
    "artists": [{"name": "Daft Punk"}],
    "album": {"name": "Discovery"},
}

DEVICES = [
    {
        "id": "desktop-id",
        "name": "Desktop",
        "type": "Computer",
        "is_active": True,
        "volume_percent": 40,
    },
    {
        "id": "phone-id",
        "name": "Phone",
        "type": "Smartphone",
        "is_active": False,
        "volume_percent": 70,
    },
]


def test_search_formats_tracks_and_uses_market(monkeypatch):
    calls = []

    def fake_api(method, path, params=None, body=None):
        calls.append((method, path, params, body))
        return {"tracks": {"items": [TRACK]}}

    monkeypatch.setattr(spotify_tools, "_api", fake_api)
    out = spotify_tools.spotify_search("daft punk", n=3)
    assert "One More Time" in out
    assert "Daft Punk" in out
    assert "Discovery" in out
    assert "spotify:track:abc123" in out
    assert calls[0][2]["limit"] == 3
    assert calls[0][2]["market"] == "from_token"


def test_search_rejects_unknown_type():
    assert "Search type" in spotify_tools.spotify_search("x", type="episode")


def test_play_track_uri_uses_uris(monkeypatch):
    calls = []
    monkeypatch.setattr(spotify_tools, "_ensure_device", lambda: None)
    monkeypatch.setattr(
        spotify_tools,
        "_api",
        lambda method, path, params=None, body=None: calls.append(
            (method, path, body)
        )
        or {},
    )
    out = spotify_tools.spotify_play("spotify:track:abc123")
    assert "Playing spotify:track:abc123" in out
    assert calls[-1] == (
        "PUT",
        "/me/player/play",
        {"uris": ["spotify:track:abc123"]},
    )


def test_play_album_uri_uses_context(monkeypatch):
    calls = []
    monkeypatch.setattr(spotify_tools, "_ensure_device", lambda: None)
    monkeypatch.setattr(
        spotify_tools,
        "_api",
        lambda method, path, params=None, body=None: calls.append(
            (method, path, body)
        )
        or {},
    )
    out = spotify_tools.spotify_play("spotify:album:xyz789")
    assert "Playing spotify:album:xyz789" in out
    assert calls[-1][2] == {"context_uri": "spotify:album:xyz789"}


def test_play_resolves_search_text(monkeypatch):
    monkeypatch.setattr(spotify_tools, "_ensure_device", lambda: None)

    def fake_api(method, path, params=None, body=None):
        if path == "/search":
            return {"tracks": {"items": [TRACK]}}
        return {}

    monkeypatch.setattr(spotify_tools, "_api", fake_api)
    out = spotify_tools.spotify_play("one more time")
    assert "Playing One More Time by Daft Punk." in out


def test_play_reports_missing_device(monkeypatch):
    monkeypatch.setattr(
        spotify_tools, "_ensure_device", lambda: "No active Spotify device."
    )
    out = spotify_tools.spotify_play("spotify:track:abc123")
    assert "No active Spotify device" in out


def test_queue_rejects_album_uri():
    assert "Only tracks" in spotify_tools.spotify_queue("spotify:album:xyz789")


def test_queue_resolves_and_posts_uri(monkeypatch):
    calls = []
    monkeypatch.setattr(spotify_tools, "_ensure_device", lambda: None)

    def fake_api(method, path, params=None, body=None):
        if path == "/search":
            return {"tracks": {"items": [TRACK]}}
        calls.append((method, path, params, body))
        return {}

    monkeypatch.setattr(spotify_tools, "_api", fake_api)
    out = spotify_tools.spotify_queue("one more time")
    assert "Queued One More Time by Daft Punk." in out
    assert calls[-1] == (
        "POST",
        "/me/player/queue",
        {"uri": "spotify:track:abc123"},
        None,
    )


def test_list_devices_shows_active_and_volume(monkeypatch):
    monkeypatch.setattr(spotify_tools, "_api", lambda *_a, **_k: {"devices": DEVICES})
    out = spotify_tools.spotify_list_devices()
    assert "Desktop" in out and "active" in out and "volume 40%" in out
    assert "Phone" in out and "phone-id" in out


def test_transfer_ambiguous_device_lists_matches(monkeypatch):
    monkeypatch.setattr(
        spotify_tools,
        "_api",
        lambda *_a, **_k: {
            "devices": [
                {"id": "a", "name": "Echo", "is_active": False},
                {"id": "b", "name": "Echo Dot", "is_active": False},
            ]
        },
    )
    out = spotify_tools.spotify_transfer("ech")
    assert "Multiple devices" in out
    assert "Echo, Echo Dot" in out


def test_transfer_exact_name_sends_device_id(monkeypatch):
    calls = []

    def fake_api(method, path, params=None, body=None):
        if path == "/me/player/devices":
            return {"devices": DEVICES}
        calls.append((method, path, body))
        return {}

    monkeypatch.setattr(spotify_tools, "_api", fake_api)
    out = spotify_tools.spotify_transfer("phone", play=True)
    assert "Transferred playback to Phone and resumed playback." in out
    assert calls[-1] == (
        "PUT",
        "/me/player",
        {"device_ids": ["phone-id"], "play": True},
    )


def test_transfer_unknown_device(monkeypatch):
    monkeypatch.setattr(spotify_tools, "_api", lambda *_a, **_k: {"devices": DEVICES})
    out = spotify_tools.spotify_transfer("watch")
    assert "No Spotify device matches" in out


def test_volume_clamps_to_100(monkeypatch):
    captured = {}
    monkeypatch.setattr(spotify_tools, "_ensure_device", lambda: None)

    def fake_api(method, path, params=None, body=None):
        captured.update(params or {})
        return {}

    monkeypatch.setattr(spotify_tools, "_api", fake_api)
    out = spotify_tools.spotify_set_volume(150)
    assert "100%" in out
    assert captured["volume_percent"] == 100


def test_repeat_rejects_unknown_state():
    assert "track, context, or off" in spotify_tools.spotify_set_repeat("forever")


def test_like_current_track_uses_library_endpoint(monkeypatch):
    calls = []

    def fake_api(method, path, params=None, body=None):
        if path == "/me/player/currently-playing":
            return {"item": TRACK}
        calls.append((method, path, params, body))
        return {}

    monkeypatch.setattr(spotify_tools, "_api", fake_api)
    out = spotify_tools.spotify_like()
    assert "Saved One More Time by Daft Punk to your library." in out
    assert calls[-1] == (
        "PUT",
        "/me/library",
        {"uris": "spotify:track:abc123"},
        None,
    )


def test_like_rejects_album_uri():
    assert "Only tracks" in spotify_tools.spotify_like("spotify:album:xyz789")


def test_liked_songs_formats_saved_tracks(monkeypatch):
    monkeypatch.setattr(
        spotify_tools,
        "_api",
        lambda *_a, **_k: {"items": [{"track": TRACK}]},
    )
    out = spotify_tools.spotify_liked_songs(5)
    assert "One More Time" in out
    assert "spotify:track:abc123" in out


def _http_error(code, body, headers=None):
    return HTTPError(
        "https://api.spotify.com/v1/test",
        code,
        "error",
        headers or {},
        io.BytesIO(json.dumps(body).encode("utf-8")),
    )


def test_http_error_mapping():
    assert "No active Spotify device" in str(
        spotify_tools._http_error(
            _http_error(404, {"error": {"reason": "NO_ACTIVE_DEVICE"}})
        )
    )
    assert "Premium" in str(spotify_tools._http_error(_http_error(403, {})))
    assert "7 seconds" in str(
        spotify_tools._http_error(
            _http_error(429, {}, {"Retry-After": "7"})
        )
    )
    assert "Reconnect" in str(spotify_tools._http_error(_http_error(401, {})))
    assert "Bad request" in str(
        spotify_tools._http_error(
            _http_error(400, {"error": {"message": "Bad request"}})
        )
    )


def test_uri_validation_accepts_only_supported_types():
    assert spotify_tools._spotify_uri("spotify:track:abc123") == "spotify:track:abc123"
    assert spotify_tools._spotify_uri("spotify:album:xyz789") == "spotify:album:xyz789"
    assert spotify_tools._spotify_uri("spotify:episode:abc123") is None
    assert spotify_tools._spotify_uri("https://open.spotify.com/track/abc123") is None


def test_spotify_schemas_and_dispatch_are_registered():
    from backend.mcp_tools.server import TOOL_DISPATCH, get_openai_tool_schemas

    expected = {
        "spotify_search",
        "spotify_play",
        "spotify_queue",
        "spotify_set_shuffle",
        "spotify_set_repeat",
        "spotify_set_volume",
        "spotify_list_devices",
        "spotify_transfer",
        "spotify_like",
        "spotify_liked_songs",
    }
    schema_names = {item["function"]["name"] for item in get_openai_tool_schemas()}
    assert expected <= schema_names
    assert expected <= set(TOOL_DISPATCH)
