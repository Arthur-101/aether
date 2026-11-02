"""Optional component pack tests.

The downloader is the only part that touches the network, so it is the only
part that is stubbed. Everything else — manifest validation, version
comparison, SHA-256, zip-slip rejection, install/remove state — runs against a
real temporary directory. A future refactor is most likely to break exactly
those paths silently, so they are the ones worth pinning down.
"""

import hashlib
import io
import json
import threading
import zipfile
from pathlib import Path

import pytest

from backend import components_manager as cm


@pytest.fixture(autouse=True)
def components_env(monkeypatch, tmp_path):
    """Keeps component probing away from the real %LOCALAPPDATA% tree."""
    monkeypatch.setenv("AETHER_COMPONENTS_DIR", str(tmp_path))
    monkeypatch.setenv("AETHER_COMPONENTS_MANIFEST", str(tmp_path / "manifest.json"))
    return tmp_path


def _write_manifest(path: Path, components, base_url: str = "") -> None:
    path.write_text(
        json.dumps({"schema": 1, "base_url": base_url, "components": components}),
        encoding="utf-8",
    )


def _entry(**overrides):
    base = {
        "id": "engine-vulkan",
        "name": "Engine - Vulkan",
        "kind": "engine",
        "backend": "vulkan",
        "version": "1.2.3",
        "url": "https://example.invalid/engine.zip",
        "sha256": hashlib.sha256(b"payload").hexdigest(),
        "size": 7,
        "installed_size": 7,
        "min_app_version": "0.1.0",
        "recommended": True,
        "description": "",
    }
    base.update(overrides)
    return base


def _manifest_entries() -> list:
    """The normalized entries from the manifest the fixture points at."""
    return cm.load_manifest()["components"]


def _zip_bytes(files) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as bundle:
        for name, data in files.items():
            bundle.writestr(name, data)
    return buffer.getvalue()


def _stub_download(monkeypatch, data: bytes) -> None:
    def fake(entry, part, progress, cancel):
        part.parent.mkdir(parents=True, exist_ok=True)
        part.write_bytes(data)
        progress(cm._progress(entry["id"], "downloading", len(data), len(data)))

    monkeypatch.setattr(cm, "_download", fake)


class _FakeResponse:
    def __init__(self, data: bytes, status: int = 200):
        self._buffer = data
        self.status = status
        self.headers = {"Content-Length": str(len(data))}

    def read(self, size: int) -> bytes:
        chunk, self._buffer = self._buffer[:size], self._buffer[size:]
        return chunk

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


# ── manifest ──────────────────────────────────────────────────────────────


def test_missing_manifest_is_an_empty_catalog():
    assert cm.load_manifest()["components"] == []


def test_manifest_drops_invalid_and_duplicate_ids(components_env):
    _write_manifest(
        components_env / "manifest.json",
        [
            _entry(id="../escape"),
            _entry(id="engine-vulkan"),
            _entry(id="engine-vulkan", name="duplicate"),
            _entry(id="engine-cpu"),
        ],
    )
    ids = [entry["id"] for entry in _manifest_entries()]
    assert ids == ["engine-vulkan", "engine-cpu"]


def test_relative_url_is_resolved_against_base_url(components_env):
    _write_manifest(
        components_env / "manifest.json",
        [_entry(url="packs/engine.zip")],
        base_url="https://cdn.example.invalid/aether/",
    )
    assert _manifest_entries()[0]["url"] == "https://cdn.example.invalid/aether/packs/engine.zip"


def test_unreadable_manifest_is_not_an_error(components_env):
    (components_env / "manifest.json").write_text("{not json", encoding="utf-8")
    assert cm.load_manifest()["components"] == []


# ── install state ─────────────────────────────────────────────────────────


def test_describe_reports_unavailable_without_sha(components_env):
    _write_manifest(components_env / "manifest.json", [_entry(sha256="")])
    assert cm.describe(_manifest_entries()[0])["state"] == "unavailable"


def test_describe_reports_requires_newer_app(components_env):
    _write_manifest(
        components_env / "manifest.json", [_entry(min_app_version="99.0.0")]
    )
    described = cm.describe(_manifest_entries()[0])
    assert described["state"] == "requires_newer_app"
    assert described["compatible"] is False


def test_describe_tracks_install_and_update(components_env):
    _write_manifest(components_env / "manifest.json", [_entry(version="1.2.3")])
    entry = _manifest_entries()[0]

    assert cm.describe(entry)["state"] == "not_installed"

    installed = cm.get_components_dir() / "engine-vulkan" / "1.0.0"
    installed.mkdir(parents=True)
    assert cm.describe(entry)["state"] == "update_available"

    (cm.get_components_dir() / "engine-vulkan" / "1.2.3").mkdir()
    assert cm.describe(entry)["state"] == "installed"


