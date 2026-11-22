"""Tests for the tap/hold arbitration between Open Island and Voice Assistant."""

import time

from pynput import keyboard

from backend.os_hooks.hotkeys import HotkeyManager, combo_label, key_from_vk

CTRL = keyboard.Key.ctrl_l
ALT = keyboard.Key.alt_l
SPACE = keyboard.Key.space

SHARED = {
    "open_island": "<ctrl>+<space>",
    "toggle_drawer": "<ctrl>+<space>",
    "dictation": "",
    "circle_to_ask": "",
}

DISTINCT = {
    "open_island": "<ctrl>+<space>",
    "toggle_drawer": "<alt>+<space>",
    "dictation": "",
    "circle_to_ask": "",
}


def make_manager(bindings, threshold=0.04):
    opened = []
    voice = []
    manager = HotkeyManager(
        on_voice_state=lambda state, text: voice.append((state, text)),
        on_open_island=lambda: opened.append(True),
        hold_threshold=threshold,
    )
    # A unit test must never open the microphone or reach STT.
    manager._start_recording_safe = lambda: None
    manager._stop_recording_safe = lambda: None
    manager._process_assistant_release = lambda: None
    manager._process_dictation_release = lambda: None
    manager.reload(bindings)
    return manager, opened, voice


class FakeKeyEvent:
    """The KBDLLHOOKSTRUCT fields the Win32 event filter reads."""

    def __init__(self, vk_code, flags=0):
        self.vkCode = vk_code
        self.flags = flags


def make_recorder(bindings=None):
    """A manager that records what Settings would show, plus the reported keys."""
    captured = []
    manager = HotkeyManager(on_hotkey_captured=captured.append)
    manager._start_recording_safe = lambda: None
    manager._stop_recording_safe = lambda: None
    if bindings is not None:
        manager.reload(bindings)
    return manager, captured


def press(manager, *keys):
    for key in keys:
        manager._on_key_press(key)


def release(manager, *keys):
    for key in keys:
        manager._on_key_release(key)


def stop(manager):
    manager.set_suspended(True)
    manager.stop()


def test_tap_on_shared_binding_opens_without_recording():
    manager, opened, voice = make_manager(SHARED)
    try:
        press(manager, CTRL, SPACE)
        release(manager, SPACE, CTRL)

        assert opened == [True]
        assert voice == []

        # The hold timer must have been cancelled, not merely deferred.
        time.sleep(0.12)
        assert voice == []
        assert manager._voice_hold_pending is False
    finally:
        stop(manager)


def test_hold_on_shared_binding_starts_voice_without_opening():
    manager, opened, voice = make_manager(SHARED)
    try:
        press(manager, CTRL, SPACE)
        time.sleep(0.12)

        assert opened == []
        assert voice == [("listening", "Listening for question...")]

        release(manager, SPACE, CTRL)
        # Voice stays held until the shortcut is released.
        assert "toggle_drawer" not in manager._active
    finally:
        stop(manager)


def test_distinct_open_binding_fires_immediately():
    manager, opened, voice = make_manager(DISTINCT)
    try:
        press(manager, CTRL, SPACE)
        assert opened == [True]
        assert voice == []

        # Key auto-repeat must not open a second time.
        press(manager, SPACE)
        assert opened == [True]

        release(manager, SPACE, CTRL)
        time.sleep(0.12)
        assert voice == []
    finally:
        stop(manager)


def test_distinct_voice_tap_does_nothing():
    manager, opened, voice = make_manager(DISTINCT)
    try:
        press(manager, ALT, SPACE)
        release(manager, SPACE, ALT)
        time.sleep(0.12)

        assert opened == []
        assert voice == []
    finally:
        stop(manager)


def test_distinct_voice_hold_starts_voice():
    manager, opened, voice = make_manager(DISTINCT)
    try:
        press(manager, ALT, SPACE)
        time.sleep(0.12)

        assert opened == []
        assert voice == [("listening", "Listening for question...")]

        release(manager, SPACE, ALT)
        assert "toggle_drawer" not in manager._active
    finally:
        stop(manager)


def test_empty_bindings_disable_both_actions():
    manager, opened, voice = make_manager(
        {"open_island": "", "toggle_drawer": "", "dictation": "", "circle_to_ask": ""}
    )
    try:
        press(manager, CTRL, SPACE)
        release(manager, SPACE, CTRL)
        time.sleep(0.12)

        assert opened == []
        assert voice == []
    finally:
        stop(manager)


