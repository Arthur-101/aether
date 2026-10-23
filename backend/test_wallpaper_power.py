"""Tests for the Phase 6 wallpaper library and power actions."""

from pathlib import Path

from backend import wallpaper_service
from backend.config_schema import normalize_config, normalize_wallpaper
from backend.os_hooks import power_controls


def test_wallpaper_config_is_normalized():
    assert normalize_wallpaper({"folder": "  D:/Wallpapers  "})["folder"] == "D:/Wallpapers"
    normalized = normalize_config({"wallpaper": {"folder": "D:/Wallpapers"}})
    assert normalized["wallpaper"]["folder"] == "D:/Wallpapers"


def test_wallpaper_path_validation_accepts_images(tmp_path: Path):
    image = tmp_path / "wallpaper.png"
    image.write_bytes(b"not-a-real-png")
    assert wallpaper_service.validate_wallpaper_path(str(image)) is None


def test_wallpaper_path_validation_rejects_missing_and_non_images(tmp_path: Path):
    missing = tmp_path / "missing.png"
    assert wallpaper_service.validate_wallpaper_path(str(missing))

    text = tmp_path / "notes.txt"
    text.write_text("hello", encoding="utf-8")
    assert wallpaper_service.validate_wallpaper_path(str(text))


def test_apply_wallpaper_uses_the_native_setter(monkeypatch, tmp_path: Path):
    image = tmp_path / "wallpaper.png"
    image.write_bytes(b"not-a-real-png")
    remembered = []

    monkeypatch.setattr(wallpaper_service, "_current_wallpaper", lambda: "")
    monkeypatch.setattr(wallpaper_service, "_set_wallpaper", lambda path: True)
    monkeypatch.setattr(wallpaper_service, "_remember", lambda path: remembered.append(path))

    result = wallpaper_service.apply_wallpaper(str(image))
    assert result["ok"] is True
    assert remembered == [str(image.resolve())]


def test_apply_wallpaper_keeps_the_outgoing_wallpaper_in_recent(
    monkeypatch, tmp_path: Path
):
    previous = tmp_path / "previous.png"
    previous.write_bytes(b"previous")
    image = tmp_path / "wallpaper.png"
    image.write_bytes(b"not-a-real-png")
    remembered = []

    monkeypatch.setattr(wallpaper_service, "_current_wallpaper", lambda: str(previous))
    monkeypatch.setattr(wallpaper_service, "_set_wallpaper", lambda path: True)
    monkeypatch.setattr(wallpaper_service, "_remember", lambda path: remembered.append(path))

    result = wallpaper_service.apply_wallpaper(str(image))
    assert result["ok"] is True
    assert remembered == [str(previous), str(image.resolve())]


def test_build_wallpaper_state_lists_recent_and_folder(monkeypatch, tmp_path: Path):
    current = tmp_path / "current.png"
    current.write_bytes(b"current")
    folder = tmp_path / "folder"
    folder.mkdir()
    one = folder / "one.png"
    two = folder / "two.jpg"
    one.write_bytes(b"one")
    two.write_bytes(b"two")

    monkeypatch.setattr(wallpaper_service, "_current_wallpaper", lambda: str(current))
    monkeypatch.setattr(wallpaper_service, "_read_history", lambda: [str(one)])
    monkeypatch.setattr(
        wallpaper_service,
        "_thumbnail_data_uri",
        lambda path: "data:image/jpeg;base64,AA==",
    )
    monkeypatch.setattr(
        wallpaper_service.config_manager,
        "get",
        lambda section, key=None, default=None: (
            str(folder) if section == "wallpaper" and key == "folder" else default
        ),
    )

    state = wallpaper_service.build_wallpaper_state()
    assert state["current"] == str(current)
    assert state["folder_path"] == str(folder)
    assert state["available"] is True
    assert len(state["recent"]) == 2
    assert len(state["folder"]) == 2
    assert state["recent"][0]["is_current"] is True


def test_destructive_power_actions_require_confirmation(monkeypatch):
    called = []
    monkeypatch.setattr(power_controls, "_spawn_shutdown", lambda args: called.append(args) or True)

    result = power_controls.run_power_action("restart", confirm=False)
    assert result["ok"] is False
    assert "confirmation" in result["message"].lower()
    assert called == []

    result = power_controls.run_power_action("restart", confirm=True)
    assert result["ok"] is True
    assert called


def test_power_action_rejects_unknown_actions():
    result = power_controls.run_power_action("explode")
    assert result["ok"] is False
    assert "unknown" in result["message"].lower()


def test_lock_action_can_be_dispatched(monkeypatch):
    monkeypatch.setattr(power_controls, "_lock_workstation", lambda: True)
    result = power_controls.run_power_action("lock")
    assert result["ok"] is True
    assert result["action"] == "lock"
