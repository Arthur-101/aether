"""
Aether Configuration Manager
Handles dynamic resolution of app data paths, user preferences, and runtime settings.
Strictly follows Rule 1: ZERO Hardcoded Paths. All paths resolve dynamically.
"""

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from platformdirs import user_data_dir

from .config_schema import (
    DEFAULT_MAX_TOOL_ROUNDS,
    DEFAULT_MEMORY_CLOUD_RECENT_TURNS,
    DEFAULT_MEMORY_CLOUD_SEMANTIC_MATCHES,
    DEFAULT_MEMORY_LOCAL_RECENT_TURNS,
    DEFAULT_MEMORY_LOCAL_SEMANTIC_MATCHES,
    default_appearance,
    default_clock,
    default_general,
    default_spotify,
    default_taskbar_apps,
    default_tools,
    default_wallpaper,
    normalize_config,
)
from .tool_groups import normalize_disabled_tools, normalize_enabled_tool_groups

APP_NAME = "Aether"
logger = logging.getLogger("aether.config")


def get_app_dir() -> Path:
    """Returns %APPDATA%/Aether or equivalent platform directory."""
    # appauthor=False prevents platformdirs from producing APPDATA/Aether/Aether
    app_dir = Path(user_data_dir(APP_NAME, appauthor=False, roaming=True))
    app_dir.mkdir(parents=True, exist_ok=True)
    return app_dir


def get_data_dir() -> Path:
    """Returns %APPDATA%/Aether/data for SQLite database and state files."""
    data_dir = get_app_dir() / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def get_db_path() -> Path:
    """Returns the single-file database path."""
    return get_data_dir() / "assistant_data.db"


def get_models_dir() -> Path:
    """Returns the portable models directory (overridable via AETHER_MODELS_DIR)."""
    override = os.getenv("AETHER_MODELS_DIR", "").strip()
    models_dir = Path(override) if override else get_app_dir() / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    return models_dir


def find_model_file(patterns: List[str], base_dir: Optional[Path] = None) -> str:
    """Searches the models directory for the first matching glob pattern."""
    root = base_dir or get_models_dir()
    for pattern in patterns:
        matches = sorted(root.rglob(pattern))
        if matches:
            return str(matches[0])
    return ""


def find_model_dir(patterns: List[str], base_dir: Optional[Path] = None) -> str:
    """Searches the models directory for the first matching directory name."""
    root = base_dir or get_models_dir()
    for pattern in patterns:
        matches = sorted(p for p in root.rglob(pattern) if p.is_dir())
        if matches:
            return str(matches[0])
    return ""


def get_default_config() -> Dict[str, Any]:
    """Generates portable defaults adhering to PACKAGING_AND_CONFIG.md."""
    models_dir = get_models_dir()
    ternary_gguf = find_model_file(["*Ternary*Bonsai*.gguf", "*.gguf"], models_dir)
    phonon2_dir = find_model_dir(["*phonon2*", "*phonon*"], models_dir)
    paradee_path = find_model_file(["paradee.onnx", "**/paradee.onnx"], models_dir)

    return {
        "first_run_completed": False,
        "brand_name": "Aether",
        "general": default_general(),
        "ai_provider": {
            "mode": "local_gguf",  # local_gguf | ollama | cloud
            "local_engine": "llama_cpp",
            "gguf_model_path": ternary_gguf,
            "ollama_base_url": "http://127.0.0.1:11434",
            "ollama_model_name": "ternary-bonsai-2:9b",
            "cloud_provider": "gemini",
            "cloud_model": "gemini-2.5-flash",
            "api_key": "",
            "tavily_api_key": "",
            "context_length": 8192,
            "gpu_layers": -1,
            "kv_cache_type": "q8_0",
            "thinking_mode": False,  # Default: Normal mode (Direct, low-latency)
            "max_tool_rounds": DEFAULT_MAX_TOOL_ROUNDS,
            "memory_local_recent_turns": DEFAULT_MEMORY_LOCAL_RECENT_TURNS,
            "memory_local_semantic_matches": DEFAULT_MEMORY_LOCAL_SEMANTIC_MATCHES,
            "memory_cloud_recent_turns": DEFAULT_MEMORY_CLOUD_RECENT_TURNS,
            "memory_cloud_semantic_matches": DEFAULT_MEMORY_CLOUD_SEMANTIC_MATCHES,
        },
        "voice": {
            "stt_engine": "local_phonon2",
            "stt_provider": "local",
            "stt_model": "",
            "stt_model_dir": phonon2_dir,
            "tts_engine": "local_paradee",
            "tts_provider": "local",
            "tts_model": "",
            "tts_model_path": paradee_path,
            "tts_voice_id": "af_heart",
            "tts_speed": 1.0,
            "mic_device_index": None,
        },
        "hotkeys": {
            "dictation": "<ctrl>+<cmd>",
            "circle_to_ask": "<ctrl>+<shift>",
            "radial_wheel_modifier": "shift",
            "toggle_drawer": "<alt>+<space>",
            "open_island": "<ctrl>+<space>",
        },
        "storage": {
            "export_directory": "SAME_AS_SOURCE",
            "auto_session_timeout_minutes": 15,
            "notes_directory": "",
            "notes_theme": "default",
        },
        "appearance": default_appearance(),
        "clock": default_clock(),
        "taskbar_apps": default_taskbar_apps(),
        "wallpaper": default_wallpaper(),
        "spotify": default_spotify(),
        "tools": default_tools(),
    }


