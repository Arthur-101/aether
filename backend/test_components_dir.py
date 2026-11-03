"""Relocating the component-pack root.

Changing the packs folder is the one Settings action that touches already
installed megabytes, so its behaviour is pinned down: packs move together,
a locked file rolls the whole move back, and the persisted config plus the
uninstaller marker follow the new folder.
"""

from pathlib import Path

import pytest

from backend import components_manager as cm


@pytest.fixture
def packs(monkeypatch, tmp_path):
    """Points the manager at throwaway source/default folders and a fake config."""
    src = tmp_path / "src"
    default = tmp_path / "default"
    dest = tmp_path / "dest"
    marker = tmp_path / "components-path.txt"
    state = {"dir": src}

    class FakeConfig:
        def __init__(self):
            self.storage = {}

        def get(self, section, key=None, default=None):
            if section == "storage" and key:
                return self.storage.get(key, default)
            return default

        def set(self, section, key, value):
            if section == "storage":
                self.storage[key] = value
                state["dir"] = default if not value else Path(value)

    fake = FakeConfig()
    monkeypatch.setattr(cm, "config_manager", fake)
    monkeypatch.setattr(cm, "get_components_dir", lambda: state["dir"])
    monkeypatch.setattr(cm, "default_components_dir", lambda: default)
    monkeypatch.setattr(
        cm,
        "sync_components_marker",
        lambda: marker.write_text(str(state["dir"]), encoding="utf-8"),
    )
    src.mkdir()
    default.mkdir()
    return src, default, dest, state, fake, marker


def _pack(root: Path, component_id: str = "engine-vulkan", version: str = "1.0.0"):
    binary = root / component_id / version / "bin" / "llama-server.exe"
    binary.parent.mkdir(parents=True, exist_ok=True)
    binary.write_bytes(b"stub")
    return binary


def test_move_relocates_installed_packs(packs):
    src, _default, dest, state, fake, marker = packs
    _pack(src)

    report = cm.change_components_dir(str(dest), move=True)

    assert report["moved"] == ["engine-vulkan"]
    assert report["remaining"] == []
    assert (dest / "engine-vulkan" / "1.0.0" / "bin" / "llama-server.exe").is_file()
    assert not (src / "engine-vulkan").exists()
    assert state["dir"] == dest
    assert fake.storage["components_directory"] == str(dest)
    assert marker.read_text(encoding="utf-8") == str(dest)


def test_switch_without_move_leaves_packs_behind(packs):
    src, _default, dest, state, fake, _marker = packs
    _pack(src)

    report = cm.change_components_dir(str(dest), move=False)

    assert report["moved"] == []
    assert report["remaining"] == ["engine-vulkan"]
    assert (src / "engine-vulkan" / "1.0.0").is_dir()
    assert state["dir"] == dest
    assert fake.storage["components_directory"] == str(dest)


def test_reset_to_default_clears_the_config(packs):
    src, default, dest, state, fake, _marker = packs
    _pack(src)
    cm.change_components_dir(str(dest), move=True)
    _pack(src)  # a pack installed after the first move

    report = cm.change_components_dir(str(default), move=True)

    assert report["moved"] == ["engine-vulkan"]
    assert (default / "engine-vulkan" / "1.0.0").is_dir()
    assert fake.storage["components_directory"] == ""
    assert state["dir"] == default


def test_locked_pack_rolls_the_whole_move_back(monkeypatch, packs):
    src, _default, dest, state, fake, _marker = packs
    _pack(src, "engine-vulkan")
    _pack(src, "engine-cuda")

    real_move = cm.shutil.move

    def flaky_move(entry, target):
        # Fail only on the second pack, after the first has already moved.
        if Path(entry).name == "engine-cuda":
            raise OSError(32, "The process cannot access the file")
        return real_move(entry, target)

    monkeypatch.setattr(cm.shutil, "move", flaky_move)

    with pytest.raises(cm.ComponentError, match="in use"):
        cm.change_components_dir(str(dest), move=True)

    # Both packs are back where they started; nothing was persisted.
    assert (src / "engine-vulkan" / "1.0.0").is_dir()
    assert (src / "engine-cuda" / "1.0.0").is_dir()
    assert not (dest / "engine-vulkan").exists()
    assert fake.storage == {}


def test_a_file_target_is_refused(packs):
    src, _default, dest, _state, fake, _marker = packs
    _pack(src)
    dest.write_text("not a folder", encoding="utf-8")

    with pytest.raises(cm.ComponentError, match="is a file"):
        cm.change_components_dir(str(dest), move=True)

    assert (src / "engine-vulkan").exists()
    assert fake.storage == {}


def test_a_folder_inside_the_current_root_is_refused(packs):
    src, _default, _dest, _state, fake, _marker = packs
    _pack(src)

    with pytest.raises(cm.ComponentError, match="outside"):
        cm.change_components_dir(str(src / "nested"), move=True)

    assert fake.storage == {}
