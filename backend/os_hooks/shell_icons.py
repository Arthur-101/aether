"""Windows shell icon extraction with an on-disk cache.

Taskbar pins are resolved once in a worker thread and cached as PNG data URIs
so the hover deck never performs shell work while the user is interacting.
"""

from __future__ import annotations

import base64
import ctypes
import hashlib
import io
import os
import threading
from ctypes import wintypes
from pathlib import Path
from typing import Dict, Optional

_ICON_SIZE = 32
_MEMORY: Dict[str, str] = {}
_MEMORY_LOCK = threading.Lock()


class _BitmapInfoHeader(ctypes.Structure):
    _fields_ = [
        ("biSize", wintypes.DWORD),
        ("biWidth", wintypes.LONG),
        ("biHeight", wintypes.LONG),
        ("biPlanes", wintypes.WORD),
        ("biBitCount", wintypes.WORD),
        ("biCompression", wintypes.DWORD),
        ("biSizeImage", wintypes.DWORD),
        ("biXPelsPerMeter", wintypes.LONG),
        ("biYPelsPerMeter", wintypes.LONG),
        ("biClrUsed", wintypes.DWORD),
        ("biClrImportant", wintypes.DWORD),
    ]


class _BitmapInfo(ctypes.Structure):
    _fields_ = [("bmiHeader", _BitmapInfoHeader), ("bmiColors", wintypes.DWORD * 3)]


class _ShellFileInfo(ctypes.Structure):
    _fields_ = [
        ("hIcon", wintypes.HANDLE),
        ("iIcon", ctypes.c_int),
        ("dwAttributes", wintypes.DWORD),
        ("szDisplayName", wintypes.WCHAR * 260),
        ("szTypeName", wintypes.WCHAR * 80),
    ]


def _cache_dir() -> Path:
    from ..config_manager import get_data_dir

    path = get_data_dir() / "taskbar_icons"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _api():
    shell32 = ctypes.windll.shell32
    shell32.SHGetFileInfoW.argtypes = [
        wintypes.LPCWSTR,
        wintypes.DWORD,
        ctypes.POINTER(_ShellFileInfo),
        wintypes.UINT,
        wintypes.UINT,
    ]
    shell32.SHGetFileInfoW.restype = ctypes.c_void_p
    shell32.ExtractIconExW.argtypes = [
        wintypes.LPCWSTR,
        ctypes.c_int,
        ctypes.POINTER(wintypes.HICON),
        ctypes.POINTER(wintypes.HICON),
        wintypes.UINT,
    ]
    shell32.ExtractIconExW.restype = wintypes.UINT

    user32 = ctypes.windll.user32
    user32.GetDC.restype = wintypes.HDC
    user32.GetDC.argtypes = [wintypes.HWND]
    user32.ReleaseDC.argtypes = [wintypes.HWND, wintypes.HDC]
    user32.DrawIconEx.argtypes = [
        wintypes.HDC,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.HICON,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.UINT,
        wintypes.HBRUSH,
        wintypes.UINT,
    ]
    user32.DrawIconEx.restype = wintypes.BOOL
    user32.DestroyIcon.argtypes = [wintypes.HICON]

    gdi32 = ctypes.windll.gdi32
    gdi32.CreateCompatibleDC.restype = wintypes.HDC
    gdi32.CreateCompatibleDC.argtypes = [wintypes.HDC]
    gdi32.CreateDIBSection.restype = wintypes.HBITMAP
    gdi32.CreateDIBSection.argtypes = [
        wintypes.HDC,
        ctypes.POINTER(_BitmapInfo),
        wintypes.UINT,
        ctypes.POINTER(ctypes.c_void_p),
        wintypes.HANDLE,
        wintypes.DWORD,
    ]
    gdi32.SelectObject.restype = wintypes.HGDIOBJ
    gdi32.SelectObject.argtypes = [wintypes.HDC, wintypes.HGDIOBJ]
    gdi32.DeleteObject.argtypes = [wintypes.HGDIOBJ]
    gdi32.DeleteDC.argtypes = [wintypes.HDC]
    return shell32, user32, gdi32


