"""
Aether Global Mouse Position Tracker
Feeds cursor coordinates to the overlay so it can enable/disable
click-through hit-testing even while the window ignores cursor events.
"""

import time
from typing import Callable, Optional, Tuple
from pynput import mouse


class MousePositionTracker:
    """Throttled global mouse-move listener (~30 Hz)."""

    def __init__(
        self,
        on_position: Optional[Callable[[int, int], None]] = None,
        interval: float = 0.04,
    ):
        self.on_position = on_position
        self.interval = interval
        self._last_emit = 0.0
        self._last_pos: Tuple[int, int] = (-1, -1)
        self._listener: Optional[mouse.Listener] = None

    def _handle_move(self, x: int, y: int) -> None:
        now = time.time()
        if now - self._last_emit < self.interval:
            return
        if (x, y) == self._last_pos:
            return
        self._last_emit = now
        self._last_pos = (x, y)
        if self.on_position:
            self.on_position(x, y)

    def start(self) -> None:
        if self._listener is not None:
            return
        self._listener = mouse.Listener(on_move=self._handle_move)
        self._listener.daemon = True
        self._listener.start()

    def stop(self) -> None:
        if self._listener is not None:
            self._listener.stop()
            self._listener = None


mouse_tracker = MousePositionTracker()
