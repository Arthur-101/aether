"""
Aether Window Context Scraper
Two-tier context capture designed for small/local models:
1. Temporarily saves clipboard, simulates Ctrl+C, checks for highlighted text.
2. If nothing is selected, scrapes visible text controls from foreground window via pywinauto UIA.
"""

import time
from typing import Any, Dict
import keyboard
import pyperclip
import win32gui
from pywinauto import Desktop


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

    # Tier 2: Scrape visible UI elements via pywinauto UIA backend
    try:
        win = Desktop(backend="uia").window(handle=hwnd)
        texts = []
        for elem in win.descendants():
            try:
                txt = elem.window_text().strip()
                if txt and len(txt) > 3 and txt not in texts:
                    texts.append(txt)
                if sum(len(t) for t in texts) > 3500:
                    break
            except Exception:
                continue

        if texts:
            return {
                "window_title": window_title,
                "mode": "window_tree",
                "content": "\n".join(texts)[:3500]
            }
    except Exception:
        pass

    return {
        "window_title": window_title,
        "mode": "title_only",
        "content": ""
    }
