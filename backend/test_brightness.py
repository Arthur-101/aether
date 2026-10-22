"""Tests for the non-blocking brightness reader and coalescing writer."""

import threading
import time

from backend.os_hooks import brightness_controls as brightness


def _reset() -> None:
    with brightness._lock:
        brightness._state.update({"value": None, "ts": 0.0, "retry_at": 0.0})
        brightness._write_pending = None
        brightness._writing = False
        brightness._write_retry_at = 0.0
    brightness._refreshing = False


def _wait_idle(timeout: float = 2.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not brightness._writing and brightness._write_pending is None:
            return
        time.sleep(0.01)
    raise AssertionError("brightness writer did not finish")


def test_set_returns_before_the_display_answers(monkeypatch):
    _reset()
    release = threading.Event()
    started_write = threading.Event()

    def slow_write(level):
        started_write.set()
        release.wait(2.0)
        return True

    monkeypatch.setattr(brightness, "_wmi_write", slow_write)
    monkeypatch.setattr(brightness, "_sbc_write", lambda level: True)

    started = time.perf_counter()
    result = brightness.set_brightness(42)
    elapsed = time.perf_counter() - started

    assert result == 42
    assert elapsed < 0.1
    assert started_write.wait(1.0)
    release.set()
    _wait_idle()


def test_drag_updates_coalesce_to_the_newest_value(monkeypatch):
    _reset()
    seen = []

    def slow_write(level):
        seen.append(level)
        time.sleep(0.05)
        return True

    monkeypatch.setattr(brightness, "_wmi_write", slow_write)
    monkeypatch.setattr(brightness, "_sbc_write", lambda level: True)

    for level in (10, 20, 30, 40):
        brightness.set_brightness(level)
        time.sleep(0.005)

    _wait_idle()
    assert seen[-1] == 40
    assert len(seen) < 4


def test_refused_write_backs_off(monkeypatch):
    _reset()
    monkeypatch.setattr(brightness, "_wmi_write", lambda level: False)
    monkeypatch.setattr(brightness, "_sbc_write", lambda level: False)

    brightness.set_brightness(55)
    _wait_idle()
    assert brightness._write_retry_at > time.time()

    attempts = []
    monkeypatch.setattr(
        brightness, "_wmi_write", lambda level: attempts.append(level) or True
    )
    brightness.set_brightness(60)
    time.sleep(0.05)
    assert attempts == []


def test_brightness_is_clamped(monkeypatch):
    _reset()
    monkeypatch.setattr(brightness, "_wmi_write", lambda level: True)
    monkeypatch.setattr(brightness, "_sbc_write", lambda level: True)

    assert brightness.set_brightness(-5) == 0
    assert brightness.set_brightness(250) == 100
    _wait_idle()


def test_get_brightness_never_waits_for_the_display(monkeypatch):
    _reset()
    release = threading.Event()

    def slow_read():
        release.wait(2.0)
        return 50

    monkeypatch.setattr(brightness, "_wmi_read", slow_read)
    monkeypatch.setattr(brightness, "_sbc_read", lambda: None)

    started = time.perf_counter()
    value = brightness.get_brightness()
    elapsed = time.perf_counter() - started

    assert value is None
    assert elapsed < 0.1

    release.set()
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline and brightness.get_brightness() is None:
        time.sleep(0.01)
    assert brightness.get_brightness() == 50
