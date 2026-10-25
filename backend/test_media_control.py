"""Regression tests for the SMTC control queue.

Media control used to run through a fresh event loop on the shared default
executor. Manager.request_async() can block forever in that context, so every
click leaked one executor worker; once the pool was empty, media controls,
taskbar launches and session actions all stopped responding.
"""

import asyncio
from concurrent.futures import Future

from backend.os_hooks import media_service
from backend.os_hooks.media_service import MediaPoller


class _Session:
    def __init__(self, result: bool = True) -> None:
        self.calls = []
        self.result = result

    async def try_play_async(self) -> bool:
        self.calls.append("play")
        return self.result

    async def try_toggle_play_pause_async(self) -> bool:
        self.calls.append("play_pause")
        return self.result


class _Manager:
    def __init__(self, session: _Session | None) -> None:
        self.session = session

    def get_current_session(self):
        return self.session


def test_poller_applies_queued_actions_on_its_own_thread():
    poller = MediaPoller()
    session = _Session()
    future: Future = Future()
    poller._controls.put(("play_pause", future))

    applied = asyncio.run(poller._run_controls(_Manager(session)))

    assert applied is True
    assert future.result(timeout=0) is True
    assert session.calls == ["play_pause"]


def test_poller_reports_a_missing_session_without_raising():
    poller = MediaPoller()
    future: Future = Future()
    poller._controls.put(("play", future))

    applied = asyncio.run(poller._run_controls(_Manager(None)))

    assert applied is False
    assert future.result(timeout=0) is False


def test_latest_snapshot_reads_the_cache_and_never_captures(monkeypatch):
    cached = {"title": "Cached", "is_playing": True}
    monkeypatch.setattr(media_service.media_poller, "_latest", None)

    snapshot = media_service.latest_media_snapshot()
    assert snapshot["status"] == "unavailable"
    assert "Waiting" in snapshot["message"]

    monkeypatch.setattr(media_service.media_poller, "_latest", cached)
    assert media_service.latest_media_snapshot() is cached


def test_poller_event_loop_attribute_does_not_shadow_its_method():
    poller = MediaPoller()

    assert poller._event_loop is None
    assert callable(poller._loop)
