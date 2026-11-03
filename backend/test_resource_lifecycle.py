"""Idle unload of the local model and the embedding index.

Auto-unload frees memory but must never interrupt an in-flight call. These
tests pin the timeout maths, the "0 disables it" rule, and the busy guard.
"""

import asyncio

import pytest

from backend import resource_lifecycle as rl
from backend.ai import embedder as embedder_module
from backend.ai import llm_router as llm_router_module
from backend.config_schema import (
    DEFAULT_EMBEDDING_IDLE_UNLOAD_MINUTES,
    DEFAULT_LLM_IDLE_UNLOAD_MINUTES,
    normalize_ai_provider,
    normalize_idle_minutes,
)


class FakeRouter:
    def __init__(self, healthy: bool = True, mode: str = "local_gguf"):
        self.healthy = healthy
        self.mode = mode
        self.stops = 0

    def active_mode(self) -> str:
        return self.mode

    def is_healthy(self) -> bool:
        return self.healthy

    def stop_server(self) -> None:
        self.stops += 1


@pytest.fixture
def env(monkeypatch):
    """A controllable clock plus per-key fake config values."""
    values = {
        "llm_idle_unload_minutes": DEFAULT_LLM_IDLE_UNLOAD_MINUTES,
        "embedding_idle_unload_minutes": DEFAULT_EMBEDDING_IDLE_UNLOAD_MINUTES,
    }
    clock = {"t": 1000.0}
    monkeypatch.setattr(rl, "_now", lambda: clock["t"])
    monkeypatch.setattr(
        rl.config_manager,
        "get",
        lambda section, key, default=None: values.get(key, default),
    )
    for name in ("_llm_active", "_embedding_active"):
        monkeypatch.setattr(rl, name, 0)
    monkeypatch.setattr(rl, "_llm_last_used", 0.0)
    monkeypatch.setattr(rl, "_embedding_last_used", 0.0)
    return clock, values


def test_normalize_idle_minutes_treats_zero_and_negatives_as_disabled():
    assert normalize_idle_minutes(0, 15) == 0
    assert normalize_idle_minutes(-5, 15) == 0
    assert normalize_idle_minutes("30", 15) == 30
    assert normalize_idle_minutes("nonsense", 15) == 15
    assert normalize_idle_minutes(10_000_000, 15) == 24 * 60


def test_ai_provider_defaults_the_idle_timeouts():
    normalized = normalize_ai_provider({})
    assert normalized["llm_idle_unload_minutes"] == DEFAULT_LLM_IDLE_UNLOAD_MINUTES
    assert (
        normalized["embedding_idle_unload_minutes"]
        == DEFAULT_EMBEDDING_IDLE_UNLOAD_MINUTES
    )


def test_llm_unloads_after_the_timeout(env, monkeypatch):
    clock, _values = env
    fake = FakeRouter()
    monkeypatch.setattr(llm_router_module, "llm_router", fake)
    monkeypatch.setattr(rl, "_llm_last_used", 1000.0)
    clock["t"] = 1000.0 + DEFAULT_LLM_IDLE_UNLOAD_MINUTES * 60 + 1

    asyncio.run(rl.reclaim_once())

    assert fake.stops == 1
    assert rl._llm_last_used == 0.0


def test_an_active_turn_is_never_unloaded(env, monkeypatch):
    clock, _values = env
    fake = FakeRouter()
    monkeypatch.setattr(llm_router_module, "llm_router", fake)
    monkeypatch.setattr(rl, "_llm_last_used", 1000.0)
    monkeypatch.setattr(rl, "_llm_active", 1)
    clock["t"] = 1000.0 + 999 * 60

    asyncio.run(rl.reclaim_once())

    assert fake.stops == 0


def test_zero_minutes_disables_llm_unload(env, monkeypatch):
    clock, values = env
    values["llm_idle_unload_minutes"] = 0
    fake = FakeRouter()
    monkeypatch.setattr(llm_router_module, "llm_router", fake)
    monkeypatch.setattr(rl, "_llm_last_used", 1000.0)
    clock["t"] = 1000.0 + 999 * 60

    asyncio.run(rl.reclaim_once())

    assert fake.stops == 0


def test_embedding_releases_after_its_timeout(env, monkeypatch):
    clock, _values = env
    released = []
    monkeypatch.setattr(
        embedder_module, "release", lambda: (released.append(1), True)[1]
    )
    monkeypatch.setattr(rl, "_embedding_last_used", 500.0)
    clock["t"] = 500.0 + DEFAULT_EMBEDDING_IDLE_UNLOAD_MINUTES * 60 + 1

    asyncio.run(rl.reclaim_once())

    assert released == [1]
    assert rl._embedding_last_used == 0.0


def test_activity_context_resets_the_timer(monkeypatch):
    clock = {"t": 42.0}
    monkeypatch.setattr(rl, "_now", lambda: clock["t"])
    monkeypatch.setattr(rl, "_llm_active", 0)
    monkeypatch.setattr(rl, "_llm_last_used", 0.0)

    with rl.llm_activity():
        assert rl._llm_active == 1

    assert rl._llm_active == 0
    assert rl._llm_last_used == 42.0


def test_embedder_release_reports_whether_anything_was_loaded(monkeypatch):
    monkeypatch.setattr(embedder_module, "_embedder", None)
    assert embedder_module.release() is False

    monkeypatch.setattr(embedder_module, "_embedder", object())
    assert embedder_module.release() is True
    assert embedder_module.is_loaded() is False
