"""
Aether Network Controls & Radio Telemetry
Real Wi-Fi SSID, connected Bluetooth audio endpoint, Airplane Mode, and Mobile
Hotspot control using netsh, PowerShell, and the Windows Runtime.
"""

import asyncio
import os
import subprocess
import time
import winreg
from typing import Any, Dict, Optional

_CREATE_NO_WINDOW = 0x08000000
_radio_cache: Dict[str, Any] = {"wifi": None, "bluetooth": None, "ts": 0.0}
_network_cache: Dict[str, Any] = {"ssid_ts": 0.0, "ssid": "", "bt_ts": 0.0, "bt_name": ""}
_airplane_override: Dict[str, Any] = {"value": None, "ts": 0.0}
_hotspot_cache: Dict[str, Any] = {"value": None, "ts": 0.0}
_RADIO_CACHE_SECONDS = 5.0
_NETWORK_CACHE_SECONDS = 8.0
_HOTSPOT_CACHE_SECONDS = 8.0
_AIRPLANE_KEY = r"SYSTEM\CurrentControlSet\Control\RadioManagement\SystemRadioState"


def _run_hidden(args: list[str], timeout: float = 4.0) -> str:
    try:
        return subprocess.check_output(
            args,
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
            creationflags=_CREATE_NO_WINDOW,
        )
    except Exception:
        return ""


# ─── Windows Radio API (Wi-Fi / Bluetooth / Airplane) ───────────
def get_radio_states() -> Dict[str, Optional[bool]]:
    """Reads Wi-Fi and Bluetooth radio states via the WinRT Radio API."""
    if time.time() - _radio_cache["ts"] < _RADIO_CACHE_SECONDS:
        return {"wifi": _radio_cache["wifi"], "bluetooth": _radio_cache["bluetooth"]}
    try:
        from winsdk.windows.devices.radios import Radio, RadioKind, RadioState

        async def _read():
            state: Dict[str, Optional[bool]] = {"wifi": None, "bluetooth": None}
            for radio in await Radio.get_radios_async():
                if radio.kind == RadioKind.WI_FI:
                    state["wifi"] = radio.state == RadioState.ON
                elif radio.kind == RadioKind.BLUETOOTH:
                    state["bluetooth"] = radio.state == RadioState.ON
            return state

        state = asyncio.run(_read())
        _radio_cache.update(state)
        _radio_cache["ts"] = time.time()
    except Exception:
        pass
    return {"wifi": _radio_cache["wifi"], "bluetooth": _radio_cache["bluetooth"]}


def _set_radio(kind_name: str, enabled: bool) -> bool:
    """Enables/disables a Wi-Fi or Bluetooth radio through WinRT."""
    from winsdk.windows.devices.radios import (
        Radio,
        RadioAccessStatus,
        RadioKind,
        RadioState,
    )

    kind = RadioKind.WI_FI if kind_name == "wifi" else RadioKind.BLUETOOTH
    target_state = RadioState.ON if enabled else RadioState.OFF

    async def _apply():
        for radio in await Radio.get_radios_async():
            if radio.kind == kind:
                status = await radio.set_state_async(target_state)
                return status == RadioAccessStatus.ALLOWED
        return False

    allowed = asyncio.run(_apply())
    if allowed:
        _radio_cache[kind_name] = enabled
        _radio_cache["ts"] = time.time()
        _network_cache["ssid_ts"] = 0.0
        _network_cache["bt_ts"] = 0.0
    return allowed


def get_wifi_enabled() -> Optional[bool]:
    return get_radio_states()["wifi"]


def set_wifi_enabled(enabled: bool) -> bool:
    _airplane_override["value"] = None
    return _set_radio("wifi", enabled)


def get_bluetooth_enabled() -> Optional[bool]:
    return get_radio_states()["bluetooth"]


def set_bluetooth_enabled(enabled: bool) -> bool:
    _airplane_override["value"] = None
    return _set_radio("bluetooth", enabled)


# ─── Wi-Fi SSID & Bluetooth device name ─────────────────────────
def get_wifi_details() -> Dict[str, Any]:
    """Returns radio state plus the actual connected Wi-Fi SSID."""
    now = time.time()
    if now - _network_cache["ssid_ts"] >= _NETWORK_CACHE_SECONDS:
        output = _run_hidden(["netsh", "wlan", "show", "interfaces"])
        ssid = ""
        for line in output.splitlines():
            stripped = line.strip()
            if stripped.startswith("SSID") and not stripped.startswith("BSSID"):
                ssid = stripped.split(":", 1)[-1].strip()
                break
        _network_cache["ssid"] = ssid
        _network_cache["ssid_ts"] = now
    return {"enabled": get_wifi_enabled(), "ssid": _network_cache["ssid"]}


