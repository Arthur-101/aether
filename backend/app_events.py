"""
Aether App Lifecycle Events
Temporary dev kill switch that frees the Aether ports (8765/1420/8089),
closes the overlay, and exits — the WebSocket equivalent of stop_aether.bat.
"""

import asyncio
import logging
import os
import subprocess
from typing import Any, Dict

from .event_router import register_handler

logger = logging.getLogger("aether.app")

_PORTS = {"8765", "1420", "8089"}
_IMAGE_NAMES = {"llama-server.exe", "aether.exe"}


def _port_pids() -> set:
    """PIDs currently LISTENING on the Aether ports (netstat-based)."""
    pids: set = set()
    try:
        output = subprocess.run(
            ["netstat", "-aon"], capture_output=True, text=True, timeout=10
        ).stdout
    except Exception:
        return pids
    for line in output.splitlines():
        parts = line.split()
        if len(parts) >= 5 and parts[3].upper() == "LISTENING":
            port = parts[1].rsplit(":", 1)[-1]
            if port in _PORTS:
                try:
                    pids.add(int(parts[4]))
                except ValueError:
                    continue
    return pids


def _named_pids() -> set:
    """PIDs of llama-server/Aether and the Tauri dev overlay (src-tauri app.exe)."""
    pids: set = set()
    try:
        import psutil
    except ImportError:
        return pids
    for proc in psutil.process_iter(["name"]):
        try:
            name = (proc.info.get("name") or "").lower()
            if name in _IMAGE_NAMES:
                pids.add(proc.pid)
            elif name == "app.exe" and "src-tauri" in (proc.exe() or "").lower():
                pids.add(proc.pid)
        except Exception:
            continue
    return pids


def _kill_everything() -> None:
    """Terminates Aether processes and ports, then exits this process."""
    import psutil

    pids = (_port_pids() | _named_pids()) - {os.getpid()}
    for pid in pids:
        try:
            psutil.Process(pid).kill()
        except Exception:
            continue
    logger.warning("Kill switch: closed %d process(es), exiting.", len(pids))
    os._exit(0)


async def _handle_kill_app(payload: Dict[str, Any]) -> None:
    """Runs the kill switch off the event loop so it cannot block the handler."""
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _kill_everything)


def register_app_events() -> None:
    """Registers temporary app lifecycle handlers."""
    register_handler("KILL_APP", _handle_kill_app)
