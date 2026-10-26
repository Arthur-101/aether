"""Tests for the tap/hold arbitration between Open Island and Voice Assistant."""

import time

from pynput import keyboard

from backend.os_hooks.hotkeys import HotkeyManager

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
