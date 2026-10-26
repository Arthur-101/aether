"""SMTC polling and transport commands for the shared Aether media widget."""

from __future__ import annotations

import asyncio
import logging
import queue
import threading
from concurrent.futures import Future
from typing import Any, Callable, Dict, Optional

from .media_snapshot import (
    snapshot_differs,
    unavailable_snapshot,
)

logger = logging.getLogger("aether.media")

CONTROL_METHODS = {
    "play": "try_play_async",
    "pause": "try_pause_async",
    "play_pause": "try_toggle_play_pause_async",
    "next": "try_skip_next_async",
    "previous": "try_skip_previous_async",
}
CONTROL_TIMEOUT = 3.0
CONTROL_RESULT_TIMEOUT = 6.0


async def _invoke_control(session: Any, action: str) -> bool:
    """Runs one SMTC transport action on the caller's event loop."""
    method_name = CONTROL_METHODS.get(action)
    if not method_name:
        return False
    method = getattr(session, method_name, None)
    if method is None:
        return False

    async def call() -> Any:
        return await method()

    try:
        return bool(await asyncio.wait_for(call(), timeout=CONTROL_TIMEOUT))
    except Exception as exc:
        logger.debug("Media control %s failed: %s", action, exc)
        return False


class MediaPoller:
    """Dedicated thread that polls SMTC and pushes changed snapshots."""

    def __init__(self) -> None:
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._callback: Optional[Callable[[Dict[str, Any]], None]] = None
        self._latest: Optional[Dict[str, Any]] = None
        self._lock = threading.Lock()
        # Transport actions run on this thread, which is the only place that
        # talks to SMTC. A fresh event loop in an executor thread can block
        # forever inside Manager.request_async() and leak a worker per call.
        self._controls: "queue.Queue[tuple[str, Future]]" = queue.Queue()
        self._wake: Optional[asyncio.Event] = None
        self._event_loop: Optional[asyncio.AbstractEventLoop] = None

    def latest(self) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._latest

    def submit_control(self, action: str) -> Future:
        """Queues a transport action and returns a future for its result."""
        future: Future = Future()
        self._controls.put((action, future))
        self.request_refresh()
        return future

    def request_refresh(self) -> None:
        """Wakes the poller so it samples without waiting for the next tick."""
        loop = self._event_loop
        wake = self._wake
        if loop is None or wake is None or loop.is_closed():
            return
        try:
            loop.call_soon_threadsafe(wake.set)
        except RuntimeError:
            pass

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
        # Release anyone waiting on a control that will never run.
        while True:
            try:
                _action, future = self._controls.get_nowait()
            except queue.Empty:
                break
            if not future.done():
                future.set_result(False)
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

    async def _run_controls(self, manager: Any) -> bool:
        """Applies queued transport actions on the poller thread.

        Returns True when at least one action was accepted, so the caller can
        give the player a moment to publish its new state before sampling.
        """
        applied = False
        while True:
            try:
                action, future = self._controls.get_nowait()
            except queue.Empty:
                return applied
            if future.done():
                continue
            try:
                session = manager.get_current_session()
                if session is None:
                    future.set_result(False)
                    continue
                ok = await _invoke_control(session, action)
                future.set_result(ok)
                applied = applied or ok
            except Exception:
                future.set_result(False)

    async def _loop(self) -> None:
        manager = None
        art_cache: Dict[str, Any] = {}
        self._event_loop = asyncio.get_running_loop()
        self._wake = asyncio.Event()
        try:
            while not self._stop.is_set():
                # Clear before the capture so an action submitted while it runs
                # still wakes the wait below instead of being lost.
                self._wake.clear()
                try:
                    if manager is None:
                        from winsdk.windows.media.control import (
                            GlobalSystemMediaTransportControlsSessionManager as Manager,
                        )

                        async def request_manager() -> Any:
                            return await Manager.request_async()

                        manager = await asyncio.wait_for(
                            request_manager(), timeout=5.0
                        )
                    applied = await self._run_controls(manager)
                    from .media_snapshot import capture_snapshot

                    # A transport command reports success before the player has
                    # necessarily updated its playback status; give it a beat so
                    # the snapshot we publish matches the new state.
                    if applied:
                        await asyncio.sleep(0.25)
                    snapshot = await capture_snapshot(manager, art_cache)
                except Exception as exc:
                    manager = None
                    snapshot = unavailable_snapshot(
                        str(exc) or "Windows media controls are unavailable."
                    )
                self._publish(snapshot)
                try:
                    await asyncio.wait_for(self._wake.wait(), timeout=2.0)
                except asyncio.TimeoutError:
                    pass
        finally:
            self._event_loop = None
            self._wake = None


media_poller = MediaPoller()


async def control_media(action: str) -> bool:
    """Queues a transport action on the poller thread and awaits its result."""
    try:
        future = media_poller.submit_control(action)
        return bool(
            await asyncio.wait_for(
                asyncio.wrap_future(future), timeout=CONTROL_RESULT_TIMEOUT
            )
        )
    except Exception as exc:
        logger.warning("Media control %s failed: %s", action, exc)
        return False


def control_media_sync(action: str) -> bool:
    """Blocking counterpart to :func:`control_media` for the MCP tool thread.

    MCP tools are synchronous and run in a worker thread, so they cannot await
    the transport action. This pushes onto the same poller control queue and
    waits for the result, keeping all SMTC access on the poller thread.
    """
    try:
        future = media_poller.submit_control(action)
        return bool(future.result(timeout=CONTROL_RESULT_TIMEOUT))
    except Exception as exc:
        logger.warning("Media control %s failed: %s", action, exc)
        return False


def latest_media_snapshot() -> Dict[str, Any]:
    """Returns the poller's cached snapshot without touching SMTC.

    Capturing here used to start a fresh event loop on a default-executor
    thread. Manager.request_async() can block forever in that context, and
    every media control leaked one worker until the pool was empty and all
    executor-backed actions (media, taskbar, sessions) stopped responding.
    The poller owns SMTC on its own thread; request handlers only read it.
    """
    snapshot = media_poller.latest()
    if snapshot is not None:
        return snapshot
    return unavailable_snapshot("Waiting for the media player…")


def start_media_poller(callback: Callable[[Dict[str, Any]], None]) -> None:
    media_poller.start(callback)


def stop_media_poller() -> None:
    media_poller.stop()