def get_bluetooth_device_name() -> str:
    """Returns the active Bluetooth audio endpoint name, when one is connected."""
    now = time.time()
    if now - _network_cache["bt_ts"] < _NETWORK_CACHE_SECONDS:
        return _network_cache["bt_name"]
    if not get_bluetooth_enabled():
        _network_cache["bt_name"] = ""
        _network_cache["bt_ts"] = now
        return ""

    script = (
        "$d = Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue "
        "| Where-Object { $_.InstanceId -like '*BTHENUM*' } | Select-Object -First 1; "
        "if ($d) { $d.FriendlyName } else { "
        "$b = Get-PnpDevice -Class Bluetooth -Status OK -ErrorAction SilentlyContinue "
        "| Where-Object { $_.FriendlyName -notmatch 'Enumerator|Protocol|Adapter|Service|Radio' } "
        "| Select-Object -First 1; if ($b) { $b.FriendlyName } }"
    )
    output = _run_hidden(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", script], timeout=5.0
    )
    _network_cache["bt_name"] = output.strip().splitlines()[0] if output.strip() else ""
    _network_cache["bt_ts"] = now
    return _network_cache["bt_name"]


# ─── Airplane Mode ───────────────────────────────────────────────
def get_airplane_mode() -> bool:
    """Reads Windows Airplane Mode, falling back to all-radio-off inference."""
    if _airplane_override["value"] is not None:
        return bool(_airplane_override["value"])
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, _AIRPLANE_KEY) as key:
            value, _ = winreg.QueryValueEx(key, "")
            return bool(int(value))
    except Exception:
        states = [state for state in get_radio_states().values() if state is not None]
        return bool(states) and all(state is False for state in states)


def _open_settings(uri: str) -> None:
    try:
        os.startfile(uri)  # type: ignore[attr-defined]
    except Exception:
        pass


def set_airplane_mode(enabled: bool) -> bool:
    """Turns both radios off/on; falls back to the Windows Airplane settings page."""
    try:
        results = [
            _set_radio("wifi", not enabled),
            _set_radio("bluetooth", not enabled),
        ]
        if not any(results):
            raise RuntimeError("Windows denied the radio change.")
        _airplane_override.update({"value": enabled, "ts": time.time()})
        return True
    except Exception:
        _open_settings("ms-settings:network-airplanemode")
        return False


# ─── Mobile Hotspot ─────────────────────────────────────────────
def get_hotspot_enabled() -> Optional[bool]:
    """Reads the Windows tethering manager operational state."""
    if time.time() - _hotspot_cache["ts"] < _HOTSPOT_CACHE_SECONDS:
        return _hotspot_cache["value"]
    try:
        from winsdk.windows.networking.connectivity import NetworkInformation
        from winsdk.windows.networking.networkoperators import (
            NetworkOperatorTetheringManager,
            TetheringOperationalState,
        )

        profile = NetworkInformation.get_internet_connection_profile()
        if not profile:
            value = False
        else:
            manager = NetworkOperatorTetheringManager.create_from_connection_profile(profile)
            value = manager.tethering_operational_state == TetheringOperationalState.ON
    except Exception:
        value = None
    _hotspot_cache.update({"value": value, "ts": time.time()})
    return value


def set_hotspot_enabled(enabled: bool) -> bool:
    """Starts/stops Mobile Hotspot; opens Settings when carrier policy blocks it."""
    try:
        from winsdk.windows.networking.connectivity import NetworkInformation
        from winsdk.windows.networking.networkoperators import NetworkOperatorTetheringManager

        async def _toggle():
            profile = NetworkInformation.get_internet_connection_profile()
            if not profile:
                raise RuntimeError("No internet connection profile is available.")
            manager = NetworkOperatorTetheringManager.create_from_connection_profile(profile)
            if enabled:
                config = manager.get_current_access_point_configuration()
                await manager.start_tethering_async(config)
            else:
                await manager.stop_tethering_async()

        asyncio.run(_toggle())
        _hotspot_cache.update({"value": enabled, "ts": time.time()})
        return True
    except Exception:
        _open_settings("ms-settings:network-mobilehotspot")
        return False
