"""
Aether System Control WebSocket Handlers
Real volume, mute, Wi-Fi, Bluetooth, and dark-mode commands from the Island.
"""

import asyncio
import logging
from typing import Any, Dict

from .event_router import register_handler
from .os_hooks import system_controls as controls
from .os_hooks.network_controls import get_wifi_details
from .os_hooks.network_devices import (
    connect_wifi_profile,
    disconnect_wifi,
    list_bluetooth_devices,
    list_wifi_profiles,
    open_settings_page,
)
from .ws_manager import ws_manager

logger = logging.getLogger("aether.system")


async def _run(fn, *args):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, fn, *args)


async def _handle_set_volume(payload: Dict[str, Any]) -> None:
    level = payload.get("level")
    if level is None:
        level = float(payload.get("percent", 50)) / 100.0
    actual = await _run(controls.set_master_volume, float(level))
    await ws_manager.broadcast("SYSTEM_CONTROL_CHANGED", {"volume": actual})


async def _handle_set_muted(payload: Dict[str, Any]) -> None:
    muted = bool(payload.get("muted", False))
    actual = await _run(controls.set_mute_state, muted)
    await ws_manager.broadcast("SYSTEM_CONTROL_CHANGED", {"muted": actual})


async def _handle_toggle_wifi(payload: Dict[str, Any]) -> None:
    enabled = payload.get("enabled")
    if enabled is None:
        current = await _run(controls.get_wifi_enabled)
        enabled = not bool(current)
    try:
        allowed = await _run(controls.set_wifi_enabled, bool(enabled))
        if not allowed:
            raise RuntimeError("Windows denied the Wi-Fi radio change.")
        await ws_manager.broadcast("SYSTEM_CONTROL_CHANGED", {"wifi": bool(enabled)})
    except Exception as exc:
        await ws_manager.broadcast("ERROR", {"message": f"Wi-Fi toggle failed: {exc}"})


async def _handle_toggle_bluetooth(payload: Dict[str, Any]) -> None:
    enabled = payload.get("enabled")
    if enabled is None:
        current = await _run(controls.get_bluetooth_enabled)
        enabled = not bool(current)
    try:
        allowed = await _run(controls.set_bluetooth_enabled, bool(enabled))
        if not allowed:
            raise RuntimeError("Windows denied the Bluetooth radio change.")
        await ws_manager.broadcast(
            "SYSTEM_CONTROL_CHANGED", {"bluetooth": bool(enabled)}
        )
    except Exception as exc:
        await ws_manager.broadcast("ERROR", {"message": f"Bluetooth toggle failed: {exc}"})


async def _handle_toggle_dark_mode(payload: Dict[str, Any]) -> None:
    enabled = payload.get("enabled")
    if enabled is None:
        enabled = not controls.get_dark_mode()
    ok = await _run(controls.set_dark_mode, bool(enabled))
    if ok:
        await ws_manager.broadcast(
            "SYSTEM_CONTROL_CHANGED", {"dark_mode": bool(enabled)}
        )
    else:
        await ws_manager.broadcast("ERROR", {"message": "Could not update Windows theme."})


async def _handle_set_brightness(payload: Dict[str, Any]) -> None:
    level = int(payload.get("level", payload.get("percent", 60)))
    actual = await _run(controls.set_brightness, level)
    await ws_manager.broadcast("SYSTEM_CONTROL_CHANGED", {"brightness": actual})


async def _handle_toggle_airplane(payload: Dict[str, Any]) -> None:
    enabled = payload.get("enabled")
    if enabled is None:
        enabled = not bool(await _run(controls.get_airplane_mode))
    ok = await _run(controls.set_airplane_mode, bool(enabled))
    if not ok:
        await ws_manager.broadcast(
            "ERROR",
            {"message": "Windows blocked the radio change; opened Airplane Mode settings."},
        )
        return
    await ws_manager.broadcast(
        "SYSTEM_CONTROL_CHANGED",
        {
            "airplane_mode": bool(enabled),
            "wifi": not bool(enabled),
            "bluetooth": not bool(enabled),
        },
    )


