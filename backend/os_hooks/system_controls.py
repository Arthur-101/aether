"""
Aether System Controls & Telemetry Poller
Real Windows controls: pycaw volume, winsdk Wi-Fi/Bluetooth radios, registry
dark mode, psutil telemetry, pynvml VRAM, media keys, and wallpaper.
"""

import ctypes
import threading
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
from .telemetry_stats import collect_stats_extras

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

    # GPU load, throughput, uptime, and the top RAM consumers live in their
    # own module because they keep sampling state and have their own cache.
    telemetry.update(collect_stats_extras(disk))

    return telemetry


# ─── Master Volume (pycaw) ──────────────────────────────────────
# COM is apartment bound and the daemon calls these helpers from asyncio's
# executor, so every worker thread has to initialise COM for itself.
#
# The default endpoint is resolved on each call rather than cached. The
# default device changes whenever something is plugged in or the user picks
# another output, and a cached endpoint then reads one device's volume
# while the setter writes another's. That is what makes a slider fight
# itself: the value is set on the new device and reported from the old one.
_audio_local = threading.local()


def _ensure_com() -> None:
    """Initialises COM for the calling thread, once."""
    if getattr(_audio_local, "com_ready", False):
        return
    try:
        import comtypes

        comtypes.CoInitializeEx(None, comtypes.COINIT_APARTMENTTHREADED)
    except Exception:
        try:
            import comtypes

            comtypes.CoInitialize()
        except Exception:
            pass
    _audio_local.com_ready = True


def _get_audio_endpoint():
    """Returns the master volume interface of the current default output."""
    _ensure_com()
    from comtypes import CLSCTX_INPROC_SERVER, CoCreateInstance
    from pycaw.api.mmdeviceapi import IMMDeviceEnumerator
    from pycaw.utils import CLSID_MMDeviceEnumerator
    from pycaw.pycaw import EDataFlow, ERole

    enumerator = CoCreateInstance(
        CLSID_MMDeviceEnumerator, IMMDeviceEnumerator, CLSCTX_INPROC_SERVER
    )
    device = enumerator.GetDefaultAudioEndpoint(
        EDataFlow.eRender.value, ERole.eMultimedia.value
    )
    interface = device.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
    return interface.QueryInterface(IAudioEndpointVolume)


def _reset_audio_endpoint() -> None:
    _audio_local.endpoint = None


def get_master_volume() -> float:
    try:
        return round(float(_get_audio_endpoint().GetMasterVolumeLevelScalar()), 2)
    except Exception:
        try:
            return round(float(_get_audio_endpoint().GetMasterVolumeLevelScalar()), 2)
        except Exception:
            logger.warning("Could not read the master volume", exc_info=True)
            return 0.5


def set_master_volume(level: float) -> float:
    clamped = max(0.0, min(1.0, float(level)))
    try:
        _get_audio_endpoint().SetMasterVolumeLevelScalar(clamped, None)
    except Exception:
        try:
            _get_audio_endpoint().SetMasterVolumeLevelScalar(clamped, None)
        except Exception:
            logger.warning("Could not set the master volume", exc_info=True)
    return clamped


def get_mute_state() -> bool:
    try:
        return bool(_get_audio_endpoint().GetMute())
    except Exception:
        try:
            return bool(_get_audio_endpoint().GetMute())
        except Exception:
            return False


def set_mute_state(muted: bool) -> bool:
    try:
        _get_audio_endpoint().SetMute(int(muted), None)
    except Exception:
        try:
            _get_audio_endpoint().SetMute(int(muted), None)
        except Exception:
            logger.warning("Could not change the mute state", exc_info=True)
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


def get_desktop_wallpaper() -> str:
    """Returns the current desktop wallpaper path, or an empty string."""
    try:
        buffer = ctypes.create_unicode_buffer(32768)
        res = ctypes.windll.user32.SystemParametersInfoW(
            0x0073, len(buffer), buffer, 0
        )
        return buffer.value if res else ""
    except Exception:
        return ""


def set_desktop_wallpaper(image_path: str) -> bool:
    try:
        res = ctypes.windll.user32.SystemParametersInfoW(20, 0, str(image_path), 3)
        return bool(res)
    except Exception:
        return False