def test_suspend_cancels_a_pending_hold():
    manager, opened, voice = make_manager(SHARED)
    try:
        press(manager, CTRL, SPACE)
        assert manager._voice_hold_pending is True

        manager.set_suspended(True)
        assert manager._voice_hold_pending is False
        time.sleep(0.12)

        release(manager, SPACE, CTRL)
        manager.set_suspended(False)
        time.sleep(0.06)

        assert opened == []
        assert voice == []
    finally:
        stop(manager)


def test_reload_cancels_a_pending_hold():
    manager, opened, voice = make_manager(SHARED)
    try:
        press(manager, CTRL, SPACE)
        manager.reload(DISTINCT)
        time.sleep(0.12)

        assert manager._voice_hold_pending is False
        assert opened == []
        assert voice == []

        release(manager, SPACE, CTRL)
    finally:
        stop(manager)


def test_assistant_release_clears_pill_when_context_capture_fails(monkeypatch):
    from backend.os_hooks import hotkeys as hotkeys_module

    voice = []
    manager = HotkeyManager(on_voice_state=lambda state, text: voice.append((state, text)))
    manager._stop_recording_safe = lambda: None

    monkeypatch.setattr(hotkeys_module.stt_engine, "is_available", lambda: True)
    monkeypatch.setattr(hotkeys_module.stt_engine, "transcribe", lambda _audio: "hello")
    monkeypatch.setattr(
        hotkeys_module,
        "get_active_window_context",
        lambda: (_ for _ in ()).throw(RuntimeError("UIA hung")),
    )

    manager._process_assistant_release()

    assert voice[0] == ("thinking", "Thinking...")
    assert voice[-1] == ("idle", "")


def test_assistant_release_reports_missing_stt(monkeypatch):
    from backend.os_hooks import hotkeys as hotkeys_module

    voice = []
    errors = []
    manager = HotkeyManager(
        on_voice_state=lambda state, text: voice.append((state, text)),
        on_error=errors.append,
    )
    manager._stop_recording_safe = lambda: None

    monkeypatch.setattr(hotkeys_module.stt_engine, "is_available", lambda: False)

    manager._process_assistant_release()

    assert errors == [hotkeys_module.STT_UNAVAILABLE_NOTICE]
    assert voice == [("thinking", "Thinking..."), ("idle", "")]


def test_dictation_reports_missing_stt(monkeypatch):
    from backend.os_hooks import hotkeys as hotkeys_module

    voice = []
    errors = []
    manager = HotkeyManager(
        on_voice_state=lambda state, text: voice.append((state, text)),
        on_error=errors.append,
    )
    manager._stop_recording_safe = lambda: None

    monkeypatch.setattr(hotkeys_module.stt_engine, "is_available", lambda: False)

    manager._process_dictation_release()

    assert errors == [hotkeys_module.STT_UNAVAILABLE_NOTICE]
    assert voice == [("thinking", "Cleaning dictation..."), ("idle", "")]


def test_a_bound_combination_is_swallowed_from_the_system():
    """Alt+Space must not also open the focused window's system menu."""
    manager, _captured = make_recorder(DISTINCT)
    listener = type("FakeListener", (), {"_suppress": False})()

    with manager._lock:
        manager._on_key_press(ALT)
    manager._listener = listener

    press_event = FakeKeyEvent(0x20)  # VK_SPACE
    assert manager._win32_event_filter(0x0104, press_event) is True  # WM_SYSKEYDOWN
    assert listener._suppress is True
    assert manager._swallowed == {"space"}

    # The matching key-up is swallowed with it, and nothing else is.
    release_event = FakeKeyEvent(0x20)
    manager._win32_event_filter(0x0105, release_event)
    assert listener._suppress is True
    assert manager._swallowed == set()

    manager._win32_event_filter(0x0100, FakeKeyEvent(0x41))  # a bare "A"
    assert listener._suppress is False


def test_an_unbound_key_is_left_alone():
    manager, _captured = make_recorder(DISTINCT)
    listener = type("FakeListener", (), {"_suppress": True})()

    manager._listener = listener

    # Space on its own is not a shortcut on this machine.
    manager._win32_event_filter(0x0100, FakeKeyEvent(0x20))
    assert listener._suppress is False


