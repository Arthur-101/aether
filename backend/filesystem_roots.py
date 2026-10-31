"""Allowed-root resolution for the file-system tools.

A root grants its whole subtree. The three known folders are always available;
the user can add more in Settings -> Tools -> File System. Paths that would
expose credentials or system binaries are rejected even when added explicitly.
"""

from __future__ import annotations

import ctypes
import os
import uuid
from ctypes import wintypes
from pathlib import Path
from typing import Any, Iterable, List, Optional

MAX_EXTRA_ROOTS = 10

# Windows Known Folder ids. Using the shell API honours OneDrive redirects and
# moved user folders instead of assuming %USERPROFILE%\\Desktop exists.
_FOLDERID_DESKTOP = "B4BFCC3A-DB2C-424C-B029-7FE99A87C641"
_FOLDERID_DOWNLOADS = "374DE290-123F-4565-9164-39C4925E467B"
_FOLDERID_DOCUMENTS = "FDD39AD0-238F-46AF-ADB4-6C85480369C7"

_DEFAULT_FOLDER_IDS = (
    ("Desktop", _FOLDERID_DESKTOP),
    ("Downloads", _FOLDERID_DOWNLOADS),
    ("Documents", _FOLDERID_DOCUMENTS),
)


class _GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", wintypes.DWORD),
        ("Data2", wintypes.WORD),
        ("Data3", wintypes.WORD),
        ("Data4", ctypes.c_ubyte * 8),
    ]


def _guid(value: str) -> _GUID:
    parsed = uuid.UUID(value)
    return _GUID(
        parsed.time_low,
        parsed.time_mid,
        parsed.time_hi_version,
        (ctypes.c_ubyte * 8)(*parsed.bytes[8:]),
    )


def _known_folder(folder_id: str) -> Optional[Path]:
    """Returns a Windows Known Folder path, or None when it is unavailable."""
    if os.name != "nt":
        return None
    try:
        shell32 = ctypes.windll.shell32
        ole32 = ctypes.windll.ole32
        shell32.SHGetKnownFolderPath.argtypes = [
            ctypes.POINTER(_GUID),
            wintypes.DWORD,
            wintypes.HANDLE,
            ctypes.POINTER(ctypes.c_wchar_p),
        ]
        shell32.SHGetKnownFolderPath.restype = ctypes.c_long
        ole32.CoTaskMemFree.argtypes = [ctypes.c_void_p]
        pointer = ctypes.c_wchar_p()
        result = shell32.SHGetKnownFolderPath(
            ctypes.byref(_guid(folder_id)), 0, None, ctypes.byref(pointer)
        )
        if result != 0 or not pointer.value:
            return None
        try:
            return Path(pointer.value)
        finally:
            ole32.CoTaskMemFree(ctypes.cast(pointer, ctypes.c_void_p))
    except Exception:
        return None


def default_roots() -> List[Path]:
    """Returns the three default roots that currently exist, de-duplicated."""
    roots: List[Path] = []
    home = Path.home()
    for label, folder_id in _DEFAULT_FOLDER_IDS:
        candidate = _known_folder(folder_id)
        if candidate is None:
            candidate = home / label
        if candidate.is_dir():
            roots.append(_safe_resolve(candidate))
    return _dedupe(roots)


def _safe_resolve(path: Path) -> Path:
    try:
        return path.expanduser().resolve(strict=False)
    except OSError:
        return Path(os.path.abspath(str(path)))


def _is_drive_root(path: Path) -> bool:
    try:
        return path.parent == path
    except OSError:
        return False


def _protected_paths() -> List[Path]:
    """System paths whose contents must never be reachable through a root.

    The profile root itself is protected, but its ordinary child folders
    (Desktop, Documents, Downloads) are the defaults and stay allowed.
    """
    home = _safe_resolve(Path.home())
    candidates: List[Path] = [
        home / "AppData",
        home / "AppData" / "Local",
        home / "AppData" / "Roaming",
    ]
    for env_name in ("APPDATA", "LOCALAPPDATA", "WINDIR", "SystemRoot",
                     "ProgramFiles", "ProgramFiles(x86)", "ProgramData"):
        raw = os.environ.get(env_name)
        if raw:
            candidates.append(Path(os.path.expandvars(raw)))
    return _dedupe([_safe_resolve(path) for path in candidates if str(path)])


