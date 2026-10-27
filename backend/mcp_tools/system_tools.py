"""System telemetry and control tools for the assistant.

Reads come from the cached ``os_hooks`` snapshots, so a tool call never blocks
on the display bus. Volume and brightness are ordinary writes; mute and the
two radio switches are ``system`` risk and pause for approval in the tool loop.
"""

from __future__ import annotations

from typing import Any, Dict, List

import psutil

from ..os_hooks import brightness_controls, network_controls, system_controls


def _percent(value: Any) -> int:
    """Parses a 0-100 percentage, clamping values outside the range."""
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("level must be a number from 0 to 100.") from exc
    return max(0, min(100, int(round(number))))


def _as_bool(value: Any) -> bool:
    """Accepts the booleans a model sends as JSON, including text forms."""
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _on_off(value: Any) -> str:
    return "unknown" if value is None else ("on" if value else "off")


def _uptime(seconds: Any) -> str:
    try:
        total = max(0, int(seconds))
    except (TypeError, ValueError):
        return "unknown"
    days, remainder = divmod(total, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes = remainder // 60
    parts: List[str] = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    parts.append(f"{minutes}m")
    return " ".join(parts)


def _battery_line() -> str:
    try:
        battery = psutil.sensors_battery()
    except Exception:
        battery = None
    if battery is None:
        return "- Battery: no battery detected"
    state = "plugged in" if battery.power_plugged else "on battery"
    return f"- Battery: {round(battery.percent)}% · {state}"


def get_system_stats() -> str:
    """Reports CPU, memory, disk, GPU, battery, volume, and device state."""
    stats = system_controls.get_system_telemetry()
    lines = ["System status:"]

    cpu = stats.get("cpu_percent")
    cores = stats.get("cpu_cores")
    threads = stats.get("cpu_threads")
    cpu_line = f"- CPU: {cpu}%" if cpu is not None else "- CPU: unknown"
    if cores and threads:
        cpu_line += f" ({cores} cores / {threads} threads)"
    lines.append(cpu_line)

    lines.append(
        f"- RAM: {stats.get('ram_percent')}% used "
        f"({stats.get('ram_used_gb')} of {stats.get('ram_total_gb')} GB)"
    )
    lines.append(
        f"- Disk (C:): {stats.get('disk_percent')}% used "
        f"({stats.get('disk_used_gb')} of {stats.get('disk_total_gb')} GB)"
    )

    gpu_name = stats.get("gpu_name")
    if gpu_name:
        gpu_parts = [str(gpu_name)]
        if stats.get("gpu_percent") is not None:
            gpu_parts.append(f"{round(float(stats['gpu_percent']))}%")
        used = stats.get("gpu_vram_used_gb")
        total = stats.get("gpu_vram_total_gb")
        if used is not None and total is not None:
            gpu_parts.append(f"{used} of {total} GB VRAM")
        if stats.get("gpu_temp_c") is not None:
            gpu_parts.append(f"{round(float(stats['gpu_temp_c']))}°C")
        lines.append("- GPU: " + " · ".join(gpu_parts))

    lines.append(_battery_line())

    volume = stats.get("volume")
    volume_text = f"{round(float(volume) * 100)}%" if volume is not None else "unknown"
    muted = "muted" if stats.get("muted") else "not muted"
    lines.append(f"- Volume: {volume_text} · {muted}")

    brightness = stats.get("brightness")
    lines.append(
        f"- Brightness: {brightness}%"
        if brightness is not None
        else "- Brightness: unknown"
    )

    wifi = f"- Wi-Fi: {_on_off(stats.get('wifi'))}"
    ssid = str(stats.get("wifi_ssid") or "").strip()
    if ssid:
        wifi += f' · "{ssid}"'
    lines.append(wifi)

    bluetooth = f"- Bluetooth: {_on_off(stats.get('bluetooth'))}"
    device = str(stats.get("bluetooth_device") or "").strip()
    if device:
        bluetooth += f' · "{device}"'
    lines.append(bluetooth)

    lines.append(f"- Airplane mode: {_on_off(stats.get('airplane_mode'))}")
    lines.append(f"- Mobile hotspot: {_on_off(stats.get('hotspot'))}")
    lines.append(f"- Uptime: {_uptime(stats.get('uptime_seconds'))}")
    lines.append(f"- Dark mode: {_on_off(stats.get('dark_mode'))}")
    return "\n".join(lines)


def set_volume(level: int) -> str:
    """Sets the system output volume as a percentage (0-100)."""
    actual = round(system_controls.set_master_volume(_percent(level) / 100.0) * 100)
    return f"System volume set to {actual}%."


def set_mute(muted: bool) -> str:
    """Mutes or unmutes the system output."""
    state = bool(system_controls.set_mute_state(_as_bool(muted)))
    return "System audio muted." if state else "System audio unmuted."


def set_brightness(level: int) -> str:
    """Sets the display brightness as a percentage (0-100)."""
    actual = brightness_controls.set_brightness(_percent(level))
    return f"Brightness set to {actual}%."


def set_wifi(enabled: bool) -> str:
    """Turns the Wi-Fi radio on or off."""
    on = _as_bool(enabled)
    if not network_controls.set_wifi_enabled(on):
        return "Windows did not allow the Wi-Fi change. Use Quick Settings instead."
    return "Wi-Fi turned on." if on else "Wi-Fi turned off."


def set_bluetooth(enabled: bool) -> str:
    """Turns the Bluetooth radio on or off."""
    on = _as_bool(enabled)
    if not network_controls.set_bluetooth_enabled(on):
        return "Windows did not allow the Bluetooth change. Use Quick Settings instead."
    return "Bluetooth turned on." if on else "Bluetooth turned off."


def get_system_tool_schemas() -> List[Dict[str, Any]]:
    """OpenAI/GGUF function schemas for the system tool group."""
    return [
        {
            "type": "function",
            "function": {
                "name": "get_system_stats",
                "description": (
                    "Report CPU, memory, disk, GPU, battery, volume, brightness, "
                    "Wi-Fi, Bluetooth, and uptime."
                ),
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "set_volume",
                "description": "Set the system output volume.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "level": {
                            "type": "integer",
                            "description": "Volume percentage, 0 to 100.",
                        }
                    },
                    "required": ["level"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "set_mute",
                "description": "Mute or unmute the system output.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "muted": {
                            "type": "boolean",
                            "description": "True to mute, false to unmute.",
                        }
                    },
                    "required": ["muted"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "set_brightness",
                "description": "Set the display brightness.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "level": {
                            "type": "integer",
                            "description": "Brightness percentage, 0 to 100.",
                        }
                    },
                    "required": ["level"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "set_wifi",
                "description": "Turn the Wi-Fi radio on or off.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "enabled": {
                            "type": "boolean",
                            "description": "True to turn Wi-Fi on, false to turn it off.",
                        }
                    },
                    "required": ["enabled"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "set_bluetooth",
                "description": "Turn the Bluetooth radio on or off.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "enabled": {
                            "type": "boolean",
                            "description": "True to turn Bluetooth on, false to turn it off.",
                        }
                    },
                    "required": ["enabled"],
                },
            },
        },
    ]
