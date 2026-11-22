"""
Background media jobs for the Radial Wheel.

A compress or convert request can outlive the popup that started it, so the
work runs on one dedicated thread: a long encode cannot starve the shared
executor, a second request queues behind the first instead of being refused,
and progress streams over the WebSocket so the collapsed pill can show it after
the popup is closed. Cancel works while running (FFmpeg is terminated and the
partial file removed) and while queued.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import uuid
from collections import deque
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from .mcp_tools.media_tools import (
    AUDIO_EXTENSIONS,
    VIDEO_EXTENSIONS,
    MediaCancelled,
    _compress_media_run,
    _convert_media_run,
)
from .ws_manager import ws_manager

logger = logging.getLogger("aether.mediajobs")

# Finished jobs stay readable for the popup, newest first, bounded so a long
# session cannot grow the registry without limit.
_HISTORY = 20

_lock = threading.Lock()
_queue: deque[str] = deque()
_jobs: Dict[str, Dict[str, Any]] = {}
_cancels: Dict[str, threading.Event] = {}
_running: Optional[str] = None
_worker: Optional[threading.Thread] = None
_loop: Optional[asyncio.AbstractEventLoop] = None


def _thread_cap() -> int:
    """Caps FFmpeg to two threads while the assistant is running.

    A model turn and an encode competing for every core makes both slow, so the
    helper job yields. Chosen at job start: a thread count cannot change later.
    """
    try:
        from .resource_lifecycle import assistant_busy

        return 2 if assistant_busy() else 0
    except Exception:
        return 0


def _broadcast(event: str, payload: Dict[str, Any]) -> None:
    """Sends from the job thread onto the event loop, if it is still up."""
    loop = _loop
    if loop is None:
        return
    try:
        asyncio.run_coroutine_threadsafe(ws_manager.broadcast(event, payload), loop)
    except RuntimeError:
        pass


def _is_determinate(file_path: str) -> bool:
    """Only FFmpeg targets report a percentage; images and PDFs get a spinner."""
    ext = Path(file_path).suffix.lower()
    return ext in VIDEO_EXTENSIONS or ext in AUDIO_EXTENSIONS


def _progress_event(job: Dict[str, Any], status: str, progress: Optional[float], message: str) -> None:
    _broadcast(
        "MEDIA_JOB_PROGRESS",
        {
            "id": job["id"],
            "action": job["action"],
            "file_name": Path(job["file_path"]).name,
            "status": status,
            "progress": progress,
            "message": message,
        },
    )


def _result_event(job: Dict[str, Any], ok: bool, status: str, message: str, result: Any = None) -> None:
    payload = {
        "id": job["id"],
        "action": job["action"],
        "file_name": Path(job["file_path"]).name,
        "ok": ok,
        "status": status,
        "message": message,
        "result": result,
    }
    _broadcast("MEDIA_JOB_RESULT", payload)
    # The same completion toast the synchronous wheel path shows, so a job that
    # finished while its popup was closed still says something.
    _broadcast(
        "WHEEL_RESULT",
        {
            "action": job["action"],
            "file_path": job["file_path"],
            "result": result,
            "error": None if ok else message,
        },
    )


def _execute(job: Dict[str, Any], cancel: threading.Event, threads: int) -> str:
    """Runs one job on the worker thread and returns the written output path."""
    action = job["action"]
    file_path = job["file_path"]
    progress: Callable[[float], None] = lambda fraction: _progress_event(
        job, "running", round(fraction, 4), "Working..."
    )

    if action == "COMPRESS":
        return _compress_media_run(
            file_path,
            job.get("target_mb"),
            job.get("quality", 65),
            progress=progress,
            cancel=cancel,
            threads=threads,
        )
    return _convert_media_run(
        file_path,
        job["target_format"],
        progress=progress,
        cancel=cancel,
        threads=threads,
    )


def _retire(job_id: str) -> None:
    """Drops job records once more than :data:`_HISTORY` have finished."""
    with _lock:
        finished = [key for key, job in _jobs.items() if job["status"] in ("done", "error", "cancelled")]
        for stale in finished[:-_HISTORY]:
            _jobs.pop(stale, None)
            _cancels.pop(stale, None)
        _cancels.pop(job_id, None)


def _finish(
    job: Dict[str, Any], ok: bool, status: str, message: str, result: Any = None
) -> None:
    with _lock:
        job["status"] = status
        job["message"] = message
    _progress_event(job, status, 1.0 if ok else None, message)
    _result_event(job, ok, status, message, result)
    _retire(job["id"])


def _work() -> None:
    """Owns the queue: one job at a time, in submission order."""
    global _running
    while True:
        with _lock:
            if not _queue:
                _running = None
                return
            job_id = _queue.popleft()
            job = _jobs.get(job_id)
            if job is None or job["status"] == "cancelled":
                continue
            cancel = threading.Event()
            _cancels[job_id] = cancel
            _running = job_id
            job["status"] = "running"

        determinate = _is_determinate(job["file_path"])
        _progress_event(job, "running", 0.0 if determinate else None, "Starting...")

        threads = _thread_cap()
        try:
            output = _execute(job, cancel, threads)
            _finish(job, True, "done", "Done.", output)
        except MediaCancelled:
            _finish(job, False, "cancelled", "Stopped.")
        except Exception as exc:  # noqa: BLE001 - always reported to the popup
            logger.warning("Media job %s failed: %s", job_id, exc)
            _finish(job, False, "error", str(exc))


def _ensure_worker() -> None:
    global _worker
    if _worker is not None and _worker.is_alive():
        return
    _worker = threading.Thread(target=_work, name="media-jobs", daemon=True)
    _worker.start()


async def _handle_submit(payload: Dict[str, Any]) -> None:
    global _loop
    _loop = asyncio.get_running_loop()

    action = str(payload.get("action") or "").upper()
    file_path = str(payload.get("file_path") or "")
    job_id = str(payload.get("job_id") or uuid.uuid4().hex)[:64]

    if action not in ("COMPRESS", "CONVERT") or not file_path:
        await ws_manager.broadcast("ERROR", {"message": "Invalid media job."})
        return
    if not Path(file_path).is_file():
        _result_event(
            {"id": job_id, "action": action, "file_path": file_path},
            False,
            "error",
            "File not found.",
        )
        return
    if action == "CONVERT" and not str(payload.get("target_format") or "").strip():
        await ws_manager.broadcast("ERROR", {"message": "Missing conversion format."})
        return

    job = {
        "id": job_id,
        "action": action,
        "file_path": file_path,
        "status": "queued",
        "message": "",
        "quality": int(payload.get("quality") or 65),
        "target_mb": payload.get("target_mb"),
        "target_format": str(payload.get("target_format") or ""),
    }

    with _lock:
        existing = _jobs.get(job_id)
        duplicate = existing is not None and existing["status"] == "running"
    if duplicate:
        await ws_manager.broadcast("ERROR", {"message": "That job is already running."})
        return

    with _lock:
        ahead = len(_queue) + (1 if _running else 0)
        _jobs[job_id] = job
        _queue.append(job_id)

    _progress_event(
        job,
        "queued",
        None,
        "Waiting for the current job..." if ahead else "Starting...",
    )
    _ensure_worker()


async def _handle_cancel(payload: Dict[str, Any]) -> None:
    job_id = str(payload.get("job_id") or "")
    with _lock:
        job = _jobs.get(job_id)
        running = _running == job_id
        cancel = _cancels.get(job_id)
        if job is not None and job["status"] == "queued":
            try:
                _queue.remove(job_id)
            except ValueError:
                pass
            job["status"] = "cancelled"

    if job is None:
        return
    if running and cancel is not None:
        # The worker notices, removes the partial file, and reports the result.
        cancel.set()
        return
    if job["status"] == "cancelled":
        _finish(job, False, "cancelled", "Stopped.")


def register_media_job_events() -> None:
    """Registers the background media job handlers."""
    from .event_router import register_handler

    register_handler("SUBMIT_MEDIA_JOB", _handle_submit)
    register_handler("CANCEL_MEDIA_JOB", _handle_cancel)
