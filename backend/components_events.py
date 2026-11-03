"""
WebSocket events for the Components (optional pack) Settings tab.

Installing a pack is a long, disk-heavy job: it downloads over the network,
hashes the result and unpacks an archive. It therefore runs alone on a
dedicated single-worker pool rather than the shared executor, so a slow
download can never starve media controls or taskbar launches (Rule 5).

Progress streams as ``COMPONENT_PROGRESS`` and the terminal snapshot as
``COMPONENT_RESULT``. Only one install runs at a time; the backend is the
source of truth, so a second request is refused with the live state instead of
queued. ``COMPONENTS_STATE`` carries the full list with install state.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, Optional

from .components_manager import (
    ComponentCancelled,
    ComponentError,
    change_components_dir,
    components_directories,
    install_component,
    list_components,
    remove_component,
)
from .event_router import register_handler
from .ws_manager import ws_manager

logger = logging.getLogger("aether.components")

# A download must not share the default executor. One worker is enough: only
# one install may be in flight, and the queue behind it is what we want.
_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="aether-components")

_lock = threading.Lock()
_running_id: Optional[str] = None
_cancel: Optional[threading.Event] = None
_task: Optional[asyncio.Task] = None


def _is_running(component_id: str) -> bool:
    with _lock:
        return _running_id == component_id


async def _broadcast_progress(component_id: str, payload: Dict[str, Any]) -> None:
    if not _is_running(component_id):
        return
    await ws_manager.broadcast("COMPONENT_PROGRESS", payload)


async def broadcast_components() -> None:
    """Publishes the full component list (manifest entries + install state)."""
    loop = asyncio.get_running_loop()
    # A handful of directory reads; safe on the shared executor even while a
    # download owns the components pool.
    components = await loop.run_in_executor(None, list_components)
    directories = await loop.run_in_executor(None, components_directories)
    await ws_manager.broadcast(
        "COMPONENTS_STATE", {"components": components, **directories}
    )


def _invalidate_component_caches() -> None:
    """Lets engines that cached a "component missing" answer re-probe.

    A pack can be installed or removed while the daemon keeps running, so any
    negative result that was cached before the change must be dropped:
    espeak-ng remembers a failed probe, and Phonon-2 arms a retry backoff after
    a failed start. Without this the new pack would not take effect until the
    next restart (espeak-ng) or the next retry window (up to 5 minutes).
    """
    from .ai import espeak_g2p
    from .ai.stt_engine import stt_engine

    espeak_g2p.reset_cache()
    stt_engine.reset_component_state()


async def _run_install(component_id: str, cancel: threading.Event) -> None:
    global _running_id, _cancel

    loop = asyncio.get_running_loop()

    def emit(payload: Dict[str, Any]) -> None:
        try:
            asyncio.run_coroutine_threadsafe(
                _broadcast_progress(component_id, payload), loop
            )
        except RuntimeError:
            # The event loop is shutting down; the download can finish quietly.
            pass

    try:
        component = await loop.run_in_executor(
            _pool, install_component, component_id, emit, cancel
        )
        outcome: Dict[str, Any] = {
            "id": component_id,
            "ok": True,
            "state": "installed",
            "message": f"Installed {component_id} {component.get('version', '')}".strip(),
            "component": component,
        }
    except ComponentCancelled as exc:
        outcome = {
            "id": component_id,
            "ok": False,
            "state": "cancelled",
            "message": str(exc) or "Download cancelled.",
        }
    except Exception as exc:
        logger.warning("Component %s install failed: %s", component_id, exc)
        outcome = {
            "id": component_id,
            "ok": False,
            "state": "error",
            "message": str(exc),
        }
    finally:
        with _lock:
            _running_id = None
            _cancel = None

    if outcome.get("ok"):
        _invalidate_component_caches()
    await ws_manager.broadcast("COMPONENT_RESULT", outcome)
    await broadcast_components()


async def _handle_list(payload: Dict[str, Any]) -> None:
    await broadcast_components()


async def _handle_install(payload: Dict[str, Any]) -> None:
    global _running_id, _cancel, _task

    component_id = str(payload.get("id") or "").strip()
    if not component_id:
        await ws_manager.broadcast("ERROR", {"message": "Missing component id."})
        return

    with _lock:
        if _running_id is not None:
            busy = _running_id
            cancel = None
        else:
            busy = None
            _running_id = component_id
            _cancel = threading.Event()
            cancel = _cancel

    if busy is not None:
        await ws_manager.broadcast(
            "ERROR", {"message": f"Already installing {busy}. Cancel it first."}
        )
        await broadcast_components()
        return

    _task = asyncio.create_task(_run_install(component_id, cancel))


async def _handle_cancel(payload: Dict[str, Any]) -> None:
    component_id = str(payload.get("id") or "").strip()
    with _lock:
        cancel = _cancel if _running_id == component_id else None
    if cancel is not None:
        cancel.set()


async def _handle_remove(payload: Dict[str, Any]) -> None:
    component_id = str(payload.get("id") or "").strip()
    if not component_id:
        await ws_manager.broadcast("ERROR", {"message": "Missing component id."})
        return

    with _lock:
        busy = _running_id

    if busy is not None:
        await ws_manager.broadcast(
            "ERROR", {"message": f"Wait for the {busy} install to finish first."}
        )
        return

    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(_pool, remove_component, component_id)
    except ComponentError as exc:
        await ws_manager.broadcast("ERROR", {"message": str(exc)})
        return

    _invalidate_component_caches()
    await ws_manager.broadcast(
        "COMPONENT_RESULT",
        {
            "id": component_id,
            "ok": True,
            "state": "removed",
            "message": f"Removed {component_id}.",
        },
    )
    await broadcast_components()


async def _handle_change_dir(payload: Dict[str, Any]) -> None:
    target = str(payload.get("path") or "").strip()
    move = bool(payload.get("move"))

    with _lock:
        busy = _running_id

    if busy is not None:
        await ws_manager.broadcast(
            "ERROR", {"message": f"Wait for the {busy} install to finish first."}
        )
        return

    loop = asyncio.get_running_loop()
    try:
        report = await loop.run_in_executor(
            _pool, change_components_dir, target, move
        )
    except ComponentError as exc:
        await ws_manager.broadcast(
            "COMPONENT_DIR_RESULT", {"ok": False, "message": str(exc)}
        )
        return

    # Every engine resolves packs through the shared folder, so a negative
    # "component missing" answer cached against the old path must be dropped.
    _invalidate_component_caches()
    await ws_manager.broadcast(
        "COMPONENT_DIR_RESULT", {"ok": True, "message": "", **report}
    )
    await broadcast_components()


def register_components_events() -> None:
    """Registers the optional-pack handlers."""
    register_handler("GET_COMPONENTS", _handle_list)
    register_handler("INSTALL_COMPONENT", _handle_install)
    register_handler("CANCEL_COMPONENT", _handle_cancel)
    register_handler("REMOVE_COMPONENT", _handle_remove)
    register_handler("CHANGE_COMPONENTS_DIR", _handle_change_dir)
