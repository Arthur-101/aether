"""
Aether Screen Brightness Controls
Lazy wrapper around screen-brightness-control; never imported at daemon startup.
"""

import logging
import threading
import time
from typing import Optional

# SBC logs an EDID parse warning for some laptop panels on every poll; the
# telemetry poller calls this frequently, so keep the daemon log usable.
logging.getLogger("screen_brightness_control").setLevel(logging.ERROR)

_CACHE_SECONDS = 3.0
_cache: dict[str, object] = {"value": None, "ts": 0.0}
_brightness_lock = threading.Lock()


def get_brightness() -> Optional[int]:
    """Returns the primary display brightness percentage, or None if unsupported."""
    now = time.time()
    if now - float(_cache["ts"]) < _CACHE_SECONDS:
        return _cache["value"]  # type: ignore[return-value]

    with _brightness_lock:
        now = time.time()
        if now - float(_cache["ts"]) < _CACHE_SECONDS:
            return _cache["value"]  # type: ignore[return-value]
        try:
            import screen_brightness_control as sbc

            value = sbc.get_brightness()
            if isinstance(value, (list, tuple)):
                value = value[0] if value else None
            value = int(value) if value is not None else None
        except Exception:
            value = None
        _cache.update({"value": value, "ts": time.time()})
        return value


def set_brightness(level: int) -> int:
    """Sets display brightness and returns the clamped percentage."""
    clamped = max(0, min(100, int(level)))
    # Serialize hardware writes so overlapping slider events cannot finish out
    # of order, and cache the setpoint so the 1 Hz telemetry poll does not read
    # a stale value immediately after the write.
    with _brightness_lock:
        try:
            import screen_brightness_control as sbc

            sbc.set_brightness(clamped)
        except Exception:
            pass
        _cache.update({"value": clamped, "ts": time.time()})
    return clamped
