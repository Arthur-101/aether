"""
Network and Bluetooth device discovery.

Uses the native Windows `netsh` Wi-Fi profile store and PowerShell PnP device
inventory so the Controls flyouts show real saved networks and paired devices.
"""

import re
import time
from typing import Any, Dict, List

from .network_controls import (
    _network_cache,
    _open_settings,
    _run_hidden,
    get_bluetooth_enabled,
    get_wifi_details,
)

_PROFILE_LINE = re.compile(r"^\s{4}.+?\s+:\s+(.+?)\s*$")

_SETTINGS_PAGES = {
    "wifi": "ms-settings:network-wifi",
    "bluetooth": "ms-settings:bluetooth",
    "sound": "ms-settings:sound",
    "display": "ms-settings:display",
    "network": "ms-settings:network",
    "settings": "ms-settings:",
}


def list_wifi_profiles() -> List[Dict[str, Any]]:
    """Returns saved Wi-Fi profiles with the currently connected one flagged."""
    output = _run_hidden(["netsh", "wlan", "show", "profiles"], timeout=6.0)
    current = get_wifi_details().get("ssid", "")
    names: List[str] = []
    for line in output.splitlines():
        match = _PROFILE_LINE.match(line)
        if not match:
            continue
        name = match.group(1).strip()
        if not name or name.lower() == "none" or name in names:
            continue
        names.append(name)
    return [{"name": name, "connected": name == current} for name in names]


def connect_wifi_profile(profile: str) -> bool:
    """Connects to a saved Wi-Fi profile and waits for an SSID to appear."""
    name = (profile or "").strip()
    if not name:
        return False
    _network_cache["ssid_ts"] = 0.0
    _run_hidden(["netsh", "wlan", "connect", f"name={name}"], timeout=8.0)
    for _ in range(12):
        time.sleep(0.4)
        _network_cache["ssid_ts"] = 0.0
        if get_wifi_details().get("ssid"):
            return True
    return False


def disconnect_wifi() -> bool:
    """Disconnects the active Wi-Fi network without disabling the radio."""
    _run_hidden(["netsh", "wlan", "disconnect"], timeout=5.0)
    _network_cache["ssid_ts"] = 0.0
    return True


def list_bluetooth_devices() -> List[Dict[str, Any]]:
    """Lists paired Bluetooth devices with live WinRT connection status."""
    if not get_bluetooth_enabled():
        return []

    from .bluetooth_status import list_paired_bluetooth

    return list_paired_bluetooth()


def open_settings_page(page: str) -> bool:
    """Opens an allow-listed Windows Settings page."""
    uri = _SETTINGS_PAGES.get((page or "").strip().lower())
    if not uri:
        return False
    _open_settings(uri)
    return True
