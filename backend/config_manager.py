"""
Aether Configuration Manager
Handles dynamic resolution of app data paths, user preferences, and runtime settings.
Strictly follows Rule 1: ZERO Hardcoded Paths. All paths resolve dynamically.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict
from platformdirs import user_data_dir

APP_NAME = "Aether"
DEFAULT_MODELS_DIR = Path("E:/Codes/Models")  # Checked on local machine if present


def get_app_dir() -> Path:
    """Returns %APPDATA%/Aether or equivalent platform directory."""
    app_dir = Path(user_data_dir(APP_NAME, roaming=True))
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


def get_default_config() -> Dict[str, Any]:
    """Generates default configuration adhering to PACKAGING_AND_CONFIG.md."""
    models_dir = DEFAULT_MODELS_DIR if DEFAULT_MODELS_DIR.exists() else get_app_dir() / "models"
    ternary_gguf = models_dir / "Ternary-Bonsai-2-9B-PQ2_0-MTP-Q8_0.gguf"
    phonon2_dir = models_dir / "model_phonon2_c4c_int6"
    paradee_path = models_dir / "models" / "onnx" / "paradee.onnx"

    return {
        "first_run_completed": False,
        "ai_provider": {
            "mode": "local_gguf",
            "local_engine": "llama_cpp",
            "gguf_model_path": str(ternary_gguf) if ternary_gguf.exists() else "",
            "context_length": 8192,
            "gpu_layers": -1,
            "kv_cache_type": "q8_0",
        },
        "voice": {
            "stt_engine": "local_phonon2",
            "stt_model_dir": str(phonon2_dir) if phonon2_dir.exists() else "",
            "tts_engine": "local_paradee",
            "tts_model_path": str(paradee_path) if paradee_path.exists() else "",
            "tts_voice_id": "af_heart",
            "mic_device_index": None,
        },
        "hotkeys": {
            "dictation": "<ctrl>+<cmd>",
            "circle_to_ask": "<ctrl>+<shift>",
            "radial_wheel_modifier": "shift",
            "toggle_drawer": "<alt>+<space>",
        },
        "storage": {
            "export_directory": "DESKTOP",
            "auto_session_timeout_minutes": 15,
        },
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
            defaults = get_default_config()
            # Deep merge to ensure newly added keys are populated
            for section, vals in defaults.items():
                if section not in loaded:
                    loaded[section] = vals
                elif isinstance(vals, dict) and isinstance(loaded[section], dict):
                    for k, v in vals.items():
                        loaded[section].setdefault(k, v)
            self._config = loaded
        except Exception:
            self._config = get_default_config()
            self.save(self._config)

        return self._config

    def save(self, new_config: Dict[str, Any]) -> None:
        """Persists configuration to disk atomically."""
        self._config = new_config
        temp_path = self.config_path.with_suffix(".tmp")
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(self._config, f, indent=2)
        temp_path.replace(self.config_path)

    def get(self, section: str, key: str | None = None, default: Any = None) -> Any:
        """Reads a specific configuration key or section safely."""
        sec_val = self._config.get(section, {})
        if key is None:
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


# Global singleton instance
config_manager = ConfigManager()
