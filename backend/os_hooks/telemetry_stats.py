"""
Extended telemetry for the Stats tab.

The base snapshot in ``system_controls`` runs every two seconds. This module
adds the values that need their own sampling window, or that are too slow to
repeat on every tick: GPU load, disk and network throughput, uptime, and the
apps holding the most RAM.

Every function here is safe to call from an executor thread. The only shared
state is the previous counter sample (for rates) and a short-lived cache of
the app list, both guarded by their own lock.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Dict, List, Optional

import psutil

_SAMPLE_LOCK = threading.Lock()
_previous: Dict[str, Any] = {"time": None, "disk": None, "net": None}

_APPS_LOCK = threading.Lock()
_APPS_TTL = 5.0
_apps_cache: Dict[str, Any] = {"time": 0.0, "apps": []}

_GPU_LOCK = threading.Lock()
_GPU_RETRY_SECONDS = 60.0
_gpu_ready = False
_gpu_failed_at: Optional[float] = None


def _gpu_stats() -> Dict[str, Any]:
    """Returns NVML utilisation, VRAM, temperature, and the adapter name."""
    global _gpu_ready, _gpu_failed_at

    stats: Dict[str, Any] = {
        "gpu_percent": None,
        "gpu_name": None,
        "gpu_vram_gb": None,
        "gpu_vram_used_gb": None,
        "gpu_vram_total_gb": None,
        "gpu_temp_c": None,
    }

    with _GPU_LOCK:
        now = time.monotonic()
        if _gpu_failed_at is not None and now - _gpu_failed_at < _GPU_RETRY_SECONDS:
            return stats
        try:
            import pynvml

            if not _gpu_ready:
                pynvml.nvmlInit()
                _gpu_ready = True
                _gpu_failed_at = None

            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            name = pynvml.nvmlDeviceGetName(handle)
            stats["gpu_name"] = name.decode() if isinstance(name, bytes) else str(name)

            memory = pynvml.nvmlDeviceGetMemoryInfo(handle)
            used = memory.used / (1024 ** 3)
            total = memory.total / (1024 ** 3)
            stats["gpu_vram_gb"] = round(used, 2)
            stats["gpu_vram_used_gb"] = round(used, 2)
            stats["gpu_vram_total_gb"] = round(total, 2)

            try:
                utilisation = pynvml.nvmlDeviceGetUtilizationRates(handle)
                stats["gpu_percent"] = float(utilisation.gpu)
            except Exception:
                pass

            try:
                temperature = pynvml.nvmlDeviceGetTemperature(
                    handle, pynvml.NVML_TEMPERATURE_GPU
                )
                stats["gpu_temp_c"] = float(temperature)
            except Exception:
                pass
        except Exception:
            # No NVIDIA adapter, a driver that refuses NVML, or a transient
            # startup failure. Retry later instead of disabling the gauge.
            _gpu_ready = False
            _gpu_failed_at = now

    return stats


def _rate(current: float, previous: Optional[float], elapsed: float) -> float:
    if previous is None or elapsed <= 0:
        return 0.0
    return max(0.0, (current - previous) / elapsed)


def _io_rates() -> Dict[str, float]:
    """Disk and network throughput, measured against the previous sample."""
    now = time.monotonic()
    disk = psutil.disk_io_counters()
    net = psutil.net_io_counters()

    rates = {
        "disk_read_mbps": 0.0,
        "disk_write_mbps": 0.0,
        "net_down_mbps": 0.0,
        "net_up_mbps": 0.0,
    }

    with _SAMPLE_LOCK:
        previous = dict(_previous)
        elapsed = (now - previous["time"]) if previous["time"] else 0.0
        if previous["disk"] is not None and previous["net"] is not None and elapsed > 0:
            rates["disk_read_mbps"] = round(
                _rate(disk.read_bytes, previous["disk"].read_bytes, elapsed)
                / (1024 ** 2),
                2,
            )
            rates["disk_write_mbps"] = round(
                _rate(disk.write_bytes, previous["disk"].write_bytes, elapsed)
                / (1024 ** 2),
                2,
            )
            # Network reads as Mb/s (megabits) because that is how links are sold.
            rates["net_down_mbps"] = round(
                _rate(net.bytes_recv, previous["net"].bytes_recv, elapsed)
                * 8
                / (1024 ** 2),
                2,
            )
            rates["net_up_mbps"] = round(
                _rate(net.bytes_sent, previous["net"].bytes_sent, elapsed)
                * 8
                / (1024 ** 2),
                2,
            )
        _previous["time"] = now
        _previous["disk"] = disk
        _previous["net"] = net

    return rates


def get_top_apps(limit: int = 7) -> List[Dict[str, Any]]:
    """Aggregates processes by name so a multi-process browser counts once."""
    now = time.monotonic()
    with _APPS_LOCK:
        if now - _apps_cache["time"] < _APPS_TTL:
            return list(_apps_cache["apps"])

    grouped: Dict[str, Dict[str, Any]] = {}
    for process in psutil.process_iter(["name", "memory_info"]):
        try:
            info = process.info
            memory = info.get("memory_info")
            if memory is None:
                continue
            name = (info.get("name") or "Unknown").removesuffix(".exe")
            key = name.lower()
            entry = grouped.setdefault(
                key, {"name": name, "ram_mb": 0.0, "processes": 0}
            )
            entry["ram_mb"] += memory.rss / (1024 ** 2)
            entry["processes"] += 1
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

    apps = sorted(grouped.values(), key=lambda app: app["ram_mb"], reverse=True)
    apps = [
        {
            "name": app["name"],
            "ram_mb": round(app["ram_mb"], 1),
            "processes": app["processes"],
        }
        for app in apps[: max(1, limit)]
    ]

    with _APPS_LOCK:
        _apps_cache["time"] = now
        _apps_cache["apps"] = apps

    return list(apps)


def get_uptime_seconds() -> int:
    return int(max(0.0, time.time() - psutil.boot_time()))


def collect_stats_extras(disk: Any = None) -> Dict[str, Any]:
    """Values merged into the regular SYSTEM_STATS snapshot."""
    disk = disk or psutil.disk_usage("C:")
    extras: Dict[str, Any] = {
        "disk_used_gb": round(disk.used / (1024 ** 3), 1),
        "disk_total_gb": round(disk.total / (1024 ** 3), 1),
        "uptime_seconds": get_uptime_seconds(),
        "top_apps": get_top_apps(),
        "cpu_cores": psutil.cpu_count(logical=False),
        "cpu_threads": psutil.cpu_count(logical=True),
    }
    extras.update(_gpu_stats())
    extras.update(_io_rates())
    return extras
