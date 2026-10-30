"""Launch and focus Windows apps from the taskbar allow-list.

The model may name an app ("Spotify", "VS Code") or pass an exact path, but
only apps already present in the taskbar deck can be launched. The deck is the
same source the dock and Settings use: Windows pins, custom pins, and currently
open taskbar windows. A prompt-injected or hallucinated path therefore cannot
start an arbitrary executable. Because that allow-list is the safety boundary,
the first three launches in a rolling minute run without an approval card; the
fourth pauses for one so a model loop cannot keep opening windows.
"""

from __future__ import annotations

import os
import re
import threading
import time
from collections import deque
from typing import Any, Deque, Dict, Iterable, List, Optional, Tuple

from ..os_hooks.taskbar_launch import launch_entry, normalize_path
from ..os_hooks.taskbar_state import build_taskbar_state
from ..os_hooks.window_apps import matching_windows, window_snapshot
from ..os_hooks.window_focus import focus_window as bring_window_to_front
from .tool_permissions import register_approval_check

_EXTENSION = re.compile(r"\.(?:exe|lnk|url)$", re.IGNORECASE)
_WORD_BREAK = re.compile(r"[^\w]+", re.UNICODE)
_NO_APPS_MESSAGE = (
    "No taskbar apps are available. Pin apps in Windows or add them in "
    "Settings → Appearance → Taskbar dock."
)
_ALLOW_LIST_MESSAGE = (
    "For safety, Aether only launches apps from your taskbar deck. Pin that "
    "app in Windows or add it in Settings → Appearance → Taskbar dock."
)
_LAUNCH_LIMIT = 3
_LAUNCH_WINDOW_SECONDS = 60.0
_launch_guard_lock = threading.Lock()
_launch_times: Deque[float] = deque()


def reset_launch_guard() -> None:
    """Clears the rolling launch guard (used by tests and after a restart)."""
    with _launch_guard_lock:
        _launch_times.clear()


def _record_launch() -> None:
    """Counts one successful launch in the rolling minute."""
    now = time.monotonic()
    with _launch_guard_lock:
        while _launch_times and now - _launch_times[0] >= _LAUNCH_WINDOW_SECONDS:
            _launch_times.popleft()
        _launch_times.append(now)


def _launch_count() -> int:
    """Successful launches still inside the rolling minute."""
    now = time.monotonic()
    with _launch_guard_lock:
        while _launch_times and now - _launch_times[0] >= _LAUNCH_WINDOW_SECONDS:
            _launch_times.popleft()
        return len(_launch_times)


def launch_needs_approval(_args: Optional[Dict[str, Any]] = None) -> bool:
    """Asks before a launch once three already happened this minute."""
    return _launch_count() >= _LAUNCH_LIMIT


register_approval_check("launch_app", launch_needs_approval)


def _normalize(value: Any) -> str:
    """Lowercase words with extensions and punctuation removed for matching."""
    text = str(value or "").strip().strip('"').strip("'")
    text = _EXTENSION.sub("", text)
    text = _WORD_BREAK.sub(" ", text)
    return " ".join(text.casefold().split())


def _looks_like_path(value: str) -> bool:
    return "\\" in value or "/" in value


def _basename(value: str) -> str:
    return re.split(r"[\\/]", value)[-1]


def _entry_keys(entry: Dict[str, Any]) -> List[str]:
    """Every user-facing name an app can be matched by."""
    keys: List[str] = []
    for field in ("name", "target_path", "path"):
        raw = str(entry.get(field) or "").strip()
        if not raw:
            continue
        keys.append(_normalize(raw))
        keys.append(_normalize(os.path.splitext(_basename(raw))[0]))
    return [key for key in dict.fromkeys(keys) if key]


def _initials_alias(key: str) -> str:
    """Joins a multi-word name into its common short form.

    "Visual Studio Code" becomes "vscode", so "VS Code" and "VSCode" both
    resolve without hardcoding an app-specific alias table.
    """
    tokens = key.split()
    if len(tokens) < 2:
        return ""
    return "".join(token[0] for token in tokens[:-1]) + tokens[-1]


def _matches_path(value: str, entry: Dict[str, Any]) -> bool:
    wanted = normalize_path(value)
    if not wanted:
        return False
    for field in ("target_path", "path"):
        candidate = str(entry.get(field) or "").strip()
        if candidate and normalize_path(candidate) == wanted:
            return True
    return False


def app_match_score(query: str, entry: Dict[str, Any]) -> int:
    """Scores how well an app entry matches a name or an allow-listed path."""
    raw = str(query or "").strip().strip('"').strip("'")
    if not raw:
        return 0
    if _looks_like_path(raw):
        return 120 if _matches_path(raw, entry) else 0

    wanted = _normalize(raw)
    if not wanted:
        return 0
    compact = wanted.replace(" ", "")
    best = 0
    for key in _entry_keys(entry):
        key_compact = key.replace(" ", "")
        if wanted == key:
            best = max(best, 100)
            continue
        if compact == key_compact:
            best = max(best, 96)
            continue
        alias = _initials_alias(key)
        if alias and (wanted == alias or compact == alias):
            best = max(best, 94)
            continue
        if key.startswith(wanted) or wanted.startswith(key):
            best = max(best, 82)
            continue
        if wanted in key or key in wanted:
            best = max(best, 66)
        tokens = wanted.split()
        key_tokens = key.split()
        if tokens and all(
            any(token == candidate or candidate.startswith(token) for candidate in key_tokens)
            for token in tokens
        ):
            best = max(best, 72)
    return best