class ConfigManager:
    """Manages reading, caching, and writing %APPDATA%/Aether/config.json."""

    def __init__(self):
        self.config_path = get_app_dir() / "config.json"
        self._config: Dict[str, Any] = {}
        self.load()

    def load(self) -> Dict[str, Any]:
        """Loads configuration from disk or writes defaults if missing."""
        if not self.config_path.exists():
            self._config = get_default_config()
            self.save(self._config)
            return self._config

        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if not isinstance(loaded, dict):
                raise ValueError("config root must be a JSON object")
            defaults = get_default_config()
            # Recursively merge to ensure newly added keys are populated while
            # preserving every value the user already had.
            self._merge_defaults(loaded, defaults)
            self._config = normalize_config(loaded)
        except Exception as exc:
            # Never silently destroy a config we could not read. Keep the
            # original beside the new defaults so it can be recovered.
            backup = self.config_path.with_name(
                f"{self.config_path.stem}.corrupt-{int(time.time())}.json"
            )
            try:
                self.config_path.replace(backup)
                logger.warning(
                    "Could not load %s (%s); moved it to %s and restored defaults.",
                    self.config_path,
                    exc,
                    backup.name,
                )
            except OSError:
                logger.warning(
                    "Could not load %s (%s); restoring defaults in place.",
                    self.config_path,
                    exc,
                )
            self._config = get_default_config()
            self.save(self._config)

        return self._config

    @staticmethod
    def _merge_defaults(loaded: Dict[str, Any], defaults: Dict[str, Any]) -> None:
        """Adds missing default keys without overwriting user values."""
        for key, default_value in defaults.items():
            if key not in loaded:
                loaded[key] = default_value
                continue
            current = loaded[key]
            if isinstance(default_value, dict):
                if not isinstance(current, dict):
                    loaded[key] = default_value
                else:
                    ConfigManager._merge_defaults(current, default_value)
            elif current is None and default_value is not None:
                loaded[key] = default_value

    def save(self, new_config: Dict[str, Any]) -> None:
        """Persists configuration to disk atomically."""
        self._config = normalize_config(new_config)
        temp_path = self.config_path.with_suffix(".tmp")
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(self._config, f, indent=2)
        temp_path.replace(self.config_path)

    def merge(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Deep-merges a partial config update over the current configuration."""
        def _merge(base: Dict[str, Any], patch: Dict[str, Any]) -> None:
            for key, value in patch.items():
                if isinstance(value, dict) and isinstance(base.get(key), dict):
                    _merge(base[key], value)
                else:
                    base[key] = value

        merged = dict(self._config)
        _merge(merged, updates)
        self.save(merged)
        return self._config

    def get(self, section: str, key: str | None = None, default: Any = None) -> Any:
        """Reads a specific configuration key or section safely."""
        sec_val = self._config.get(section, {})
        if key is None or key == "":
            return sec_val
        if isinstance(sec_val, dict):
            return sec_val.get(key, default)
        return default

    def set(self, section: str, key: str, value: Any) -> None:
        """Updates a specific configuration key and persists."""
        if section not in self._config:
            self._config[section] = {}
        self._config[section][key] = value
        self.save(self._config)

    def get_tool_loadout(self) -> Dict[str, List[str]]:
        """Returns the normalized enabled groups and per-tool denylist."""
        return {
            "enabled_groups": normalize_enabled_tool_groups(
                self.get("tools", "enabled_groups")
            ),
            "disabled_tools": normalize_disabled_tools(
                self.get("tools", "disabled_tools")
            ),
        }


# Global singleton instance
config_manager = ConfigManager()