def _hicon_png(hicon: int) -> Optional[bytes]:
    """Renders an HICON into a transparent 32-bit PNG."""
    try:
        from PIL import Image
    except ImportError:
        return None

    shell32, user32, gdi32 = _api()
    screen = dc = bitmap = old = None
    try:
        screen = user32.GetDC(None)
        dc = gdi32.CreateCompatibleDC(screen)
        info = _BitmapInfo()
        info.bmiHeader.biSize = ctypes.sizeof(_BitmapInfoHeader)
        info.bmiHeader.biWidth = _ICON_SIZE
        info.bmiHeader.biHeight = -_ICON_SIZE
        info.bmiHeader.biPlanes = 1
        info.bmiHeader.biBitCount = 32
        bits = ctypes.c_void_p()
        bitmap = gdi32.CreateDIBSection(
            dc, ctypes.byref(info), 0, ctypes.byref(bits), None, 0
        )
        if not bitmap or not bits:
            return None
        old = gdi32.SelectObject(dc, bitmap)
        ctypes.memset(bits, 0, _ICON_SIZE * _ICON_SIZE * 4)
        # DI_NORMAL: draw both the AND mask and the XOR image.
        if not user32.DrawIconEx(
            dc, 0, 0, hicon, _ICON_SIZE, _ICON_SIZE, 0, None, 0x0003
        ):
            return None
        raw = ctypes.string_at(bits, _ICON_SIZE * _ICON_SIZE * 4)
        image = Image.frombuffer(
            "RGBA", (_ICON_SIZE, _ICON_SIZE), raw, "raw", "BGRA", 0, 1
        )
        output = io.BytesIO()
        image.save(output, "PNG", optimize=True)
        return output.getvalue()
    except Exception:
        return None
    finally:
        try:
            if dc and old:
                gdi32.SelectObject(dc, old)
            if bitmap:
                gdi32.DeleteObject(bitmap)
            if dc:
                gdi32.DeleteDC(dc)
            if screen:
                user32.ReleaseDC(None, screen)
        except Exception:
            pass


def _extract_png(source: str, index: int) -> Optional[bytes]:
    shell32, user32, _gdi32 = _api()
    large = wintypes.HICON()
    small = wintypes.HICON()
    count = shell32.ExtractIconExW(
        source, int(index), ctypes.byref(large), ctypes.byref(small), 1
    )
    for handle in (large.value, small.value):
        if not handle:
            continue
        try:
            if count:
                return _hicon_png(handle)
        finally:
            user32.DestroyIcon(handle)
    if count:
        return None

    info = _ShellFileInfo()
    result = shell32.SHGetFileInfoW(
        source,
        0,
        ctypes.byref(info),
        ctypes.sizeof(info),
        0x000000100,  # SHGFI_ICON
    )
    if not result or not info.hIcon:
        return None
    try:
        return _hicon_png(info.hIcon)
    finally:
        user32.DestroyIcon(info.hIcon)


def icon_data_uri(source: str, index: int = 0) -> Optional[str]:
    """Returns a cached image/png data URI for a shell icon source."""
    raw = (source or "").strip().strip('"')
    if not raw:
        return None
    expanded = os.path.expandvars(raw)
    path = Path(expanded)
    if not path.exists():
        return None

    try:
        stamp = path.stat().st_mtime_ns
    except OSError:
        return None
    key = hashlib.sha1(
        f"{os.path.normcase(str(path.resolve()))}|{index}|{stamp}".encode("utf-8")
    ).hexdigest()
    with _MEMORY_LOCK:
        cached = _MEMORY.get(key)
    if cached:
        return cached

    cache_file = _cache_dir() / f"{key}.png"
    if cache_file.exists():
        try:
            payload = cache_file.read_bytes()
            uri = "data:image/png;base64," + base64.b64encode(payload).decode("ascii")
            with _MEMORY_LOCK:
                _MEMORY[key] = uri
            return uri
        except OSError:
            pass

    payload = _extract_png(str(path), index)
    if not payload:
        return None
    try:
        cache_file.write_bytes(payload)
    except OSError:
        pass
    uri = "data:image/png;base64," + base64.b64encode(payload).decode("ascii")
    with _MEMORY_LOCK:
        _MEMORY[key] = uri
    return uri
