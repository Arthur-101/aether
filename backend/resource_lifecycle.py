"""Reclaims idle model memory.

The local LLM (llama-server) and the embedding model (fastembed/onnxruntime)
stay resident once loaded, which is what makes the first reply after a pause
instant. The cost is memory: a few hundred megabytes for the embedder and the
GGUF model's host-side footprint. This module watches last-use and, when the
user has enabled it in Settings, unloads a runtime after a configurable idle
period. ``0`` disables automatic unloading for that runtime.

A runtime is never unloaded while a call is in flight, so an auto-unload can
never interrupt a reply, dictation cleanup, or a memory lookup.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import threading
import time
from typing import Iterator

from .config_manager import config_manager

logger = logging.getLogger("aether.lifecycle")

# Frequent enough to feel prompt, rare enough to be free. The exact unload
# moment is not user-visible, so precision is not worth a tighter loop.
POLL_SECONDS = 30.0

_lock = threading.Lock()
_llm_last_used = 0.0
_llm_active = 0
_embedding_last_used = 0.0
_embedding_active = 0


def _now() -> float:
    return time.monotonic()


@contextlib.contextmanager
def llm_activity() -> Iterator[None]:
    """Marks the local LLM busy; it is never unloaded while a turn runs."""
    global _llm_active, _llm_last_used
    with _lock:
        _llm_active += 1
    try:
        yield
    finally:
        with _lock:
            _llm_active = max(0, _llm_active - 1)
            _llm_last_used = _now()


@contextlib.contextmanager
def embedding_activity() -> Iterator[None]:
    """Marks the embedding model busy for the duration of a memory lookup."""
    global _embedding_active, _embedding_last_used
    with _lock:
        _embedding_active += 1
    try:
        yield
    finally:
        with _lock:
            _embedding_active = max(0, _embedding_active - 1)
            _embedding_last_used = _now()


def note_llm_started() -> None:
    """Records that the local model was just (pre)loaded, resetting its timer."""
    global _llm_last_used
    with _lock:
        _llm_last_used = _now()


def note_embedding_loaded() -> None:
    """Records that the embedding model was just loaded, resetting its timer."""
    global _embedding_last_used
    with _lock:
        _embedding_last_used = _now()


def _minutes(key: str) -> int:
    try:
        return max(0, int(config_manager.get("ai_provider", key, 0) or 0))
    except (TypeError, ValueError):
        return 0


def _idle_expired(last_used: float, minutes: int, now: float) -> bool:
    return minutes > 0 and last_used > 0 and (now - last_used) >= minutes * 60


async def reclaim_once() -> None:
    """Unloads any runtime that has been idle past its configured timeout."""
    global _llm_last_used, _embedding_last_used
    now = _now()
    loop = asyncio.get_running_loop()

    llm_minutes = _minutes("llm_idle_unload_minutes")
    with _lock:
        llm_idle = _llm_active == 0 and _idle_expired(
            _llm_last_used, llm_minutes, now
        )
    if llm_idle:
        from .ai.llm_router import llm_router

        def _unload_llm() -> bool:
            # A health probe is a localhost round-trip; keep it off the loop.
            if llm_router.active_mode() != "local_gguf" or not llm_router.is_healthy():
                return False
            llm_router.stop_server()
            return True

        if await loop.run_in_executor(None, _unload_llm):
            logger.info("Unloaded the local model after %d min idle.", llm_minutes)
            with _lock:
                _llm_last_used = 0.0
            try:
                from .model_events import broadcast_model_status

                await broadcast_model_status()
            except Exception:
                logger.debug("Could not broadcast model status after unload")

    emb_minutes = _minutes("embedding_idle_unload_minutes")
    with _lock:
        emb_idle = _embedding_active == 0 and _idle_expired(
            _embedding_last_used, emb_minutes, now
        )
    if emb_idle:
        from .ai import embedder

        if embedder.release():
            logger.info(
                "Released the memory embedding model after %d min idle.", emb_minutes
            )
            with _lock:
                _embedding_last_used = 0.0


async def idle_loop() -> None:
    """Background loop that runs :func:`reclaim_once` on a fixed cadence."""
    while True:
        await asyncio.sleep(POLL_SECONDS)
        try:
            await reclaim_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.debug("Idle reclaim pass failed", exc_info=True)
