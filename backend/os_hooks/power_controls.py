"""
Safe Windows power actions.

The renderer sends an intent, never a shell command. Destructive actions also
require an explicit confirmation flag at this boundary, even though the UI
already asks the user.
"""

from __future__ import annotations

import ctypes
import subprocess
import sys
from typing import Any, Dict

CREATE_NO_WINDOW = 0x08000000
VALID_ACTIONS = {"lock", "sleep", "restart", "shutdown"}
DESTRUCTIVE_ACTIONS = {"restart", "shutdown"}


def _lock_workstation() -> bool:
    return bool(ctypes.windll.user32.LockWorkStation())


def _sleep_pc() -> bool:
    # Hibernate=0, ForceCritical=0, DisableWakeEvent=0
    return bool(ctypes.windll.powrprof.SetSuspendState(0, 0, 0))


def _spawn_shutdown(arguments: list[str]) -> bool:
    try:
        subprocess.Popen(
            ["shutdown.exe", *arguments],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
            creationflags=CREATE_NO_WINDOW,
        )
        return True
    except Exception:
        return False


def run_power_action(action: str, confirm: bool = False) -> Dict[str, Any]:
    """Executes one power action. This function may block briefly."""
    normalized = str(action or "").strip().lower()
    if normalized not in VALID_ACTIONS:
        return {
            "ok": False,
            "action": normalized,
            "message": "Unknown power action.",
        }
    if normalized in DESTRUCTIVE_ACTIONS and not confirm:
        return {
            "ok": False,
            "action": normalized,
            "message": "This action requires confirmation.",
        }
    if not sys.platform.startswith("win"):
        return {
            "ok": False,
            "action": normalized,
            "message": "Power actions are only available on Windows.",
        }

    try:
        if normalized == "lock":
            ok = _lock_workstation()
            message = "Locking this PC." if ok else "Windows rejected the lock request."
        elif normalized == "sleep":
            ok = _sleep_pc()
            message = "Putting this PC to sleep." if ok else "Windows rejected the sleep request."
        elif normalized == "restart":
            ok = _spawn_shutdown(["/r", "/t", "0"])
            message = "Restart command sent." if ok else "Could not start the restart command."
        else:
            ok = _spawn_shutdown(["/s", "/t", "0"])
            message = "Shut down command sent." if ok else "Could not start the shutdown command."
    except Exception as exc:
        return {
            "ok": False,
            "action": normalized,
            "message": f"Power action failed: {exc}",
        }

    return {"ok": ok, "action": normalized, "message": message}
