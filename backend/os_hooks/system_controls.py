"""
Aether System Controls & Telemetry Poller
Real Windows controls: pycaw volume, winsdk Wi-Fi/Bluetooth radios, registry
dark mode, psutil telemetry, pynvml VRAM, media keys, and wallpaper.
"""

import ctypes
import winreg
from typing import Any, Dict, Optional
import psutil
import win32api
import win32con
from comtypes import CLSCTX_ALL
from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
from .network_controls import (
    get_airplane_mode,
    get_bluetooth_device_name,
    get_bluetooth_enabled,
    get_hotspot_enabled,
    get_wifi_details,
    get_wifi_enabled,
    set_airplane_mode,
    set_bluetooth_enabled,
    set_hotspot_enabled,
    set_wifi_enabled,
)
from .brightness_controls import get_brightness, set_brightness

VK_MEDIA_NEXT_TRACK = 0xB0
VK_MEDIA_PREV_TRACK = 0xB1
VK_MEDIA_PLAY_PAUSE = 0xB3

_PERSONALIZE_KEY = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"


# ─── Dark Mode (registry + WM_SETTINGCHANGE) ────────────────────
def get_dark_mode() -> bool:
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _PERSONALIZE_KEY) as key:
            value, _ = winreg.QueryValueEx(key, "AppsUseLightTheme")
            return int(value) == 0
    except Exception:
        return True


def set_dark_mode(enabled: bool) -> bool:
    try:
        value = 0 if enabled else 1
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, _PERSONALIZE_KEY, 0, winreg.KEY_SET_VALUE
        ) as key:
            winreg.SetValueEx(key, "AppsUseLightTheme", 0, winreg.REG_DWORD, value)
            winreg.SetValueEx(key, "SystemUsesLightTheme", 0, winreg.REG_DWORD, value)
        ctypes.windll.user32.SendMessageTimeoutW(
            0xFFFF, 0x001A, 0, "ImmersiveColorSet", 0x0002, 5000, None
        )
        return True
    except Exception:
        return False


# ─── Telemetry ──────────────────────────────────────────────────
def get_system_telemetry() -> Dict[str, Any]:
    """Returns live CPU, RAM, disk, VRAM, volume, radio, and theme state."""
    vmem = psutil.virtual_memory()
    disk = psutil.disk_usage("C:")
    wifi = get_wifi_details()
    bluetooth = get_bluetooth_enabled()

    telemetry: Dict[str, Any] = {
        "cpu_percent": round(psutil.cpu_percent(interval=None), 1),
        "ram_percent": round(vmem.percent, 1),
        "ram_used_gb": round(vmem.used / (1024 ** 3), 2),
        "ram_total_gb": round(vmem.total / (1024 ** 3), 2),
        "disk_percent": round(disk.percent, 1),
        "gpu_vram_gb": None,
        "volume": get_master_volume(),
        "muted": get_mute_state(),
        "wifi": wifi["enabled"],
        "wifi_ssid": wifi["ssid"],
        "bluetooth": bluetooth,
        "bluetooth_device": get_bluetooth_device_name() if bluetooth else "",
        "airplane_mode": get_airplane_mode(),
        "hotspot": get_hotspot_enabled(),
        "brightness": get_brightness(),
        "dark_mode": get_dark_mode(),
    }

    try:
        import pynvml

        pynvml.nvmlInit()
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        info = pynvml.nvmlDeviceGetMemoryInfo(handle)
        telemetry["gpu_vram_gb"] = round(info.used / (1024 ** 3), 2)
        pynvml.nvmlShutdown()
    except Exception:
        pass

    return telemetry


# ─── Master Volume (pycaw) ──────────────────────────────────────
def _get_audio_endpoint():
    speakers = AudioUtilities.GetSpeakers()
    if hasattr(speakers, "EndpointVolume"):
        return speakers.EndpointVolume
    interface = speakers.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
    return interface.QueryInterface(IAudioEndpointVolume)


def get_master_volume() -> float:
    try:
        return round(float(_get_audio_endpoint().GetMasterVolumeLevelScalar()), 2)
    except Exception:
        return 0.5


def set_master_volume(level: float) -> float:
    clamped = max(0.0, min(1.0, float(level)))
    try:
        _get_audio_endpoint().SetMasterVolumeLevelScalar(clamped, None)
    except Exception:
        pass
    return clamped


def get_mute_state() -> bool:
    try:
        return bool(_get_audio_endpoint().GetMute())
    except Exception:
        return False


def set_mute_state(muted: bool) -> bool:
    try:
        _get_audio_endpoint().SetMute(int(muted), None)
    except Exception:
        pass
    return muted


# ─── Media keys & wallpaper ─────────────────────────────────────
def trigger_media_key(key_code: int) -> None:
    win32api.keybd_event(key_code, 0, 0, 0)
    win32api.keybd_event(key_code, 0, win32con.KEYEVENTF_KEYUP, 0)


def media_play_pause() -> None:
    trigger_media_key(VK_MEDIA_PLAY_PAUSE)


def media_next() -> None:
    trigger_media_key(VK_MEDIA_NEXT_TRACK)


def media_previous() -> None:
    trigger_media_key(VK_MEDIA_PREV_TRACK)


def set_desktop_wallpaper(image_path: str) -> bool:
    try:
        res = ctypes.windll.user32.SystemParametersInfoW(20, 0, str(image_path), 3)
        return bool(res)
    except Exception:
        return False
