"""
Aether Conversion Output Paths
Resolves the user's configured export directory for deterministic file tools.
"""

import os
from pathlib import Path
import winreg

from .config_manager import config_manager


def _desktop_dir() -> Path:
    """Resolves the redirected Windows Desktop folder without hardcoded paths."""
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders",
        )
        with key:
            value, _ = winreg.QueryValueEx(key, "Desktop")
            candidate = Path(os.path.expandvars(value))
            if candidate.is_dir():
                return candidate
    except Exception:
        pass
    fallback = Path.home() / "Desktop"
    return fallback if fallback.is_dir() else Path.home()


def get_export_dir(source: Path) -> Path:
    """Returns SAME_AS_SOURCE, the Desktop, or an existing custom folder."""
    raw = str(config_manager.get("storage", "export_directory", "SAME_AS_SOURCE") or "")
    value = raw.strip()
    if not value or value.upper() == "SAME_AS_SOURCE":
        return source.parent

    if value.upper() == "DESKTOP":
        desktop = _desktop_dir()
        return desktop if desktop.is_dir() else source.parent

    custom = Path(os.path.expandvars(value)).expanduser()
    return custom if custom.is_dir() else source.parent


def exported_path(source: Path, file_name: str) -> Path:
    """Builds an output path in the configured folder for a converted file."""
    target_dir = get_export_dir(source)
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir / file_name