def test_list_components_includes_unmanaged_install(components_env):
    (components_env / "components" / "hand-placed" / "2.0.0").mkdir(parents=True)
    listed = {item["id"]: item for item in cm.list_components()}
    assert listed["hand-placed"]["state"] == "installed"
    assert listed["hand-placed"]["downloadable"] is False


# ── install ───────────────────────────────────────────────────────────────


def test_install_verifies_and_extracts(components_env, monkeypatch):
    archive = _zip_bytes({"bin/engine.exe": b"MZ", "readme.txt": b"hi"})
    _write_manifest(
        components_env / "manifest.json",
        [_entry(sha256=hashlib.sha256(archive).hexdigest(), size=len(archive))],
    )
    _stub_download(monkeypatch, archive)

    result = cm.install_component("engine-vulkan", lambda payload: None, threading.Event())

    target = cm.get_components_dir() / "engine-vulkan" / "1.2.3"
    assert result["state"] == "installed"
    assert (target / "bin" / "engine.exe").read_bytes() == b"MZ"
    assert not (target.parent / "1.2.3.part").exists()
    assert not (target.parent / "1.2.3.tmp").exists()


def test_install_rejects_wrong_sha256(components_env, monkeypatch):
    _write_manifest(components_env / "manifest.json", [_entry()])
    _stub_download(monkeypatch, b"tampered")

    with pytest.raises(cm.ComponentError):
        cm.install_component("engine-vulkan", lambda payload: None, threading.Event())

    root = cm.get_components_dir() / "engine-vulkan"
    assert not (root / "1.2.3").exists()
    assert not (root / "1.2.3.part").exists()


def test_install_rejects_zip_slip(components_env, monkeypatch):
    archive = _zip_bytes({"../escape.txt": b"nope"})
    _write_manifest(
        components_env / "manifest.json",
        [_entry(sha256=hashlib.sha256(archive).hexdigest())],
    )
    _stub_download(monkeypatch, archive)

    with pytest.raises(cm.ComponentError):
        cm.install_component("engine-vulkan", lambda payload: None, threading.Event())

    assert not (cm.get_components_dir() / "escape.txt").exists()
    assert not (components_env / "escape.txt").exists()


def test_install_rejects_unknown_component(components_env):
    _write_manifest(components_env / "manifest.json", [_entry()])
    with pytest.raises(cm.ComponentError):
        cm.install_component("nope", lambda payload: None, threading.Event())


def test_install_rejects_unpublished_component(components_env):
    _write_manifest(components_env / "manifest.json", [_entry(sha256="")])
    with pytest.raises(cm.ComponentError):
        cm.install_component("engine-vulkan", lambda payload: None, threading.Event())


def test_install_propagates_cancellation(components_env, monkeypatch):
    _write_manifest(components_env / "manifest.json", [_entry()])

    def cancel_during_download(entry, part, progress, cancel):
        raise cm.ComponentCancelled("Download cancelled.")

    monkeypatch.setattr(cm, "_download", cancel_during_download)

    with pytest.raises(cm.ComponentCancelled):
        cm.install_component("engine-vulkan", lambda payload: None, threading.Event())


def test_remove_deletes_every_version(components_env):
    (components_env / "components" / "engine-cpu" / "1.0.0").mkdir(parents=True)
    (components_env / "components" / "engine-cpu" / "1.1.0").mkdir()
    assert cm.installed_versions("engine-cpu") == ["1.0.0", "1.1.0"]

    cm.remove_component("engine-cpu")
    assert not (components_env / "components" / "engine-cpu").exists()


def test_id_traversal_is_refused(components_env):
    with pytest.raises(cm.ComponentError):
        cm.installed_versions("../escape")
    with pytest.raises(cm.ComponentError):
        cm.remove_component("nested/id")


# ── downloader ────────────────────────────────────────────────────────────


def test_download_honours_cancel(components_env, monkeypatch):
    monkeypatch.setattr(
        cm.urllib.request, "urlopen", lambda request, timeout=None: _FakeResponse(b"x")
    )
    cancel = threading.Event()
    cancel.set()
    with pytest.raises(cm.ComponentCancelled):
        cm._download(
            _entry(), components_env / "x.part", lambda payload: None, cancel
        )


def test_download_resumes_with_range(components_env, monkeypatch):
    captured = {}

    def fake_urlopen(request, timeout=None):
        captured["range"] = request.get_header("Range")
        return _FakeResponse(b"tail", status=206)

    monkeypatch.setattr(cm.urllib.request, "urlopen", fake_urlopen)

    part = components_env / "x.part"
    part.write_bytes(b"head")
    progress = []
    cm._download(_entry(size=8), part, progress.append, threading.Event())

    assert captured["range"] == "bytes=4-"
    assert part.read_bytes() == b"headtail"
    assert progress[-1]["received"] == 8
