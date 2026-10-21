"""SMTC polling and transport commands for the shared Aether media widget."""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any, Callable, Dict, Optional

from .media_snapshot import (
    capture_media,
    snapshot_differs,
    unavailable_snapshot,
)

logger = logging.getLogger("aether.media")


async def _control_once(action: str) -> bool:
    from winsdk.windows.media.control import (
        GlobalSystemMediaTransportControlsSessionManager as Manager,
    )

    manager = await Manager.request_async()
    session = manager.get_current_session()
    if session is None:
        return False
    methods = {
        "play": "try_play_async",
        "pause": "try_pause_async",
        "play_pause": "try_toggle_play_pause_async",
        "next": "try_skip_next_async",
        "previous": "try_skip_previous_async",
    }
    method_name = methods.get(action)
    if not method_name:
        return False
    method = getattr(session, method_name, None)
    if method is None:
        return False
    return bool(await method())


def control_media(action: str) -> bool:
    """Runs an SMTC transport action in a fresh event loop."""
    try:
        return asyncio.run(_control_once(action))
    except Exception as exc:
        logger.warning("Media control %s failed: %s", action, exc)
        return False


class MediaPoller:
    """Dedicated thread that polls SMTC and pushes changed snapshots."""

    def __init__(self) -> None:
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._callback: Optional[Callable[[Dict[str, Any]], None]] = None
        self._latest: Optional[Dict[str, Any]] = None
        self._lock = threading.Lock()

    def latest(self) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._latest

    def start(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._callback = callback
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, daemon=True, name="aether-media-poller"
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3.0)
            self._thread = None

    def _publish(self, snapshot: Dict[str, Any]) -> None:
        with self._lock:
            old = self._latest
            self._latest = snapshot
        if self._callback and snapshot_differs(old, snapshot):
            try:
                self._callback(snapshot)
            except Exception as exc:
                logger.debug("Media callback failed: %s", exc)

    def _run(self) -> None:
        try:
            asyncio.run(self._loop())
        except Exception as exc:
            logger.warning("Media poller stopped: %s", exc)

    async def _loop(self) -> None:
        manager = None
        art_cache: Dict[str, Any] = {}
        while not self._stop.is_set():
            try:
                if manager is None:
                    from winsdk.windows.media.control import (
                        GlobalSystemMediaTransportControlsSessionManager as Manager,
                    )

                    manager = await Manager.request_async()
                from .media_snapshot import capture_snapshot

                snapshot = await capture_snapshot(manager, art_cache)
            except Exception as exc:
                manager = None
                snapshot = unavailable_snapshot(
                    str(exc) or "Windows media controls are unavailable."
                )
            self._publish(snapshot)
            await asyncio.sleep(2.0)


media_poller = MediaPoller()


def latest_media_snapshot() -> Dict[str, Any]:
    """Returns the poller snapshot or captures a fresh one on first request."""
    snapshot = media_poller.latest()
    if snapshot is not None:
        return snapshot
    return capture_media()


def start_media_poller(callback: Callable[[Dict[str, Any]], None]) -> None:
    media_poller.start(callback)


def stop_media_poller() -> None:
    media_poller.stop()
