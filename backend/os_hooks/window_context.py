"""
Aether Window Context Scraper
Two-tier context capture designed for small/local models:
1. Temporarily saves clipboard, simulates Ctrl+C, checks for highlighted text.
2. If nothing is selected, scrapes visible text controls from foreground window via pywinauto UIA.

The UIA walk runs on a short-lived daemon thread because some Electron/Chromium
windows can block a UI Automation call indefinitely. A stuck scrape must never
leave the voice pill waiting on "Thinking...".
"""

import logging
import threading
import time
from typing import Any, Dict, List, Optional

import keyboard
import pyperclip
import win32gui
from pywinauto import Desktop

logger = logging.getLogger("aether.window_context")

# Long enough for a normal UIA walk, short enough that a hung call is invisible
# to the user. The voice pipeline falls back to the window title.
UIA_TIMEOUT_S = 2.0
MAX_UIA_CHARS = 3500

_uia_lock = threading.Lock()
_uia_thread: Optional[threading.Thread] = None


def _scrape_uia_text(hwnd: int) -> List[str]:
    """Walks the foreground window's UIA tree and returns unique text snippets."""
    win = Desktop(backend="uia").window(handle=hwnd)
    texts: List[str] = []
    total = 0
    for elem in win.descendants():
        try:
            txt = elem.window_text().strip()
            if txt and len(txt) > 3 and txt not in texts:
                texts.append(txt)
                total += len(txt)
            if total > MAX_UIA_CHARS:
                break
        except Exception:
            continue
    return texts


def _collect_uia_text(hwnd: int, timeout: Optional[float] = None) -> List[str]:
    """
    Runs the UIA walk off-thread and gives up after ``timeout`` seconds.

    A previous stuck walk is never joined again; while it is still alive we skip
    UIA entirely so repeated voice queries cannot pile up blocked threads.
    """
    global _uia_thread
    if timeout is None:
        timeout = UIA_TIMEOUT_S

    with _uia_lock:
        if _uia_thread is not None and _uia_thread.is_alive():
            return []
        result: Dict[str, List[str]] = {}

        def run() -> None:
            try:
                result["texts"] = _scrape_uia_text(hwnd)
            except Exception:
                result["texts"] = []

        thread = threading.Thread(target=run, name="aether-uia-scrape", daemon=True)
        _uia_thread = thread
        thread.start()

    thread.join(timeout)
    if thread.is_alive():
        logger.warning(
            "Active-window text scrape exceeded %.1fs; using the title only.",
            timeout,
        )
        return []

    with _uia_lock:
        if _uia_thread is thread:
            _uia_thread = None
    return result.get("texts", [])


def get_active_window_context() -> Dict[str, Any]:
    """
    Captures text context from the currently focused window:
    - Tier 1: User's highlighted selection (up to 4,000 characters).
    - Tier 2: UIA window element tree (up to 3,500 characters).
    - Fallback: Window title only.
    """
    hwnd = win32gui.GetForegroundWindow()
    window_title = win32gui.GetWindowText(hwnd).strip()

    if not hwnd or not window_title:
        return {"window_title": "Desktop / Unknown", "mode": "none", "content": ""}

    # Tier 1: Check for highlighted text
    old_clip = ""
    try:
        old_clip = pyperclip.paste()
    except Exception:
        pass

    try:
        pyperclip.copy("")
        keyboard.send("ctrl+c")
        time.sleep(0.06)
        selected_text = pyperclip.paste().strip()
    except Exception:
        selected_text = ""
    finally:
        # Restore user's previous clipboard content
        try:
            if old_clip:
                pyperclip.copy(old_clip)
        except Exception:
            pass

    if selected_text:
        return {
            "window_title": window_title,
            "mode": "selection",
            "content": selected_text[:4000]
        }

    # Tier 2: Scrape visible UI elements via pywinauto UIA backend.
    # The timeout is mandatory: a blocked COM call must not stall voice input.
    texts = _collect_uia_text(hwnd)
    if texts:
        return {
            "window_title": window_title,
            "mode": "window_tree",
            "content": "\n".join(texts)[:MAX_UIA_CHARS]
        }

    return {
        "window_title": window_title,
        "mode": "title_only",
        "content": ""
    }
