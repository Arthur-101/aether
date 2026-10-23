"""
Aether Configuration WebSocket Handlers
Owns config read/save/update, Thinking Mode persistence, and hotkey hot-swap.
"""

import asyncio
import logging
from typing import Any, Dict

from .ai.llm_router import llm_router
from .config_manager import config_manager
from .event_router import register_handler
from .ws_manager import ws_manager

logger = logging.getLogger("aether.config")


def _reload_hotkeys() -> None:
    try:
        from .os_hooks.hotkeys import reload_hotkeys

        reload_hotkeys(config_manager.get("hotkeys") or {})
    except Exception as exc:
        logger.warning("Hotkey reload skipped: %s", exc)


async def _broadcast_taskbar_state() -> None:
    try:
        from .taskbar_events import broadcast_taskbar_apps

        await broadcast_taskbar_apps()
    except Exception as exc:
        logger.debug("Taskbar state broadcast skipped: %s", exc)


async def apply_config_update(updates: Dict[str, Any]) -> Dict[str, Any]:
    """Persists a partial/full config and applies runtime side effects."""
    old = dict(config_manager.get("ai_provider") or {})
    config_manager.merge(updates)
    new = config_manager.get("ai_provider") or {}
    backend_keys = (
        "mode",
        "gguf_model_path",
        "ollama_base_url",
        "ollama_model_name",
        "cloud_provider",
        "cloud_model",
        "api_key",
        "context_length",
        "gpu_layers",
    )
    if any(old.get(key) != new.get(key) for key in backend_keys):
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, llm_router.stop_server)
    try:
        from .db.sessions import session_manager

        timeout = int(config_manager.get("storage", "auto_session_timeout_minutes", 15) or 15)
        session_manager.timeout_minutes = max(1, min(240, timeout))
    except Exception:
        pass
    _reload_hotkeys()
    current = config_manager.load()
    await ws_manager.broadcast("CONFIG_STATE", current)
    from .model_events import broadcast_model_status

    await broadcast_model_status()
    if "taskbar_apps" in updates:
        await _broadcast_taskbar_state()
    if "wallpaper" in updates:
        from .wallpaper_events import broadcast_wallpaper_state

        await broadcast_wallpaper_state()
    return current


async def _handle_toggle_thinking(payload: Dict[str, Any]) -> None:
    """Toggles between Normal Mode (default) and Thinking Mode."""
    enabled = bool(payload.get("enabled", False))
    config_manager.set("ai_provider", "thinking_mode", enabled)
    await ws_manager.broadcast("THINKING_MODE_CHANGED", {"enabled": enabled})


async def _handle_get_config(payload: Dict[str, Any]) -> None:
    """Returns the current configuration to the frontend."""
    await ws_manager.broadcast("CONFIG_STATE", config_manager.load())


async def _handle_save_config(payload: Dict[str, Any]) -> None:
    """Persists the complete config object from the Settings modal."""
    updates = payload.get("config")
    if not isinstance(updates, dict):
        await ws_manager.broadcast("ERROR", {"message": "Invalid config payload."})
        return
    await apply_config_update(updates)


async def _handle_update_config(payload: Dict[str, Any]) -> None:
    """Updates a single config section.key value."""
    section = payload.get("section", "")
    key = payload.get("key", "")
    if not section or not key:
        return
    value = payload.get("value")
    logger.info("Config update: %s.%s = %r", section, key, value)
    config_manager.set(section, key, value)
    if section == "hotkeys":
        _reload_hotkeys()
    if section == "clock":
        from .weather_service import clear_weather_cache

        clear_weather_cache()
    if section == "taskbar_apps":
        await _broadcast_taskbar_state()
    if section == "wallpaper":
        from .wallpaper_events import broadcast_wallpaper_state

        await broadcast_wallpaper_state()
    await ws_manager.broadcast(
        "CONFIG_UPDATED", {"section": section, "key": key, "value": value}
    )


async def _handle_hotkey_capture(payload: Dict[str, Any]) -> None:
    """Suspends global hotkeys while the Settings recorder is listening."""
    try:
        from .os_hooks.hotkeys import hotkey_manager

        hotkey_manager.set_suspended(bool(payload.get("enabled", False)))
    except Exception:
        pass


def register_config_events() -> None:
    """Registers configuration event handlers."""
    register_handler("TOGGLE_THINKING_MODE", _handle_toggle_thinking)
    register_handler("GET_CONFIG", _handle_get_config)
    register_handler("SAVE_CONFIG", _handle_save_config)
    register_handler("UPDATE_CONFIG", _handle_update_config)
    register_handler("SET_HOTKEY_CAPTURE", _handle_hotkey_capture)
