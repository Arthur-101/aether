"""Window-context timeout tests.

The UIA walk is allowed to hang on some Electron/Chromium windows. These tests
pin the fallback that keeps the voice pipeline responsive.
"""

import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.os_hooks import window_context


@pytest.fixture(autouse=True)
def _reset_uia_thread():
    window_context._uia_thread = None
    yield
    thread = window_context._uia_thread
    if thread is not None:
        thread.join(1.0)
    window_context._uia_thread = None


def _stub_desktop(monkeypatch, title="Test Window"):
    monkeypatch.setattr(window_context.win32gui, "GetForegroundWindow", lambda: 1)
    monkeypatch.setattr(window_context.win32gui, "GetWindowText", lambda _hwnd: title)
    monkeypatch.setattr(window_context.pyperclip, "paste", lambda: "")
    monkeypatch.setattr(window_context.pyperclip, "copy", lambda _text: None)
    monkeypatch.setattr(window_context.keyboard, "send", lambda _keys: None)


def test_uia_text_is_used_when_scrape_finishes(monkeypatch):
    _stub_desktop(monkeypatch)
    monkeypatch.setattr(
        window_context, "_scrape_uia_text", lambda _hwnd: ["Visible text", "More text"]
    )

    context = window_context.get_active_window_context()

    assert context["mode"] == "window_tree"
    assert context["content"] == "Visible text\nMore text"


def test_uia_timeout_falls_back_to_title_only(monkeypatch):
    _stub_desktop(monkeypatch)

    def slow_scrape(_hwnd):
        time.sleep(0.4)
        return ["too late"]

    monkeypatch.setattr(window_context, "_scrape_uia_text", slow_scrape)

    started = time.monotonic()
    texts = window_context._collect_uia_text(1, timeout=0.05)
    elapsed = time.monotonic() - started

    assert texts == []
    assert elapsed < 0.3
    thread = window_context._uia_thread
    assert thread is not None
    thread.join(1.0)
    assert not thread.is_alive()


def test_empty_uia_tree_returns_title_only(monkeypatch):
    _stub_desktop(monkeypatch)
    monkeypatch.setattr(window_context, "_scrape_uia_text", lambda _hwnd: [])

    context = window_context.get_active_window_context()

    assert context["mode"] == "title_only"
    assert context["content"] == ""