async def _handle_toggle_hotspot(payload: Dict[str, Any]) -> None:
    enabled = payload.get("enabled")
    if enabled is None:
        current = await _run(controls.get_hotspot_enabled)
        enabled = not bool(current)
    ok = await _run(controls.set_hotspot_enabled, bool(enabled))
    if not ok:
        await ws_manager.broadcast(
            "ERROR",
            {"message": "Mobile Hotspot needs Windows Settings; opened the Hotspot page."},
        )
        return
    await ws_manager.broadcast(
        "SYSTEM_CONTROL_CHANGED", {"hotspot": bool(enabled)}
    )


async def _broadcast_wifi_profiles() -> None:
    profiles = await _run(list_wifi_profiles)
    await ws_manager.broadcast("WIFI_PROFILES", {"profiles": profiles})


async def _handle_list_wifi_profiles(payload: Dict[str, Any]) -> None:
    await _broadcast_wifi_profiles()


async def _handle_connect_wifi(payload: Dict[str, Any]) -> None:
    profile = str(payload.get("profile") or "").strip()
    ok = await _run(connect_wifi_profile, profile)
    if not ok:
        await ws_manager.broadcast(
            "ERROR",
            {"message": f"Windows could not connect to Wi-Fi profile '{profile}'."},
        )
    else:
        details = await _run(get_wifi_details)
        await ws_manager.broadcast(
            "SYSTEM_CONTROL_CHANGED",
            {"wifi": True, "wifi_ssid": details.get("ssid", "")},
        )
    await _broadcast_wifi_profiles()


async def _handle_disconnect_wifi(payload: Dict[str, Any]) -> None:
    await _run(disconnect_wifi)
    await ws_manager.broadcast(
        "SYSTEM_CONTROL_CHANGED", {"wifi": True, "wifi_ssid": ""}
    )
    await _broadcast_wifi_profiles()


async def _handle_list_bluetooth_devices(payload: Dict[str, Any]) -> None:
    devices = await _run(list_bluetooth_devices)
    await ws_manager.broadcast("BLUETOOTH_DEVICES", {"devices": devices})


async def _handle_open_settings_page(payload: Dict[str, Any]) -> None:
    page = str(payload.get("page") or "").strip().lower()
    ok = await _run(open_settings_page, page)
    if not ok:
        await ws_manager.broadcast(
            "ERROR", {"message": f"Unknown Windows Settings page: {page or 'empty'}."}
        )


async def _handle_get_system_state(payload: Dict[str, Any]) -> None:
    stats = await _run(controls.get_system_telemetry)
    await ws_manager.broadcast("SYSTEM_STATS", stats)


def register_system_events() -> None:
    """Registers all Windows control event handlers."""
    register_handler("SET_VOLUME", _handle_set_volume)
    register_handler("SET_MUTED", _handle_set_muted)
    register_handler("SET_BRIGHTNESS", _handle_set_brightness)
    register_handler("TOGGLE_WIFI", _handle_toggle_wifi)
    register_handler("TOGGLE_BLUETOOTH", _handle_toggle_bluetooth)
    register_handler("TOGGLE_AIRPLANE_MODE", _handle_toggle_airplane)
    register_handler("TOGGLE_HOTSPOT", _handle_toggle_hotspot)
    register_handler("TOGGLE_DARK_MODE", _handle_toggle_dark_mode)
    register_handler("GET_SYSTEM_STATE", _handle_get_system_state)
    register_handler("LIST_WIFI_PROFILES", _handle_list_wifi_profiles)
    register_handler("CONNECT_WIFI", _handle_connect_wifi)
    register_handler("DISCONNECT_WIFI", _handle_disconnect_wifi)
    register_handler("LIST_BLUETOOTH_DEVICES", _handle_list_bluetooth_devices)
    register_handler("OPEN_SETTINGS_PAGE", _handle_open_settings_page)