def test_injected_keys_are_never_swallowed():
    """Dictation pastes with Ctrl+V, which must always reach the app."""
    manager, _captured = make_recorder(DISTINCT)
    listener = type("FakeListener", (), {"_suppress": True})()
    manager._listener = listener

    with manager._lock:
        manager._on_key_press(ALT)

    manager._win32_event_filter(0x0104, FakeKeyEvent(0x20, flags=0x10))
    assert listener._suppress is False


def test_a_modifier_only_binding_is_not_swallowed():
    """Ctrl + Shift fires as soon as the last modifier lands; Windows has no
    action for it, and swallowing it would break the modifier everywhere."""
    manager, _captured = make_recorder(
        {
            "open_island": "<ctrl>+<shift>",
            "toggle_drawer": "",
            "dictation": "",
            "circle_to_ask": "",
        }
    )

    with manager._lock:
        manager._on_key_press(CTRL)
    assert manager._completes_shortcut("shift") is False


def test_recording_reports_the_combination_the_webview_cannot_see():
    manager, captured = make_recorder()
    manager.set_suspended(True)

    manager._on_key_press(ALT)
    assert captured == [], "a modifier on its own is not a shortcut"

    manager._on_key_press(SPACE)
    assert captured == ["Alt + Space"]

    manager.set_suspended(False)


def test_recording_keeps_quiet_once_it_stops():
    manager, captured = make_recorder()
    manager.set_suspended(True)
    manager.set_suspended(False)

    manager._on_key_press(ALT)
    manager._on_key_press(SPACE)

    assert captured == []


def test_virtual_keys_are_named_like_pynput_keys():
    assert key_from_vk(0x20) == "space"
    assert key_from_vk(0x41) == "a"
    assert key_from_vk(0x31) == "1"
    assert key_from_vk(0x70) == "f1"
    assert key_from_vk(0x11) == "ctrl"
    assert key_from_vk(0x5B) == "cmd"
    assert key_from_vk(0xA5) == "", "unknown keys stay with the system"


def test_combination_labels_match_what_the_recorder_parses():
    assert combo_label({"alt"}, "space") == "Alt + Space"
    assert combo_label({"ctrl", "alt"}, "a") == "Ctrl + Alt + A"
    assert combo_label({"ctrl"}, "space") == "Ctrl + Space"
    assert combo_label({"shift"}, "f5") == "Shift + F5"
    assert combo_label({"alt"}, "alt") == ""
    assert combo_label({"ctrl", "shift"}, "shift") == ""


def test_assistant_release_reports_missing_tts_after_committing_reply(monkeypatch):
    from backend.os_hooks import hotkeys as hotkeys_module

    voice = []
    errors = []
    sessions = []
    manager = HotkeyManager(
        on_voice_state=lambda state, text: voice.append((state, text)),
        on_session_updated=sessions.append,
        on_error=errors.append,
    )
    manager._stop_recording_safe = lambda: None

    monkeypatch.setattr(hotkeys_module.stt_engine, "is_available", lambda: True)
    monkeypatch.setattr(hotkeys_module.stt_engine, "transcribe", lambda _audio: "hello")
    monkeypatch.setattr(hotkeys_module, "get_active_window_context", lambda: "")
    monkeypatch.setattr(
        hotkeys_module.session_manager, "get_or_create_session", lambda _query: "sid"
    )
    monkeypatch.setattr(
        hotkeys_module.session_manager, "build_session_context", lambda _sid, _query: ""
    )
    monkeypatch.setattr(
        hotkeys_module, "build_assistant_messages", lambda *_args, **_kwargs: []
    )
    monkeypatch.setattr(
        hotkeys_module.llm_router,
        "chat_completion",
        lambda *_args, **_kwargs: {"content": "hi"},
    )
    monkeypatch.setattr(
        hotkeys_module.session_manager, "commit_turn", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(hotkeys_module.tts_engine, "is_available", lambda: False)

    manager._process_assistant_release()

    assert sessions[0]["turn"] == {"user": "hello", "ai": "hi", "tools_used": []}
    assert ("speaking", "hi") not in voice
    assert errors == [hotkeys_module.TTS_UNAVAILABLE_NOTICE]
    assert voice[-1] == ("idle", "")

