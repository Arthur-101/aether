"""WebSocket handlers for the Spotify connection lifecycle."""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any, Dict

from .config_manager import config_manager
from .event_router import register_handler
from .os_hooks import spotify_auth
from .ws_manager import ws_manager

logger = logging.getLogger("aether.spotify")

_start_lock = threading.Lock()
_started = False


def _status(message: str = "") -> Dict[str, Any]:
    return spotify_auth.get_status(message)


async def _broadcast(message: str = "") -> None:
    await ws_manager.broadcast("SPOTIFY_AUTH_STATE", _status(message))


async def _handle_status(payload: Dict[str, Any]) -> None:
    await _broadcast()


async def _handle_connect(payload: Dict[str, Any]) -> None:
    global _started
    client_id = str(payload.get("client_id") or "").strip()
    if not client_id:
        await _broadcast("Add your Spotify Client ID first.")
        return

    with _start_lock:
        busy = _started or spotify_auth.is_pending()
        if not busy:
            _started = True
    if busy:
        await _broadcast("A Spotify sign-in is already in progress.")
        return

    # Persist the ID before the flow: token refresh after a restart reads it.
    try:
        config_manager.set("spotify", "client_id", client_id)
        await _broadcast("Waiting for Spotify sign-in in your browser…")
    except Exception:
        with _start_lock:
            _started = False
        raise
    loop = asyncio.get_running_loop()

    def _run() -> None:
        global _started
        message = ""
        try:
            spotify_auth.connect(client_id)
            message = ""
        except spotify_auth.SpotifyAuthError as exc:
            if exc.code == "cancelled":
                message = ""
            else:
                logger.warning("Spotify connect failed: %s", exc)
                message = str(exc)
        except Exception as exc:
            logger.exception("Spotify connect failed")
            message = f"Spotify connection failed: {exc}"
        finally:
            with _start_lock:
                _started = False
        try:
            asyncio.run_coroutine_threadsafe(_broadcast(message), loop)
        except RuntimeError:
            logger.debug("Spotify status broadcast skipped; event loop is closed.")

    threading.Thread(target=_run, daemon=True, name="spotify-auth").start()


async def _handle_disconnect(payload: Dict[str, Any]) -> None:
    spotify_auth.disconnect()
    await _broadcast()


def register_spotify_events() -> None:
    """Registers the Spotify settings events."""
    register_handler("GET_SPOTIFY_STATUS", _handle_status)
    register_handler("SPOTIFY_CONNECT", _handle_connect)
    register_handler("SPOTIFY_DISCONNECT", _handle_disconnect)
