"""
Per-app aggregation for the Stats card.

The process snapshot groups every image name (a browser with thirty children is
one line). The same snapshot feeds three rankings: working set, dedicated VRAM,
and CPU. CPU is a total-machine percentage, measured from the kernel's
cumulative process times, so it matches Task Manager rather than psutil's
"one core equals 100%" convention.
"""

from __future__ import annotations

from typing import Any, Dict, List, Mapping, Sequence, Tuple

ProcessEntry = Tuple[str, int, int, int]  # name, working set, CPU 100 ns, PID

_MIB = 1024 ** 2
_CPU_TICKS_PER_SECOND = 10_000_000.0


def _display_name(image_name: str) -> str:
    return (image_name or "").removesuffix(".exe").strip()


def _top(grouped: Mapping[str, Dict[str, Any]], key: str, limit: int) -> List[Dict[str, Any]]:
    apps = sorted(grouped.values(), key=lambda app: app[key], reverse=True)
    return [
        {
            "name": app["name"],
            key: round(app[key], 1),
            "processes": app["processes"],
        }
        for app in apps[: max(1, limit)]
    ]


def group_ram(entries: Sequence[ProcessEntry], limit: int) -> List[Dict[str, Any]]:
    """Aggregates working-set bytes by image name, largest first."""
    grouped: Dict[str, Dict[str, Any]] = {}
    for image_name, working_set, _cpu, _pid in entries:
        name = _display_name(image_name)
        if not name:
            continue
        entry = grouped.setdefault(
            name.lower(), {"name": name, "ram_mb": 0.0, "processes": 0}
        )
        entry["ram_mb"] += working_set / _MIB
        entry["processes"] += 1
    return _top(grouped, "ram_mb", limit)


def group_vram(
    entries: Sequence[ProcessEntry],
    vram_bytes: Mapping[int, int],
    limit: int,
) -> List[Dict[str, Any]]:
    """Aggregates dedicated VRAM by image name, largest first."""
    grouped: Dict[str, Dict[str, Any]] = {}
    for image_name, _working_set, _cpu, pid in entries:
        amount = vram_bytes.get(pid, 0)
        if amount <= 0:
            continue
        name = _display_name(image_name)
        if not name:
            continue
        entry = grouped.setdefault(
            name.lower(), {"name": name, "vram_mb": 0.0, "processes": 0}
        )
        entry["vram_mb"] += amount / _MIB
        entry["processes"] += 1
    return _top(grouped, "vram_mb", limit)


def group_cpu(
    entries: Sequence[ProcessEntry],
    previous: Mapping[int, int],
    elapsed: float,
    threads: int,
    limit: int,
) -> List[Dict[str, Any]]:
    """Aggregates CPU time deltas by image name as a percent of all cores."""
    if elapsed <= 0 or threads <= 0:
        return []

    grouped: Dict[str, Dict[str, Any]] = {}
    for image_name, _working_set, cpu_time, pid in entries:
        name = _display_name(image_name)
        if not name:
            continue
        key = name.lower()
        entry = grouped.setdefault(
            key, {"name": name, "cpu_percent": 0.0, "processes": 0}
        )
        entry["processes"] += 1

        before = previous.get(pid)
        if before is None or cpu_time <= before:
            continue
        seconds = (cpu_time - before) / _CPU_TICKS_PER_SECOND
        entry["cpu_percent"] += seconds / elapsed / threads * 100.0

    busy = {key: app for key, app in grouped.items() if app["cpu_percent"] >= 0.05}
    return _top(busy, "cpu_percent", limit)
