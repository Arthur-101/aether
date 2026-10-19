"""
Aether Screen Brightness Controls
Lazy wrapper around screen-brightness-control; never imported at daemon startup.
"""

from typing import Optional


def get_brightness() -> Optional[int]:
    """Returns the primary display brightness percentage, or None if unsupported."""
    try:
        import screen_brightness_control as sbc

        value = sbc.get_brightness()
        if isinstance(value, (list, tuple)):
            value = value[0] if value else None
        return int(value) if value is not None else None
    except Exception:
        return None


def set_brightness(level: int) -> int:
    """Sets display brightness and returns the clamped percentage."""
    clamped = max(0, min(100, int(level)))
    try:
        import screen_brightness_control as sbc

        sbc.set_brightness(clamped)
    except Exception:
        pass
    return clamped
