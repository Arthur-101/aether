"""Media control tool tests: transport confirmations, now-playing, and the sync bridge."""

from concurrent.futures import Future

from backend.mcp_tools import media_control_tools
from backend.os_hooks import media_service


def _playing(**overrides):
    snapshot = {
        "available": True,
        "has_session": True,
        "is_playing": True,
        "status": "playing",
        "title": "Song",
        "artist": "Artist",
        "album": "Album",
        "source_label": "Spotify",
        "position_seconds": 65,
        "duration_seconds": 200,
        "message": "",
    }
    snapshot.update(overrides)
    return snapshot


def test_transport_confirmation_and_failure(monkeypatch):
    monkeypatch.setattr(media_control_tools, "control_media_sync", lambda _action: True)
    assert media_control_tools.media_play() == "Playing."
    assert media_control_tools.media_pause() == "Paused."
    assert media_control_tools.media_next() == "Skipped to the next track."

    monkeypatch.setattr(media_control_tools, "control_media_sync", lambda _action: False)
    assert media_control_tools.media_previous() == media_control_tools.CONTROL_FAILED


def test_transport_actions_are_mapped(monkeypatch):
    seen = []
    monkeypatch.setattr(
        media_control_tools, "control_media_sync", lambda action: seen.append(action) or True
    )
    media_control_tools.media_toggle()
    media_control_tools.media_next()
    media_control_tools.media_previous()
    assert seen == ["play_pause", "next", "previous"]


def test_now_playing_unavailable(monkeypatch):
    monkeypatch.setattr(
        media_control_tools,
        "latest_media_snapshot",
        lambda: {"available": False, "message": "SMTC offline."},
    )
    assert "unavailable" in media_control_tools.now_playing()
    assert "SMTC offline." in media_control_tools.now_playing()


def test_now_playing_no_session(monkeypatch):
    monkeypatch.setattr(
        media_control_tools,
        "latest_media_snapshot",
        lambda: {"available": True, "has_session": False},
    )
    assert media_control_tools.now_playing() == "Nothing is playing right now."


def test_now_playing_reports_track_details(monkeypatch):
    monkeypatch.setattr(
        media_control_tools, "latest_media_snapshot", lambda: _playing()
    )
    out = media_control_tools.now_playing()
    assert "Song — Artist" in out
    assert "Album: Album" in out
    assert "Player: Spotify" in out
    assert "1:05 / 3:20" in out


def test_now_playing_without_duration_omits_timer(monkeypatch):
    monkeypatch.setattr(
        media_control_tools,
        "latest_media_snapshot",
        lambda: _playing(is_playing=False, status="paused", duration_seconds=0),
    )
    out = media_control_tools.now_playing()
    assert "Status: paused" in out
    assert "/" not in out


def test_clock_formats_hours():
    assert media_control_tools._clock(65) == "1:05"
    assert media_control_tools._clock(3725) == "1:02:05"
    assert media_control_tools._clock(None) == "0:00"


def test_control_media_sync_bridges_the_poller(monkeypatch):
    class FakePoller:
        def __init__(self, ok):
            self.ok = ok
            self.actions = []

        def submit_control(self, action):
            self.actions.append(action)
            future = Future()
            future.set_result(self.ok)
            return future

    good = FakePoller(True)
    monkeypatch.setattr(media_service, "media_poller", good)
    assert media_service.control_media_sync("play") is True
    assert good.actions == ["play"]

    monkeypatch.setattr(media_service, "media_poller", FakePoller(False))
    assert media_service.control_media_sync("next") is False


def test_media_schemas_are_registered():
    from backend.mcp_tools.server import TOOL_DISPATCH, get_openai_tool_schemas

    schema_names = {item["function"]["name"] for item in get_openai_tool_schemas()}
    expected = {
        "media_play",
        "media_pause",
        "media_toggle",
        "media_next",
        "media_previous",
        "now_playing",
    }
    assert expected <= schema_names
    assert expected <= set(TOOL_DISPATCH)
