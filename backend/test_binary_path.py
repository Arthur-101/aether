"""Pack-aware binary resolution tests.

An installed engine pack is only useful if the engine actually spawns the
binary inside it. These tests pin the lookup order (bundle → pack → dev bin →
PATH), the backend preference, and the version selection rules, because a
regression here fails silently by launching a stale or missing server.
"""

from pathlib import Path

import pytest

from backend.ai.errors import EngineNotInstalledError, ModelNotConfiguredError
from backend.ai.local_engine import ENGINE_BACKENDS, engine_component_ids
from backend.config_schema import normalize_ai_provider
from backend.mcp_tools import media_tools


@pytest.fixture(autouse=True)
def components_env(monkeypatch, tmp_path):
    """Keeps pack probing away from the real %LOCALAPPDATA% tree."""
    root = tmp_path / "components-root"
    monkeypatch.setenv("AETHER_COMPONENTS_DIR", str(root))
    monkeypatch.delattr(media_tools.sys, "_MEIPASS", raising=False)
    return root / "components"


def _install(components: Path, component_id: str, version: str, name: str = "llama-server") -> Path:
    binary = components / component_id / version / "bin" / f"{name}.exe"
    binary.parent.mkdir(parents=True, exist_ok=True)
    binary.write_bytes(b"stub")
    return binary


def test_newest_version_wins_with_natural_sort(components_env):
    _install(components_env, "engine-vulkan", "0.9.0")
    newest = _install(components_env, "engine-vulkan", "0.10.0")

    resolved = media_tools.get_binary_path("llama-server", ("engine-vulkan",))

    assert Path(resolved) == newest


def test_backend_order_decides_between_installed_packs(components_env):
    vulkan = _install(components_env, "engine-vulkan", "0.1.0")
    cuda = _install(components_env, "engine-cuda", "0.1.0")

    assert Path(
        media_tools.get_binary_path("llama-server", engine_component_ids("cuda"))
    ) == cuda
    assert Path(
        media_tools.get_binary_path("llama-server", engine_component_ids("vulkan"))
    ) == vulkan


def test_missing_preferred_pack_falls_back(components_env):
    cuda = _install(components_env, "engine-cuda", "0.1.0")

    resolved = media_tools.get_binary_path(
        "llama-server", engine_component_ids("vulkan")
    )

    assert Path(resolved) == cuda


def test_version_pin_ignores_newer_packs(components_env):
    pinned = _install(components_env, "engine-vulkan", "0.1.0")
    _install(components_env, "engine-vulkan", "0.2.0")

    resolved = media_tools.get_binary_path(
        "llama-server", ("engine-vulkan",), component_version="0.1.0"
    )

    assert Path(resolved) == pinned


def test_unpinned_binary_is_ignored(components_env):
    # A file that is not under bin/ must not be treated as the server.
    stray = components_env / "engine-vulkan" / "0.1.0" / "llama-server.exe"
    stray.parent.mkdir(parents=True, exist_ok=True)
    stray.write_bytes(b"stub")

    assert media_tools._component_binary("llama-server", ("engine-vulkan",), "") is None


def test_no_components_falls_back_to_path(components_env, monkeypatch):
    monkeypatch.setattr(
        media_tools.shutil, "which", lambda name: f"/usr/bin/{name}"
    )

    resolved = media_tools.get_binary_path("aether-absent-binary", ("engine-vulkan",))

    assert resolved == "/usr/bin/aether-absent-binary"


def test_engine_component_ids_puts_configured_backend_first():
    assert engine_component_ids("cuda")[0] == "engine-cuda"
    assert engine_component_ids("vulkan")[0] == "engine-vulkan"
    assert engine_component_ids("bogus")[0] == "engine-vulkan"
    assert len(engine_component_ids("cuda")) == len(ENGINE_BACKENDS)


def test_cpu_is_never_an_llm_backend():
    # A 9B model on the host CPU starves the desktop, so when no GPU engine is
    # installed local inference stays off instead of falling back to CPU.
    assert "cpu" not in ENGINE_BACKENDS
    assert "engine-cpu" not in engine_component_ids("vulkan")
    assert engine_component_ids("cpu")[0] == "engine-vulkan"


def test_normalize_ai_provider_sanitizes_engine_fields():
    normalized = normalize_ai_provider(
        {"engine_backend": "CUDA", "engine_version": " 0.1.0 "}
    )
    assert normalized["engine_backend"] == "cuda"
    assert normalized["engine_version"] == "0.1.0"

    fallback = normalize_ai_provider({"engine_backend": "metal"})
    assert fallback["engine_backend"] == "vulkan"
    assert fallback["engine_version"] == ""

    # A stored "cpu" (older builds offered it) normalizes away, not through.
    no_cpu = normalize_ai_provider({"engine_backend": "cpu"})
    assert no_cpu["engine_backend"] == "vulkan"


def test_normalize_ai_provider_rejects_unsafe_version_segments():
    normalized = normalize_ai_provider({"engine_version": "../../escape"})
    assert normalized["engine_version"] == ""


def test_missing_engine_raises_distinct_error(monkeypatch, tmp_path):
    from backend.ai import local_engine

    model = tmp_path / "dummy.gguf"
    model.write_bytes(b"GGUF")
    monkeypatch.setattr(
        local_engine,
        "get_binary_path",
        lambda *args, **kwargs: str(tmp_path / "missing.exe"),
    )
    engine = local_engine.LocalGGUFEngine()
    monkeypatch.setattr(engine, "is_healthy", lambda: False)

    with pytest.raises(EngineNotInstalledError) as excinfo:
        engine.start_server(str(model))

    assert "Components" in str(excinfo.value)
    assert issubclass(EngineNotInstalledError, ModelNotConfiguredError)


def test_engine_error_event_targets_components(monkeypatch):
    import asyncio

    from backend import event_router

    sent = []

    async def fake_broadcast(event_type, payload):
        sent.append((event_type, payload))

    monkeypatch.setattr(event_router.ws_manager, "broadcast", fake_broadcast)
    monkeypatch.setattr(event_router, "_get_session_title", lambda session_id: "Title")

    asyncio.run(
        event_router._chat_error("session-1", "hello", "install an engine", target="components")
    )

    assert sent[0][0] == "ERROR_CONFIG_MISSING"
    assert sent[0][1]["target"] == "components"
    assert sent[1][0] == "SESSION_UPDATED"
