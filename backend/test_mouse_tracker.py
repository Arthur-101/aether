"""Tests for the low-cost global cursor throttler."""

import threading

from backend.os_hooks.mouse_tracker import MousePositionTracker


def test_tracker_emits_the_final_position_of_a_fast_movement_burst():
    positions = []
    flushed = threading.Event()

    def on_position(x: int, y: int) -> None:
        positions.append((x, y))
        if len(positions) == 2:
            flushed.set()

    tracker = MousePositionTracker(on_position=on_position, interval=0.04)
    tracker._handle_move(10, 10)
    tracker._handle_move(20, 20)
    tracker._handle_move(30, 30)

    assert positions == [(10, 10)]
    assert flushed.wait(0.5)
    assert positions == [(10, 10), (30, 30)]
    tracker.stop()


def test_tracker_cancels_a_pending_trailing_update_when_cursor_returns():
    positions = []
    tracker = MousePositionTracker(
        on_position=lambda x, y: positions.append((x, y)), interval=0.04
    )

    tracker._handle_move(10, 10)
    tracker._handle_move(20, 20)
    tracker._handle_move(10, 10)

    threading.Event().wait(0.1)
    assert positions == [(10, 10)]
    tracker.stop()
