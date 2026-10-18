"""
Aether System Controls & Telemetry Poller
Reads CPU/RAM/VRAM stats, controls master volume via pycaw,
simulates hardware media keys, and changes Windows desktop wallpaper.
"""

import ctypes
from typing import Any, Dict
import psutil
import win32api
import win32con
from comtypes import CLSCTX_ALL
from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume

VK_MEDIA_NEXT_TRACK = 0xB0
VK_MEDIA_PREV_TRACK = 0xB1
VK_MEDIA_PLAY_PAUSE = 0xB3


def get_system_telemetry() -> Dict[str, Any]:
    """Returns live CPU %, RAM %, Disk %, and VRAM telemetry."""
    vmem = psutil.virtual_memory()
    disk = psutil.disk_usage("C:")

    telemetry: Dict[str, Any] = {
        "cpu_percent": round(psutil.cpu_percent(interval=None), 1),
        "ram_percent": round(vmem.percent, 1),
        "ram_used_gb": round(vmem.used / (1024 ** 3), 2),
        "ram_total_gb": round(vmem.total / (1024 ** 3), 2),
        "disk_percent": round(disk.percent, 1),
        "gpu_vram_gb": None,
    }

    # Attempt to read NVIDIA GPU VRAM if pynvml is present
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


def _get_audio_endpoint():
    """Helper to get pycaw IAudioEndpointVolume interface."""
    speakers = AudioUtilities.GetSpeakers()
    if hasattr(speakers, "EndpointVolume"):
        return speakers.EndpointVolume
    interface = speakers.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
    return interface.QueryInterface(IAudioEndpointVolume)


def get_master_volume() -> float:
    """Returns scalar master volume level between 0.0 and 1.0."""
    try:
        vol = _get_audio_endpoint()
        return round(float(vol.GetMasterVolumeLevelScalar()), 2)
    except Exception:
        return 0.5


def set_master_volume(level: float) -> float:
    """Sets scalar master volume level between 0.0 and 1.0."""
    clamped = max(0.0, min(1.0, float(level)))
    try:
        vol = _get_audio_endpoint()
        vol.SetMasterVolumeLevelScalar(clamped, None)
        return clamped
    except Exception:
        return clamped


def get_mute_state() -> bool:
    """Returns whether audio output is currently muted."""
    try:
        vol = _get_audio_endpoint()
        return bool(vol.GetMute())
    except Exception:
        return False


def set_mute_state(muted: bool) -> bool:
    """Sets master audio mute state."""
    try:
        vol = _get_audio_endpoint()
        vol.SetMute(int(muted), None)
        return muted
    except Exception:
        return muted


def trigger_media_key(key_code: int) -> None:
    """Simulates hardware media key press (Play/Pause, Next, Prev)."""
    win32api.keybd_event(key_code, 0, 0, 0)
    win32api.keybd_event(key_code, 0, win32con.KEYEVENTF_KEYUP, 0)


def media_play_pause() -> None:
    """Toggles play/pause on Windows default media session."""
    trigger_media_key(VK_MEDIA_PLAY_PAUSE)


def media_next() -> None:
    """Skips to next track on Windows default media session."""
    trigger_media_key(VK_MEDIA_NEXT_TRACK)


def media_previous() -> None:
    """Skips to previous track on Windows default media session."""
    trigger_media_key(VK_MEDIA_PREV_TRACK)


def set_desktop_wallpaper(image_path: str) -> bool:
    """Sets Windows desktop wallpaper using user32 SystemParametersInfoW."""
    try:
        # SPI_SETDESKWALLPAPER = 20, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE = 3
        res = ctypes.windll.user32.SystemParametersInfoW(20, 0, str(image_path), 3)
        return bool(res)
    except Exception:
        return False
