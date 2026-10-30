"""Tests for Quick Chat read-aloud routing and speech cleanup."""

import asyncio
import threading

from backend import tts_events


def test_plain_speech_text_strips_markdown():
    text = (
        "# Title\n\n"
        "**Bold** and *italic* with `inline` and a "
        "[link](https://example.com).\n\n"
        "```python\nprint('skip me')\n```\n\n"
        "- first item\n"
        "> quoted line"
    )

    cleaned = tts_events.plain_speech_text(text)

    assert "Title" in cleaned
    assert "Bold" in cleaned
    assert "italic" in cleaned
    assert "inline" in cleaned
    assert "link" in cleaned
    assert "first item" in cleaned
    assert "quoted line" in cleaned
    assert "print('skip me')" not in cleaned
    assert "https://" not in cleaned
    assert "**" not in cleaned
    assert "`" not in cleaned


def test_empty_reply_reports_nothing_to_read(monkeypatch):
    events = []

    async def fake_broadcast(event_type, payload):
        events.append((event_type, payload))

    monkeypatch.setattr(tts_events.ws_manager, "broadcast", fake_broadcast)

    asyncio.run(tts_events._handle_speak({"text": "```\ncode only\n```"}))

    assert events == [
        (
            "TTS_STATE",
            {
                "state": "idle",
                "request_id": "",
                "message": tts_events.EMPTY_NOTICE,
            },
        )
    ]


def test_unavailable_voice_reports_settings_hint(monkeypatch):
    events = []

    async def fake_broadcast(event_type, payload):
        events.append((event_type, payload))

    monkeypatch.setattr(tts_events.ws_manager, "broadcast", fake_broadcast)
    monkeypatch.setattr(tts_events.tts_engine, "is_available", lambda: False)

    asyncio.run(tts_events._handle_speak({"text": "Hello", "request_id": "r1"}))

    assert events == [
        (
            "TTS_STATE",
            {
                "state": "idle",
                "request_id": "r1",
                "message": tts_events.UNAVAILABLE_NOTICE,
            },
        )
    ]


def test_speak_broadcasts_speaking_then_idle(monkeypatch):
    events = []
    spoken = []

    async def fake_broadcast(event_type, payload):
        events.append((event_type, payload))

    monkeypatch.setattr(tts_events.ws_manager, "broadcast", fake_broadcast)
    monkeypatch.setattr(tts_events.tts_engine, "is_available", lambda: True)
    monkeypatch.setattr(
        tts_events.tts_engine,
        "speak",
        lambda text, **kwargs: spoken.append((text, kwargs)),
    )
    monkeypatch.setattr(tts_events, "_stop_audio", lambda: None)

    async def run():
        await tts_events._handle_speak({"text": "**Hello**", "request_id": "r1"})
        pending = [
            task
            for task in asyncio.all_tasks()
            if task is not asyncio.current_task()
        ]
        await asyncio.gather(*pending)

    asyncio.run(run())

    assert events[0] == (
        "TTS_STATE",
        {"state": "speaking", "request_id": "r1", "message": ""},
    )
    assert events[-1] == (
        "TTS_STATE",
        {"state": "idle", "request_id": "r1", "message": ""},
    )
    assert spoken and spoken[0][0] == "Hello"


def test_stop_while_idle_is_a_noop(monkeypatch):
    events = []

    async def fake_broadcast(event_type, payload):
        events.append((event_type, payload))

    monkeypatch.setattr(tts_events.ws_manager, "broadcast", fake_broadcast)
    with tts_events._speech_lock:
        tts_events._state["cancel"] = None

    asyncio.run(tts_events._handle_stop({}))

    assert events == []


def test_stop_cancels_the_active_request(monkeypatch):
    events = []
    cancelled = threading.Event()
    with tts_events._speech_lock:
        tts_events._state["cancel"] = cancelled
        tts_events._state["request_id"] = "r1"
        tts_events._state["generation"] = 4

    async def fake_broadcast(event_type, payload):
        events.append((event_type, payload))

    monkeypatch.setattr(tts_events.ws_manager, "broadcast", fake_broadcast)
    monkeypatch.setattr(tts_events, "_stop_audio", lambda: None)

    asyncio.run(tts_events._handle_stop({}))

    assert cancelled.is_set()
    assert events == [
        (
            "TTS_STATE",
            {"state": "idle", "request_id": "r1", "message": ""},
        )
    ]
    assert tts_events._finish_speech(4) is False
