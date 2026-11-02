"""Pack-aware Phonon-2 resolution tests.

The speech pack has two halves that must come from the same version: a portable
Python runtime and the unpacked model. A regression here silently disables
dictation or pairs a newer runtime with an older model, so the lookup order and
the completeness checks are pinned down explicitly.
"""

from pathlib import Path

import pytest

from backend.ai import stt_engine


@pytest.fixture(autouse=True)
def components_env(monkeypatch, tmp_path):
    """Keeps pack probing away from the real %LOCALAPPDATA% tree."""
    root = tmp_path / "components-root"
    monkeypatch.setenv("AETHER_COMPONENTS_DIR", str(root))
    monkeypatch.delenv("AETHER_STT_RUNTIME", raising=False)
    # Never read the developer's real voice config.
    monkeypatch.setattr(
        stt_engine.config_manager,
        "get",
        lambda section, key, default=None: default,
    )
    return root / "components"


def _install(
    components: Path,
    version: str,
    *,
    runtime: bool = True,
    model: bool = True,
    layout: str = "portable",
) -> Path:
    root = components / "stt-phonon2" / version
    if runtime:
        runtime_dir = root / "bin" / "stt-runtime"
        if layout == "venv":
            runtime_dir = runtime_dir / "Scripts"
        runtime_dir.mkdir(parents=True)
        (runtime_dir / "python.exe").write_bytes(b"")
    if model:
        model_dir = root / "models" / "phonon2"
        model_dir.mkdir(parents=True)
        (model_dir / "model.fermion").write_bytes(b"")
        (model_dir / "config.json").write_text("{}", encoding="utf-8")
    return root


def _engine() -> stt_engine.STTEngine:
    return stt_engine.STTEngine()


def test_pack_supplies_runtime_and_model(components_env):
    root = _install(components_env, "0.1.0")
    engine = _engine()

    assert engine._active_pack() == root
    assert engine._runtime_python() == root / "bin" / "stt-runtime" / "python.exe"
    assert engine._resolve_model_dir() == root / "models" / "phonon2"
    assert engine._local_available() is True


def test_newest_complete_pack_wins(components_env):
    _install(components_env, "0.9.0")
    newest = _install(components_env, "0.10.0")
    engine = _engine()

    assert engine._active_pack() == newest
    assert engine._runtime_python() == newest / "bin" / "stt-runtime" / "python.exe"
    assert engine._resolve_model_dir() == newest / "models" / "phonon2"


def test_incomplete_newer_pack_does_not_pair_halves(components_env):
    _install(components_env, "0.2.0", model=False)
    complete = _install(components_env, "0.1.0")
    engine = _engine()

    assert engine._active_pack() == complete
    assert engine._runtime_python() == complete / "bin" / "stt-runtime" / "python.exe"
    assert engine._resolve_model_dir() == complete / "models" / "phonon2"


def test_pack_accepts_legacy_venv_layout(components_env):
    root = _install(components_env, "0.1.0", layout="venv")
    engine = _engine()

    assert engine._active_pack() == root
    assert engine._runtime_python() == root / "bin" / "stt-runtime" / "Scripts" / "python.exe"


def test_explicit_runtime_override_still_wins(components_env, monkeypatch, tmp_path):
    _install(components_env, "0.1.0")
    custom = tmp_path / "custom-python.exe"
    custom.write_bytes(b"")
    monkeypatch.setenv("AETHER_STT_RUNTIME", str(custom))

    assert _engine()._runtime_python() == custom


def test_explicit_model_directory_still_wins(components_env, monkeypatch, tmp_path):
    _install(components_env, "0.1.0")
    custom = tmp_path / "my-model"
    custom.mkdir()
    (custom / "model.fermion").write_bytes(b"")
    monkeypatch.setattr(
        stt_engine.config_manager,
        "get",
        lambda section, key, default=None: str(custom) if key == "stt_model_dir" else default,
    )

    assert _engine()._resolve_model_dir() == custom


def test_missing_config_marks_pack_incomplete(components_env):
    root = _install(components_env, "0.1.0")
    (root / "models" / "phonon2" / "config.json").unlink()

    assert _engine()._active_pack() is None


def test_no_pack_is_reported_as_absent(components_env):
    assert _engine()._active_pack() is None


def test_version_key_is_natural():
    versions = ["0.9.0", "0.10.0", "0.1.0"]
    versions.sort(key=stt_engine.STTEngine._version_key)
    assert versions == ["0.1.0", "0.9.0", "0.10.0"]
