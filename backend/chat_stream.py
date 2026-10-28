"""Bridges worker-thread token deltas onto the WebSocket event loop.

Engines call ``push`` synchronously while a completion runs in an executor
thread. Deltas are coalesced to keep Markdown re-rendering smooth, and ``flush``
awaits every scheduled broadcast so the final ``SESSION_UPDATED`` can never
overtake the last streamed chunk.
"""

import asyncio
import threading
import time
from concurrent.futures import Future
from typing import Any, List, Optional

from .ws_manager import ws_manager

STREAM_INTERVAL_SECONDS = 0.04


class ChatStreamBridge:
    """Throttles answer deltas for one foreground chat turn."""

    def __init__(
        self,
        loop: asyncio.AbstractEventLoop,
        session_id: str,
        interval: float = STREAM_INTERVAL_SECONDS,
    ) -> None:
        self._loop = loop
        self._session_id = session_id
        self._interval = interval
        self._lock = threading.Lock()
        self._pending = ""
        self._last_emit = 0.0
        self._futures: List[Future[Any]] = []

    def push(self, text: str) -> None:
        """Adds a delta; emits at most once per interval."""
        if not text:
            return
        with self._lock:
            self._pending += text
            now = time.monotonic()
            if now - self._last_emit < self._interval:
                return
            payload = self._pending
            self._pending = ""
            self._last_emit = now
            self._schedule_locked("CHAT_STREAM_DELTA", {
                "session_id": self._session_id,
                "delta": payload,
            })

    def reset(self) -> None:
        """Discards the draft (tool round, reasoning retry, or failure)."""
        with self._lock:
            self._pending = ""
            self._last_emit = time.monotonic()
            self._schedule_locked("CHAT_STREAM_RESET", {
                "session_id": self._session_id,
            })

    def _schedule_locked(self, event_type: str, payload: dict) -> None:
        future = asyncio.run_coroutine_threadsafe(
            ws_manager.broadcast(event_type, payload),
            self._loop,
        )
        self._futures.append(future)

    async def flush(self) -> None:
        """Waits for scheduled deltas, then emits any remaining tail."""
        with self._lock:
            pending = self._pending
            self._pending = ""
            futures = list(self._futures)
            self._futures.clear()

        if futures:
            await asyncio.gather(
                *(asyncio.wrap_future(future) for future in futures),
                return_exceptions=True,
            )
        if pending:
            await ws_manager.broadcast("CHAT_STREAM_DELTA", {
                "session_id": self._session_id,
                "delta": pending,
            })


def make_bridge(
    loop: asyncio.AbstractEventLoop, session_id: str, enabled: bool
) -> Optional[ChatStreamBridge]:
    """Returns a bridge for foreground turns, or None for background work."""
    return ChatStreamBridge(loop, session_id) if enabled else None
