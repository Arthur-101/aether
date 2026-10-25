"""Watchdog and fail-fast guard for the shared asyncio executor.

A call stuck on the default ``ThreadPoolExecutor`` silently consumes one
worker forever. Nothing crashes, the event loop stays healthy, but after
enough leaks every other ``run_in_executor`` action queues indefinitely —
media controls, taskbar launches and session lists all appear frozen while
``/health`` still reports ``ok``.

This module makes that failure visible and stops callers from piling more
work onto a saturated pool:

* a background watchdog samples every 2 s and logs one stack summary when
  every worker has been busy for 6 s (or work is queuing behind them);
* ``run_guarded()`` rejects new work while the pool is in that episode and
  times out individual calls instead of waiting forever;
* repeated timeouts for the same label pause that action for a cooldown so a
  timer cannot keep leaking one worker per tick;
* ``executor_health()`` exposes the state through ``/health``.
"""

from __future__ import annotations

import asyncio
import logging
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("aether.executor")

CHECK_INTERVAL = 2.0
SATURATION_SECONDS = 6.0
DEFAULT_CALL_TIMEOUT = 6.0
COOLDOWN_SECONDS = 60.0
MAX_LABEL_TIMEOUTS = 2


class ExecutorCallTimeout(RuntimeError):
    """Raised when guarded executor work times out or is rejected."""


_lock = threading.Lock()
_stop = threading.Event()
_thread: Optional[threading.Thread] = None
_loop: Optional[asyncio.AbstractEventLoop] = None
_saturated_since: Optional[float] = None
_incident_reported = False
_incidents = 0
_last_incident: Optional[str] = None
_timeouts = 0
_skips = 0
_last_timeout: Optional[str] = None
_label_timeouts: Dict[str, int] = {}
_label_cooldown: Dict[str, float] = {}


def _is_idle_worker(frame: Any) -> bool:
    """True when an executor thread is parked on its work queue."""
    if frame is None:
        return False
    code = frame.f_code
    filename = Path(code.co_filename).name
    # CPython leaves the worker frame itself on top while it blocks on the
    # queue (the lock acquisition adds no Python frame).
    if code.co_name == "_worker" and filename == "thread.py":
        return True
    if code.co_name != "wait" or "threading" not in filename:
        return False
    # An idle worker is `Queue.get()` -> `Condition.wait()`; a task that
    # blocks on its own Event also ends in threading.wait, so require the
    # queue.get caller to avoid calling a stuck task "idle".
    caller = frame.f_back
    while caller is not None and "threading" in Path(caller.f_code.co_filename).name:
        caller = caller.f_back
    return bool(
        caller
        and Path(caller.f_code.co_filename).name == "queue.py"
        and caller.f_code.co_name == "get"
    )


def _frames_signature(frame: Any, depth: int = 4) -> str:
    """Compact outer-to-inner stack signature for one stuck worker."""
    chain: List[str] = []
    node = frame
    while node is not None and len(chain) < depth:
        chain.append(f"{Path(node.f_code.co_filename).stem}:{node.f_code.co_name}")
        node = node.f_back
    return " < ".join(chain)


def _summarize(frames: List[Any]) -> str:
    counts: Dict[str, int] = {}
    for frame in frames:
        signature = _frames_signature(frame)
        counts[signature] = counts.get(signature, 0) + 1
    parts = [
        f"{count}x {signature}"
        for signature, count in sorted(counts.items(), key=lambda item: -item[1])[:3]
    ]
    return "; ".join(parts) or "no worker frames available"


def _inspect_default_executor(
    loop: Optional[asyncio.AbstractEventLoop],
) -> Dict[str, Any]:
    executor = getattr(loop, "_default_executor", None) if loop is not None else None
    if executor is None:
        return {
            "workers": 0,
            "busy": 0,
            "pending": 0,
            "max_workers": 0,
            "busy_frames": [],
        }

    try:
        threads = list(getattr(executor, "_threads", ()) or ())
    except RuntimeError:
        threads = []
    current = sys._current_frames()
    busy_frames = []
    for thread in threads:
        frame = current.get(thread.ident) if thread.ident else None
        if frame is not None and not _is_idle_worker(frame):
            busy_frames.append(frame)

    try:
        pending = int(executor._work_queue.qsize())
    except Exception:
        pending = 0
    return {
        "workers": len(threads),
        "busy": len(busy_frames),
        "pending": pending,
        "max_workers": int(getattr(executor, "_max_workers", 0) or 0),
        "busy_frames": busy_frames,
    }


def _saturated(info: Dict[str, Any]) -> bool:
    workers = int(info["workers"])
    if workers == 0:
        return False
    all_busy = int(info["busy"]) >= workers
    pool_full = workers >= int(info["max_workers"]) > 0
    return all_busy and (pool_full or int(info["pending"]) > 0)


