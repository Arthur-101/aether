"""Tests for config loading, migration, and corruption recovery."""

import json

import pytest

from backend import config_manager as config_module
from backend.config_manager import ConfigManager


@pytest.fixture
def app_dir(tmp_path, monkeypatch):
    directory = tmp_path / "Aether"
    directory.mkdir()
    monkeypatch.setattr(config_module, "get_app_dir", lambda: directory)
    return directory


def test_missing_config_writes_defaults(app_dir):
    manager = ConfigManager()

    path = app_dir / "config.json"
    assert path.exists()
    assert manager.get("first_run_completed") is False
    assert manager.get("voice", "stt_engine") == "local_phonon2"
    assert manager.get("hotkeys", "dictation") == "<ctrl>+<cmd>"
    assert manager.get("spotify", "client_id") == ""
    assert json.loads(path.read_text(encoding="utf-8"))["brand_name"] == "Aether"


def test_spotify_client_id_is_trimmed_and_bounded(app_dir):
    (app_dir / "config.json").write_text(
        json.dumps({"spotify": {"client_id": "  " + ("a" * 250) + "  "}}),
        encoding="utf-8",
    )
    manager = ConfigManager()
    assert manager.get("spotify", "client_id") == "a" * 200


def test_load_merges_new_defaults_without_overwriting_user_values(app_dir):
    (app_dir / "config.json").write_text(
        json.dumps(
            {
                "brand_name": "My Aether",
                "first_run_completed": True,
                "ai_provider": {
                    "mode": "cloud",
                    "cloud_provider": "openrouter",
                    "api_key": "legacy-key",
                    "cloud_model": "legacy-model",
                },
                "appearance": {"pill_opacity": 0.42},
                "storage": {"notes_theme": "meadow"},
                "user_section": {"keep": "me"},
            }
        ),
        encoding="utf-8",
    )

    manager = ConfigManager()

    assert manager.get("brand_name") == "My Aether"
    assert manager.get("first_run_completed") is True
    assert manager.get("storage", "notes_theme") == "meadow"
    assert manager.get("storage", "auto_session_timeout_minutes") == 15
    assert manager.get("appearance", "pill_opacity") == 0.42
    # New keys in existing sections are populated.
    assert manager.get("appearance", "button_primary")
    assert manager._config["user_section"] == {"keep": "me"}
    # Legacy single-key credentials migrate into the provider store.
    providers = manager.get("ai_provider", "cloud_providers")
    assert providers["openrouter"]["api_key"] == "legacy-key"
    assert providers["openrouter"]["model"] == "legacy-model"


def test_general_defaults_are_written(app_dir):
    manager = ConfigManager()

    assert manager.get("general", "start_on_startup") is False
    assert manager.get("general", "show_tray_icon") is True
    assert json.loads((app_dir / "config.json").read_text(encoding="utf-8"))[
        "general"
    ] == {"start_on_startup": False, "show_tray_icon": True}


def test_general_preferences_are_normalized(app_dir):
    (app_dir / "config.json").write_text(
        json.dumps(
            {
                "general": {
                    "start_on_startup": True,
                    "show_tray_icon": False,
                    "unknown": "dropped",
                }
            }
        ),
        encoding="utf-8",
    )

    manager = ConfigManager()

    assert manager.get("general") == {
        "start_on_startup": True,
        "show_tray_icon": False,
    }


def test_general_wrong_types_fall_back_to_defaults(app_dir):
    (app_dir / "config.json").write_text(
        json.dumps(
            {"general": {"start_on_startup": "yes", "show_tray_icon": 0}}
        ),
        encoding="utf-8",
    )

    manager = ConfigManager()

    assert manager.get("general", "start_on_startup") is False
    assert manager.get("general", "show_tray_icon") is True


def test_corrupt_config_is_preserved_before_defaults_are_written(app_dir):
    original = '{"brand_name": "Broken", '
    (app_dir / "config.json").write_text(original, encoding="utf-8")

    manager = ConfigManager()

    backups = list(app_dir.glob("config.corrupt-*.json"))
    assert len(backups) == 1
    assert backups[0].read_text(encoding="utf-8") == original
    assert manager.get("brand_name") == "Aether"
    assert json.loads((app_dir / "config.json").read_text(encoding="utf-8"))


def test_wrong_section_types_fall_back_to_defaults(app_dir):
    (app_dir / "config.json").write_text(
        json.dumps(
            {
                "voice": "not-a-section",
                "hotkeys": [],
                "storage": {"notes_theme": "meadow"},
            }
        ),
        encoding="utf-8",
    )

    manager = ConfigManager()

    assert manager.get("voice", "stt_engine") == "local_phonon2"
    assert manager.get("hotkeys", "dictation") == "<ctrl>+<cmd>"
    assert manager.get("storage", "notes_theme") == "meadow"


def test_null_section_is_replaced_with_defaults(app_dir):
    (app_dir / "config.json").write_text(
        json.dumps({"appearance": None}), encoding="utf-8"
    )

    manager = ConfigManager()

    assert isinstance(manager.get("appearance"), dict)
    assert manager.get("appearance", "pill_opacity")
