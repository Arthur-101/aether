"""
Fast process enumeration for the Stats tab.

Walking the process table with psutil opens a handle per process. On a busy
desktop (a few hundred processes) that takes seconds, and running it on the
telemetry tick made the whole machine hitch: the pointer visibly froze and then
jumped. ``NtQuerySystemInformation`` returns every process and its working set
in a single call, so the same numbers cost a few milliseconds.

The struct layout below is the 64-bit ``SYSTEM_PROCESS_INFORMATION`` layout; the
trailing counters are only present so the stride between entries is correct.
"""

from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
from typing import List, Tuple

_SYSTEM_PROCESS_INFORMATION = 5
_STATUS_INFO_LENGTH_MISMATCH = 0xC0000004
_INITIAL_BUFFER_BYTES = 1 << 20
_MAX_ATTEMPTS = 8


class _UnicodeString(ctypes.Structure):
    _fields_ = [
        ("Length", wt.USHORT),
        ("MaximumLength", wt.USHORT),
        ("Buffer", ctypes.c_void_p),
    ]


class _ProcessEntry(ctypes.Structure):
    _fields_ = [
        ("NextEntryOffset", wt.ULONG),
        ("NumberOfThreads", wt.ULONG),
        ("WorkingSetPrivateSize", ctypes.c_int64),
        ("HardFaultCount", wt.ULONG),
        ("NumberOfThreadsHighWatermark", wt.ULONG),
        ("CycleTime", ctypes.c_uint64),
        ("CreateTime", ctypes.c_int64),
        ("UserTime", ctypes.c_int64),
        ("KernelTime", ctypes.c_int64),
        ("ImageName", _UnicodeString),
        ("BasePriority", wt.LONG),
        ("UniqueProcessId", wt.HANDLE),
        ("InheritedFromUniqueProcessId", wt.HANDLE),
        ("HandleCount", wt.ULONG),
        ("SessionId", wt.ULONG),
        ("UniqueProcessKey", ctypes.c_void_p),
        ("PeakVirtualSize", ctypes.c_size_t),
        ("VirtualSize", ctypes.c_size_t),
        ("PageFaultCount", wt.ULONG),
        ("PeakWorkingSetSize", ctypes.c_size_t),
        ("WorkingSetSize", ctypes.c_size_t),
        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
        ("QuotaPagedPoolUsage", ctypes.c_size_t),
        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
        ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
        ("PagefileUsage", ctypes.c_size_t),
        ("PeakPagefileUsage", ctypes.c_size_t),
        ("PrivatePageCount", ctypes.c_size_t),
        ("ReadOperationCount", ctypes.c_int64),
        ("WriteOperationCount", ctypes.c_int64),
        ("OtherOperationCount", ctypes.c_int64),
        ("ReadTransferCount", ctypes.c_int64),
        ("WriteTransferCount", ctypes.c_int64),
        ("OtherTransferCount", ctypes.c_int64),
    ]


_ntdll = ctypes.WinDLL("ntdll")
_ntdll.NtQuerySystemInformation.restype = ctypes.c_long
_ntdll.NtQuerySystemInformation.argtypes = [
    wt.ULONG,
    ctypes.c_void_p,
    wt.ULONG,
    ctypes.POINTER(wt.ULONG),
]


def process_usage() -> List[Tuple[str, int, int, int]]:
    """Returns ``(image name, working set, CPU time, PID)`` per process.

    CPU time is in 100 ns units, the kernel's native unit, so callers can
    difference consecutive samples. Raises ``OSError`` if the kernel refuses
    the query, so callers can keep their previous sample instead of reporting
    an empty list.
    """
    size = _INITIAL_BUFFER_BYTES
    for _ in range(_MAX_ATTEMPTS):
        buffer = ctypes.create_string_buffer(size)
        needed = wt.ULONG(0)
        status = _ntdll.NtQuerySystemInformation(
            _SYSTEM_PROCESS_INFORMATION,
            buffer,
            size,
            ctypes.byref(needed),
        )
        if (status & 0xFFFFFFFF) == _STATUS_INFO_LENGTH_MISMATCH:
            size = max(needed.value + (1 << 16), size * 2)
            continue
        if status != 0:
            raise OSError(
                f"NtQuerySystemInformation failed: 0x{status & 0xFFFFFFFF:08X}"
            )

        entries: List[Tuple[str, int, int, int]] = []
        offset = 0
        while offset < size:
            entry = _ProcessEntry.from_buffer(buffer, offset)
            if entry.ImageName.Length and entry.ImageName.Buffer:
                name = ctypes.wstring_at(
                    entry.ImageName.Buffer, entry.ImageName.Length // 2
                )
            else:
                name = ""
            entries.append(
                (
                    name,
                    int(entry.WorkingSetSize),
                    int(entry.KernelTime) + int(entry.UserTime),
                    int(entry.UniqueProcessId or 0),
                )
            )
            if not entry.NextEntryOffset:
                break
            offset += entry.NextEntryOffset
        return entries

    raise OSError("process list did not fit in the query buffer")


def process_working_sets() -> List[Tuple[str, int]]:
    """Returns ``(image name, working set bytes)`` for every running process."""
    return [
        (name, working_set)
        for name, working_set, _cpu_time, _pid in process_usage()
    ]