def resolve_app(
    query: str, apps: Iterable[Dict[str, Any]]
) -> Tuple[Optional[Dict[str, Any]], str]:
    """Finds one allow-listed app, or returns a user-facing explanation."""
    raw = str(query or "").strip()
    if not raw:
        return None, "Tell me which app to open or switch to."
    entries = [app for app in apps if isinstance(app, dict)]
    if not entries:
        return None, _NO_APPS_MESSAGE

    scored = [
        (app_match_score(raw, entry), index, entry)
        for index, entry in enumerate(entries)
    ]
    scored = [item for item in scored if item[0] > 0]
    if not scored:
        if _looks_like_path(raw):
            return None, _ALLOW_LIST_MESSAGE
        return None, (
            f"I couldn't find '{raw}' in your taskbar apps. Pin it in Windows "
            "or add it in Settings → Appearance → Taskbar dock."
        )

    best_score = max(item[0] for item in scored)
    best = [item for item in scored if item[0] == best_score]
    names: List[str] = []
    for _score, _index, entry in best:
        name = str(entry.get("name") or entry.get("path") or "Unknown app").strip()
        if name and name not in names:
            names.append(name)
    if len(names) > 1:
        return None, (
            f"Multiple apps match '{raw}': {', '.join(names)}. "
            "Which one should I use?"
        )
    return best[0][2], ""


def _window_score(query: str, window: Dict[str, Any]) -> int:
    wanted = _normalize(query)
    if not wanted:
        return 0
    title = _normalize(window.get("title"))
    process = _normalize(
        os.path.splitext(
            _basename(str(window.get("process") or window.get("exe") or ""))
        )[0]
    )
    best = 0
    if title:
        if wanted == title:
            best = 100
        elif wanted in title:
            best = 84
        elif title in wanted:
            best = 76
        else:
            tokens = wanted.split()
            title_tokens = title.split()
            if tokens and all(
                any(token == candidate or candidate.startswith(token) for candidate in title_tokens)
                for token in tokens
            ):
                best = 70
    if process:
        if wanted == process:
            best = max(best, 90)
        elif wanted in process or process in wanted:
            best = max(best, 68)
    return best


def _best_window(
    query: str, windows: List[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    best: Optional[Dict[str, Any]] = None
    best_score = 0
    for window in windows:
        score = _window_score(query, window)
        if score > best_score:
            best = window
            best_score = score
    return best


def _focus_result(name: str, window: Dict[str, Any]) -> str:
    try:
        hwnd = int(window.get("hwnd") or 0)
    except (TypeError, ValueError):
        hwnd = 0
    if hwnd and bring_window_to_front(hwnd):
        return f"Brought {name} forward."
    return f"Windows did not let Aether focus {name}."


def launch_app(name_or_path: str) -> str:
    """Opens a taskbar app by name or exact allow-listed path."""
    query = str(name_or_path or "").strip()
    if not query:
        return "Tell me which app to open."
    try:
        state = build_taskbar_state(with_icons=False)
    except Exception:
        return "Aether couldn't read the taskbar app list right now. Try again."
    entry, problem = resolve_app(query, state.get("apps") or [])
    if entry is None:
        return problem

    name = str(entry.get("name") or query).strip() or query
    if entry.get("missing"):
        return (
            f"{name} is in your taskbar but its shortcut is missing. "
            "Re-pin it or add it in Settings → Appearance → Taskbar dock."
        )

    result = launch_entry(entry)
    if not result.get("ok"):
        return str(result.get("message") or f"Windows could not launch {name}.")
    _record_launch()
    if result.get("action") == "focused":
        return f"Brought {name} forward."
    return f"Opened {name}."


def focus_window(title: str) -> str:
    """Brings an open taskbar app or window to the front."""
    query = str(title or "").strip()
    if not query:
        return "Tell me which window to switch to."

    # A title is the most specific request, and matching it first avoids
    # confusing "Settings" with an app whose name merely starts that way.
    snapshot = window_snapshot()
    windows = [
        window
        for window in snapshot.get("windows") or []
        if isinstance(window, dict)
    ]
    window = _best_window(query, windows)
    if window is not None:
        name = str(window.get("title") or query).strip() or query
        return _focus_result(name, window)

    try:
        state = build_taskbar_state(with_icons=False)
    except Exception:
        state = {"apps": []}
    entry, _problem = resolve_app(query, state.get("apps") or [])
    if entry is None:
        return f"I couldn't find an open window matching '{query}'."

    name = str(entry.get("name") or query).strip() or query
    app_windows = matching_windows(
        str(entry.get("target_path") or ""),
        str(entry.get("app_id") or ""),
    )
    if not app_windows:
        return f"{name} isn't open. Use launch_app to open it."
    window = _best_window(query, app_windows) or app_windows[0]
    return _focus_result(name, window)


def get_app_tool_schemas() -> List[Dict[str, Any]]:
    """OpenAI/GGUF function schemas for launching and focusing apps."""
    return [
        {
            "type": "function",
            "function": {
                "name": "launch_app",
                "description": (
                    "Open an app from the user's taskbar deck (Windows pins, "
                    "custom pins, or an app that is already open). Use the app "
                    "name shown on the taskbar; arbitrary paths are rejected."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name_or_path": {
                            "type": "string",
                            "description": (
                                "Taskbar app name such as Spotify or Visual "
                                "Studio Code, or an exact path to a taskbar app."
                            ),
                        }
                    },
                    "required": ["name_or_path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "focus_window",
                "description": (
                    "Bring an open taskbar app or window to the front. Match by "
                    "app name or part of the window title."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": (
                                "App name or text from the window title, such "
                                "as Visual Studio Code or the invoice."
                            ),
                        }
                    },
                    "required": ["title"],
                },
            },
        },
    ]