def _norm(value: Path | str) -> str:
    return os.path.normcase(os.path.abspath(str(value)))


def _contains(parent: Path, child: Path) -> bool:
    """True when child is inside parent (or is parent), case-insensitively."""
    parent_norm = _norm(parent)
    child_norm = _norm(child)
    try:
        return os.path.commonpath([parent_norm, child_norm]) == parent_norm
    except ValueError:
        return False


def is_hard_denied(path: Path | str) -> bool:
    """Rejects profile/system roots and anything that would expose them."""
    resolved = _safe_resolve(Path(path))
    if _is_drive_root(resolved):
        return True
    home = _safe_resolve(Path.home())
    if _norm(resolved) == _norm(home):
        return True
    protected = _protected_paths()
    for guarded in protected:
        if _contains(guarded, resolved):
            return True
    # A parent of a protected path (for example C:\Users) would expose it.
    for guarded in (home, *protected):
        if _norm(resolved) != _norm(guarded) and _contains(resolved, guarded):
            return True
    return False


def normalize_allowed_roots(value: Any) -> List[str]:
    """Sanitizes user-added roots: absolute, safe, deduplicated, non-nested."""
    if value is None or isinstance(value, str):
        return []
    try:
        items = list(value)
    except TypeError:
        return []

    defaults = default_roots()
    accepted: List[Path] = []
    for item in items:
        if len(accepted) >= MAX_EXTRA_ROOTS:
            break
        if not isinstance(item, str):
            continue
        text = item.strip().strip('"').strip("'")
        if not text:
            continue
        expanded = Path(os.path.expandvars(os.path.expanduser(text)))
        if not expanded.is_absolute():
            continue
        resolved = _safe_resolve(expanded)
        if is_hard_denied(resolved):
            continue
        # A root already covered by a default or an earlier root adds nothing.
        if any(_contains(root, resolved) for root in (*defaults, *accepted)):
            continue
        # A parent of an earlier root supersedes it.
        accepted = [root for root in accepted if not _contains(resolved, root)]
        accepted.append(resolved)

    return [str(path) for path in accepted]


def allowed_root_paths(extra_roots: Any = None) -> List[Path]:
    """Returns existing roots: the defaults plus valid user additions."""
    roots = list(default_roots())
    for raw in normalize_allowed_roots(extra_roots):
        candidate = _safe_resolve(Path(raw))
        if not candidate.is_dir():
            # Missing or offline roots are skipped until they come back.
            continue
        if any(_contains(root, candidate) for root in roots):
            continue
        roots.append(candidate)
    return roots


def is_within(root: Path | str, candidate: Path | str) -> bool:
    """Containment check that resolves junctions and symlinks first."""
    try:
        return _contains(_safe_resolve(Path(root)), _safe_resolve(Path(candidate)))
    except OSError:
        return False


def roots_for_display(extra_roots: Any = None) -> List[str]:
    """Returns every active root as text, for diagnostics and tests."""
    return [str(path) for path in allowed_root_paths(extra_roots)]


def root_names() -> List[str]:
    """Default root labels, used by the Settings UI and search aliases."""
    return [label for label, _folder_id in _DEFAULT_FOLDER_IDS]


def dedupe_paths(paths: Iterable[Path]) -> List[Path]:
    """Returns paths with duplicates removed, preserving order."""
    return _dedupe(list(paths))


def _dedupe(paths: Iterable[Path]) -> List[Path]:
    seen = set()
    unique: List[Path] = []
    for path in paths:
        key = _norm(path)
        if key in seen:
            continue
        seen.add(key)
        unique.append(path)
    return unique
