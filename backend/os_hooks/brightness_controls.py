"""
Aether Screen Brightness Controls

Laptop panels expose brightness through WMI (``root\\wmi``) in about 20 ms.
DDC/CI on this machine refuses every request and retries 49 times (~3.5 s) per
call, so the old write path queued minutes of work during one slider drag and
starved every other control button.

Reads stay behind a cache. Writes are coalesced onto one worker thread: the
caller publishes the new value and returns immediately, only the latest value
is attempted, and a refusal pauses hardware writes for two minutes.
"""

import logging
import threading
import time
from typing import Optional

logger = logging.getLogger("aether.brightness")

# SBC logs an EDID parse warning for some laptop panels on every poll; the
# telemetry poller calls this frequently, so keep the daemon log usable.
logging.getLogger("screen_brightness_control").setLevel(logging.ERROR)

_CACHE_SECONDS = 20.0
_RETRY_SECONDS = 120.0
_WMI_NAMESPACE = r"root\wmi"

_lock = threading.Lock()
_device_lock = threading.Lock()
_state = {"value": None, "ts": 0.0, "retry_at": 0.0}
_refreshing = False

_write_pending: Optional[int] = None
_writing = False
_write_retry_at = 0.0


def _wmi_service():
    """Opens a WMI connection for the calling thread (COM init is per thread)."""
    import pythoncom
    import win32com.client

    pythoncom.CoInitialize()
    return win32com.client.Dispatch("WbemScripting.SWbemLocator").ConnectServer(
        ".", _WMI_NAMESPACE
    )


def _wmi_read() -> Optional[int]:
    try:
        service = _wmi_service()
        for monitor in service.ExecQuery("SELECT * FROM WmiMonitorBrightness"):
            value = getattr(monitor, "CurrentBrightness", None)
            if value is not None:
                return int(value)
    except Exception:
        return None
    return None


def _wmi_write(level: int) -> bool:
    """Sets brightness by parameter name; this driver's order is non-standard."""
    try:
        service = _wmi_service()
        wrote = False
        for method in service.ExecQuery(
            "SELECT * FROM WmiMonitorBrightnessMethods"
        ):
            params = method.Methods_("WmiSetBrightness").InParameters.SpawnInstance_()
            params.Properties_.Item("Brightness").Value = int(level)
            params.Properties_.Item("Timeout").Value = 1
            method.ExecMethod_("WmiSetBrightness", params)
            wrote = True
        return wrote
    except Exception:
        return False


def _sbc_read() -> Optional[int]:
    """DDC/CI fallback for desktops without a WMI brightness interface."""
    try:
        import screen_brightness_control as sbc

        with _device_lock:
            raw = sbc.get_brightness()
        if isinstance(raw, (list, tuple)):
            raw = raw[0] if raw else None
        return int(raw) if raw is not None else None
    except Exception:
        return None


def _sbc_write(level: int) -> bool:
    try:
        import screen_brightness_control as sbc

        with _device_lock:
            sbc.set_brightness(level)
        return True
    except Exception:
        return False


def _refresh(started: float) -> None:
    """Reads brightness once, then publishes it unless a write won the race."""
    global _refreshing
    value = _wmi_read()
    if value is None:
        value = _sbc_read()

    with _lock:
        # A set_brightness() call during the read is newer than this sample.
        if _state["ts"] <= started:
            if value is None:
                _state["retry_at"] = time.time() + _RETRY_SECONDS
            else:
                _state.update(
                    {"value": value, "ts": time.time(), "retry_at": 0.0}
                )
        _refreshing = False


def _request_refresh() -> None:
    global _refreshing
    now = time.time()
    with _lock:
        if _refreshing or now < _state["retry_at"]:
            return
        if now - float(_state["ts"]) < _CACHE_SECONDS:
            return
        _refreshing = True
    threading.Thread(
        target=_refresh, args=(now,), name="aether-brightness", daemon=True
    ).start()


def get_brightness() -> Optional[int]:
    """Returns the last known brightness without ever blocking on the display."""
    _request_refresh()
    with _lock:
        return _state["value"]  # type: ignore[return-value]


def _write_loop() -> None:
    """Applies only the newest requested level, with a back-off on refusal."""
    global _write_pending, _writing, _write_retry_at
    import pythoncom

    pythoncom.CoInitialize()
    while True:
        with _lock:
            level = _write_pending
            _write_pending = None
            if level is None:
                _writing = False
                return
            backed_off = time.time() < _write_retry_at

        if backed_off:
            continue

        wrote = _wmi_write(level) or _sbc_write(level)

        with _lock:
            if wrote:
                _write_retry_at = 0.0
            else:
                _write_retry_at = time.time() + _RETRY_SECONDS

        if not wrote:
            logger.warning(
                "Display refused brightness change; pausing writes for %d s",
                int(_RETRY_SECONDS),
            )


def set_brightness(level: int) -> int:
    """Publishes a new brightness level and returns without waiting for hardware."""
    global _write_pending, _writing
    clamped = max(0, min(100, int(level)))
    now = time.time()

    with _lock:
        # Publish the new setpoint first so the poller cannot report the old
        # value immediately after the write and snap the slider back.
        _state.update({"value": clamped, "ts": now, "retry_at": 0.0})
        _write_pending = clamped
        if not _writing and now >= _write_retry_at:
            _writing = True
            threading.Thread(
                target=_write_loop,
                name="aether-brightness-write",
                daemon=True,
            ).start()

    return clamped
