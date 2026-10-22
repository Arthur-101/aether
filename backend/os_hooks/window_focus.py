"""Foreground activation helpers for Windows.

Windows refuses ``SetForegroundWindow`` for a process that does not own the
current foreground window, which is always true for the Aether daemon. These
helpers escalate through the known workarounds so a click on a taskbar icon
really does bring that app to the front.
"""

from __future__ import annotations

import ctypes
import logging
from typing import Any

logger = logging.getLogger("aether.taskbar.focus")

_EXPLORER_CLASSES = {"CabinetWClass", "ExploreWClass"}


def focus_window(hwnd: int) -> bool:
    """Brings a window to the front. Returns True when it took the foreground."""
    try:
        import win32con
        import win32gui
    except ImportError:
        return False

    try:
        if win32gui.IsIconic(hwnd):
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.BringWindowToTop(hwnd)
    except Exception as exc:
        logger.debug("Window raise failed: %s", exc)
        return False

    # The refusal must not stop the fallbacks, so each attempt is guarded
    # on its own instead of sharing one try block.
    try:
        win32gui.SetForegroundWindow(hwnd)
        if win32gui.GetForegroundWindow() == hwnd:
            return True
    except Exception as exc:
        logger.debug("SetForegroundWindow refused: %s", exc)

    if _focus_via_thread_attach(hwnd):
        return True
    return _focus_via_alt_key(hwnd)


def _focus_via_thread_attach(hwnd: int) -> bool:
    """Activates a window by joining the foreground and target input queues."""
    try:
        import win32api
        import win32gui
        import win32process
    except ImportError:
        return False

    try:
        foreground = win32gui.GetForegroundWindow()
        foreground_thread, _ = win32process.GetWindowThreadProcessId(foreground)
        target_thread, _ = win32process.GetWindowThreadProcessId(hwnd)
        current_thread = win32api.GetCurrentThreadId()
        attached = []
        try:
            if foreground_thread and foreground_thread != current_thread:
                win32process.AttachThreadInput(current_thread, foreground_thread, True)
                attached.append(foreground_thread)
            if target_thread and target_thread not in attached:
                win32process.AttachThreadInput(current_thread, target_thread, True)
                attached.append(target_thread)
            win32gui.BringWindowToTop(hwnd)
            win32gui.SetForegroundWindow(hwnd)
            win32gui.SetActiveWindow(hwnd)
        finally:
            for thread in attached:
                try:
                    win32process.AttachThreadInput(current_thread, thread, False)
                except Exception:
                    pass
    except Exception as exc:
        logger.debug("Thread-attach focus failed: %s", exc)
        return False
    return win32gui.GetForegroundWindow() == hwnd


def _focus_via_alt_key(hwnd: int) -> bool:
    """Last resort: a synthetic ALT press grants foreground rights briefly."""
    try:
        import win32gui
    except ImportError:
        return False

    try:
        user32 = ctypes.WinDLL("user32")
        user32.keybd_event(0x12, 0, 0, 0)  # VK_MENU down
        try:
            win32gui.SetForegroundWindow(hwnd)
        finally:
            user32.keybd_event(0x12, 0, 0x0002, 0)  # VK_MENU up
    except Exception as exc:
        logger.debug("Alt-key focus failed: %s", exc)
        return False
    return win32gui.GetForegroundWindow() == hwnd


def explorer_windows() -> list[int]:
    """Visible File Explorer folder windows, topmost first."""
    try:
        import win32gui
    except ImportError:
        return []

    found: list[int] = []

    def visit(hwnd: int, _extra: Any) -> bool:
        try:
            if (
                win32gui.IsWindowVisible(hwnd)
                and win32gui.GetClassName(hwnd) in _EXPLORER_CLASSES
            ):
                found.append(hwnd)
        except Exception:
            pass
        return True

    try:
        win32gui.EnumWindows(visit, None)
    except Exception:
        return []
    return found


def window_handles() -> set[int]:
    """Snapshot of current top-level window handles."""
    try:
        import win32gui
    except ImportError:
        return set()

    handles: set[int] = set()

    def visit(hwnd: int, _extra: Any) -> bool:
        handles.add(hwnd)
        return True

    try:
        win32gui.EnumWindows(visit, None)
    except Exception:
        return set()
    return handles


def new_window_handles(before: set[int]) -> list[int]:
    """Top-level windows that appeared since a snapshot was taken."""
    try:
        import win32gui
    except ImportError:
        return []

    found: list[int] = []

    def visit(hwnd: int, _extra: Any) -> bool:
        try:
            if hwnd in before or not win32gui.IsWindowVisible(hwnd):
                return True
            if not win32gui.GetWindowText(hwnd).strip():
                return True
            found.append(hwnd)
        except Exception:
            pass
        return True

    try:
        win32gui.EnumWindows(visit, None)
    except Exception:
        return []
    return found


__all__ = [
    "explorer_windows",
    "focus_window",
    "new_window_handles",
    "window_handles",
]
