r"""
Per-process dedicated VRAM from the Windows PDH GPU counters.

``\GPU Process Memory(*)\Dedicated Usage`` is the closest Windows equivalent of
Task Manager's per-app VRAM column. Opening the wildcard counter costs ~250 ms
once (counter enumeration); collecting afterwards is effectively free. The
query therefore opens on a daemon thread, and callers only ever read the
already-open counter, so no telemetry tick waits for PDH.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from typing import Dict, Optional

logger = logging.getLogger("aether.vram")

_COUNTER = r"\GPU Process Memory(*)\Dedicated Usage"
_RETRY_SECONDS = 60.0
_PID = re.compile(r"^pid_(\d+)", re.IGNORECASE)

_lock = threading.Lock()
_query: Optional[int] = None
_counter: Optional[int] = None
_initializing = False
_failed_at = 0.0


def _open_query() -> None:
    global _query, _counter, _initializing, _failed_at
    try:
        import win32pdh

        query = win32pdh.OpenQuery()
        counter = win32pdh.AddEnglishCounter(query, _COUNTER)
        win32pdh.CollectQueryData(query)
    except Exception as exc:
        with _lock:
            _initializing = False
            _failed_at = time.monotonic()
        logger.debug("Per-process VRAM counters unavailable: %s", exc)
        return

    with _lock:
        _query = query
        _counter = counter
        _initializing = False


def prime() -> None:
    """Starts opening the counter once; later calls are no-ops."""
    global _initializing
    with _lock:
        if _query is not None or _initializing:
            return
        now = time.monotonic()
        if _failed_at and now - _failed_at < _RETRY_SECONDS:
            return
        _initializing = True
    threading.Thread(target=_open_query, name="aether-vram-open", daemon=True).start()


def _reset() -> None:
    global _query, _counter, _failed_at
    with _lock:
        query = _query
        _query = None
        _counter = None
        _failed_at = time.monotonic()
    if query is not None:
        try:
            import win32pdh

            win32pdh.CloseQuery(query)
        except Exception:
            pass


def get_process_vram() -> Dict[int, int]:
    """Returns dedicated VRAM bytes per PID; empty while counters initialise."""
    prime()
    with _lock:
        query, counter = _query, _counter
        if query is None or counter is None:
            return {}
        try:
            import win32pdh

            win32pdh.CollectQueryData(query)
            items = win32pdh.GetFormattedCounterArray(
                counter, win32pdh.PDH_FMT_LARGE
            )
        except Exception as exc:
            logger.debug("VRAM counter read failed: %s", exc)
            failed = True
        else:
            failed = False

    if failed:
        _reset()
        return {}

    usage: Dict[int, int] = {}
    for instance, value in items.items():
        match = _PID.match(instance)
        if not match:
            continue
        pid = int(match.group(1))
        usage[pid] = usage.get(pid, 0) + int(value)
    return usage


prime()