def _check_once() -> None:
    """Samples the pool and logs at most one incident per saturation episode."""
    info = _inspect_default_executor(_loop)
    now = time.monotonic()
    started = False
    recovered = False
    duration = 0.0
    detail = ""

    with _lock:
        global _saturated_since, _incident_reported, _incidents
        global _last_incident
        if _saturated(info):
            if _saturated_since is None:
                _saturated_since = now
            duration = now - _saturated_since
            if duration >= SATURATION_SECONDS and not _incident_reported:
                _incident_reported = True
                _incidents += 1
                detail = (
                    f"{info['busy']}/{info['workers']} workers busy for "
                    f"{duration:.0f}s, {info['pending']} queued; top frames: "
                    f"{_summarize(info['busy_frames'])}"
                )
                _last_incident = detail
                started = True
        else:
            if _incident_reported:
                recovered = True
                duration = (
                    now - _saturated_since if _saturated_since is not None else 0.0
                )
            _saturated_since = None
            _incident_reported = False

    if started:
        logger.error(
            "Shared executor saturated: %s. Backend actions that use the "
            "default executor will now fail fast instead of queuing.",
            detail,
        )
    if recovered:
        logger.info("Shared executor recovered after %.1fs.", duration)


def _watch() -> None:
    while not _stop.wait(CHECK_INTERVAL):
        try:
            _check_once()
        except Exception as exc:  # never let the watchdog itself die
            logger.debug("Executor watchdog tick failed: %s", exc)


def start_executor_watchdog() -> None:
    """Starts the sampler from inside the running event loop."""
    global _thread, _loop, _stop
    _loop = asyncio.get_running_loop()
    if _thread is not None and _thread.is_alive():
        return
    _stop = threading.Event()
    _thread = threading.Thread(
        target=_watch, daemon=True, name="aether-executor-watchdog"
    )
    _thread.start()


def stop_executor_watchdog() -> None:
    global _thread
    _stop.set()
    if _thread is not None:
        _thread.join(timeout=CHECK_INTERVAL + 1.0)
        _thread = None


def executor_health() -> Dict[str, Any]:
    """Live pool state, suitable for ``/health``."""
    loop = _loop
    if loop is None or loop.is_closed():
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

    info = _inspect_default_executor(loop)
    now = time.monotonic()
    with _lock:
        saturated = _saturated(info)
        saturated_seconds = (
            now - _saturated_since if saturated and _saturated_since else 0.0
        )
        paused = sorted(
            label for label, until in _label_cooldown.items() if until > now
        )
        state = {
            "ok": not saturated,
            "saturated": saturated,
            "saturated_seconds": round(saturated_seconds, 1),
            "workers": info["workers"],
            "busy": info["busy"],
            "pending": info["pending"],
            "max_workers": info["max_workers"],
            "incidents": _incidents,
            "last_incident": _last_incident,
            "timeouts": _timeouts,
            "skipped": _skips,
            "last_timeout": _last_timeout,
            "paused_actions": paused,
            "check_interval_seconds": CHECK_INTERVAL,
        }
    return state


def _record_skip(label: str) -> None:
    global _skips
    with _lock:
        _skips += 1
    logger.warning("Executor guard skipped action %r: pool is saturated.", label)


def _record_timeout(label: str, timeout: float) -> bool:
    """Counts a timeout and returns True when the label is now paused."""
    global _timeouts, _last_timeout
    now = time.monotonic()
    paused = False
    with _lock:
        _timeouts += 1
        _last_timeout = f"{label} ({timeout:.1f}s)"
        failures = _label_timeouts.get(label, 0) + 1
        _label_timeouts[label] = failures
        if failures >= MAX_LABEL_TIMEOUTS:
            _label_cooldown[label] = now + COOLDOWN_SECONDS
            paused = True
    if paused:
        logger.error(
            "Guarded action %r timed out %d times; pausing it for %.0fs so it "
            "cannot leak more executor workers.",
            label,
            MAX_LABEL_TIMEOUTS,
            COOLDOWN_SECONDS,
        )
    else:
        logger.warning("Guarded action %r timed out after %.1fs.", label, timeout)
    return paused


def _record_success(label: str) -> None:
    with _lock:
        _label_timeouts.pop(label, None)
        _label_cooldown.pop(label, None)


async def run_guarded(
    label: str,
    fn: Any,
    *args: Any,
    timeout: float = DEFAULT_CALL_TIMEOUT,
) -> Any:
    """Runs ``fn`` on the default executor with a deadline and a pool check.

    A timed-out thread cannot be cancelled in Python, so this cannot reclaim
    a truly wedged worker. It does stop the request from hanging forever and
    blocks repeats, which keeps one bad call from consuming the whole pool.
    """
    now = time.monotonic()
    with _lock:
        until = _label_cooldown.get(label, 0.0)
    if until > now:
        _record_skip(label)
        raise ExecutorCallTimeout(
            f"{label} is paused after repeated timeouts; restart the backend "
            "if it does not recover."
        )

    health = executor_health()
    if health["saturated"] and health["saturated_seconds"] >= SATURATION_SECONDS:
        _record_skip(label)
        raise ExecutorCallTimeout(
            f"{label} skipped: the shared executor has been saturated for "
            f"{health['saturated_seconds']:.0f}s."
        )

    loop = asyncio.get_running_loop()
    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(None, fn, *args), timeout=timeout
        )
    except asyncio.TimeoutError as exc:
        message = f"{label} timed out after {timeout:.1f}s."
        if _record_timeout(label, timeout):
            message += f" It is paused for {COOLDOWN_SECONDS:.0f}s."
        raise ExecutorCallTimeout(message) from exc
    _record_success(label)
    return result
