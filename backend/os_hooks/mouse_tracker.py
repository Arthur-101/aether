"""
Aether Global Mouse Position Tracker
Feeds cursor coordinates to the overlay so it can enable/disable
click-through hit-testing even while the window ignores cursor events.
"""

import threading
import time
from typing import Callable, Optional, Tuple
from pynput import mouse


class MousePositionTracker:
    """Throttled global mouse-move listener with a final trailing sample."""

    def __init__(
        self,
        on_position: Optional[Callable[[int, int], None]] = None,
        interval: float = 0.04,
    ):
        self.on_position = on_position
        self.interval = interval
        self._last_emit_at = 0.0
        self._last_emitted_pos: Tuple[int, int] = (-1, -1)
        self._latest_pos: Tuple[int, int] = (-1, -1)
        self._listener: Optional[mouse.Listener] = None
        self._flush_timer: Optional[threading.Timer] = None
        self._flush_token = 0
        self._lock = threading.Lock()

    def _emit(self, position: Tuple[int, int]) -> None:
        callback = self.on_position
        if callback:
            callback(*position)

    def _cancel_flush_locked(self) -> None:
        self._flush_token += 1
        timer = self._flush_timer
        self._flush_timer = None
        if timer is not None:
            timer.cancel()

    def _schedule_flush_locked(self, delay: float) -> None:
        if self._flush_timer is not None:
            return
        self._flush_token += 1
        token = self._flush_token
        timer = threading.Timer(max(0.0, delay), self._flush_latest, args=(token,))
        timer.daemon = True
        self._flush_timer = timer
        timer.start()

    def _flush_latest(self, token: int) -> None:
        position: Optional[Tuple[int, int]] = None
        with self._lock:
            if token != self._flush_token:
                return
            self._flush_timer = None
            now = time.monotonic()
            remaining = self.interval - (now - self._last_emit_at)
            if remaining > 0:
                self._schedule_flush_locked(remaining)
                return
            if self._latest_pos == self._last_emitted_pos:
                return
            self._last_emit_at = now
            self._last_emitted_pos = self._latest_pos
            position = self._last_emitted_pos
        self._emit(position)

    def _handle_move(self, x: int, y: int) -> None:
        position = (x, y)
        emit_now: Optional[Tuple[int, int]] = None
        with self._lock:
            if position == self._latest_pos:
                return
            self._latest_pos = position
            if position == self._last_emitted_pos:
                # A quick movement that returns to the already reported point
                # does not need a trailing message.
                self._cancel_flush_locked()
                return

            now = time.monotonic()
            remaining = self.interval - (now - self._last_emit_at)
            if remaining <= 0:
                self._cancel_flush_locked()
                self._last_emit_at = now
                self._last_emitted_pos = position
                emit_now = position
            else:
                # One pending timer coalesces every movement in this interval
                # into the final coordinate. It avoids a stale hit-test when
                # the cursor stops immediately after leaving a tiny UI region.
                self._schedule_flush_locked(remaining)
        if emit_now is not None:
            self._emit(emit_now)

    def start(self) -> None:
        with self._lock:
            if self._listener is not None:
                return
            listener = mouse.Listener(on_move=self._handle_move)
            listener.daemon = True
            self._listener = listener
        listener.start()

    def stop(self) -> None:
        with self._lock:
            self._cancel_flush_locked()
            listener = self._listener
            self._listener = None
        if listener is not None:
            listener.stop()


mouse_tracker = MousePositionTracker()
