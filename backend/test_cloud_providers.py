"""Tests for per-provider cloud credentials and OpenRouter model qualification."""

import sys
import types

import pytest

from backend.ai import cloud_engine
from backend.ai.errors import ModelNotConfiguredError
from backend.config_schema import (
    DEFAULT_CLOUD_PROVIDERS,
    normalize_ai_provider,
    normalize_config,
)


class FakeConfigManager:
    def __init__(self, ai_provider):
        self.ai_provider = ai_provider

    def get(self, section, key=None, default=None):
        if section == "ai_provider" and key:
            return self.ai_provider.get(key, default)
        return default


def _select(monkeypatch, provider, model, api_key="test-key"):
    monkeypatch.setattr(
        cloud_engine,
        "config_manager",
        FakeConfigManager(
            {
                "cloud_provider": provider,
                "cloud_providers": {provider: {"api_key": api_key, "model": model}},
            }
        ),
    )
    return cloud_engine.CloudEngine()


def test_normalize_fills_every_cloud_provider():
    ai = normalize_ai_provider({})

    assert set(ai["cloud_providers"]) == set(DEFAULT_CLOUD_PROVIDERS)
    assert ai["cloud_provider"] == "gemini"
    assert ai["api_key"] == ""
    assert ai["cloud_model"] == DEFAULT_CLOUD_PROVIDERS["gemini"]["model"]


def test_legacy_single_key_migrates_into_the_selected_provider():
    ai = normalize_ai_provider(
        {
            "mode": "cloud",
            "cloud_provider": "groq",
            "cloud_model": "llama-3.3-70b-versatile",
            "api_key": "  gsk_legacy  ",
        }
    )

    assert ai["cloud_providers"]["groq"] == {
        "api_key": "gsk_legacy",
        "model": "llama-3.3-70b-versatile",
    }
    assert ai["api_key"] == "gsk_legacy"
    assert ai["cloud_model"] == "llama-3.3-70b-versatile"
    assert ai["mode"] == "cloud"


def test_each_provider_keeps_its_own_key_and_model():
    ai = normalize_ai_provider(
        {
            "cloud_provider": "openai",
            "cloud_providers": {
                "gemini": {"api_key": "gemini-key", "model": "gemini-2.5-pro"},
                "openai": {"api_key": "openai-key", "model": "gpt-4.1-mini"},
            },
        }
    )

    assert ai["cloud_providers"]["gemini"] == {
        "api_key": "gemini-key",
        "model": "gemini-2.5-pro",
    }
    assert ai["cloud_providers"]["openrouter"] == DEFAULT_CLOUD_PROVIDERS["openrouter"]
    assert ai["api_key"] == "openai-key"
    assert ai["cloud_model"] == "gpt-4.1-mini"


def test_unknown_provider_falls_back_without_losing_other_settings():
    ai = normalize_ai_provider({"mode": "cloud", "cloud_provider": "not-a-provider"})

    assert ai["cloud_provider"] == "gemini"
    assert ai["mode"] == "cloud"


def test_mistral_is_a_supported_cloud_provider(monkeypatch):
    ai = normalize_ai_provider({"mode": "cloud", "cloud_provider": "mistral"})

    assert ai["cloud_provider"] == "mistral"
    assert ai["cloud_providers"]["mistral"] == DEFAULT_CLOUD_PROVIDERS["mistral"]
    assert _select(monkeypatch, "mistral", "mistral-small-latest")._qualified_model() == (
        "mistral/mistral-small-latest"
    )


def test_normalize_config_keeps_cloud_credentials_alongside_other_sections():
    config = normalize_config({"storage": {"notes_theme": "meadow"}})

    assert config["storage"]["notes_theme"] == "meadow"
    assert "openrouter" in config["ai_provider"]["cloud_providers"]


def test_openrouter_slug_from_the_copy_button_is_prefixed(monkeypatch):
    engine = _select(monkeypatch, "openrouter", "anthropic/claude-sonnet-4.5")

    assert engine._qualified_model() == "openrouter/anthropic/claude-sonnet-4.5"


def test_openrouter_prefixed_model_is_not_prefixed_twice(monkeypatch):
    engine = _select(monkeypatch, "openrouter", "openrouter/anthropic/claude-sonnet-4.5")

    assert engine._qualified_model() == "openrouter/anthropic/claude-sonnet-4.5"


def test_groq_vendor_slash_models_keep_the_existing_qualification(monkeypatch):
    engine = _select(monkeypatch, "groq", "meta-llama/llama-4-scout-17b-16e-instruct")

    assert engine._qualified_model() == "meta-llama/llama-4-scout-17b-16e-instruct"


def test_plain_openai_model_gets_the_provider_prefix(monkeypatch):
    engine = _select(monkeypatch, "openai", "gpt-4o-mini")

    assert engine._qualified_model() == "openai/gpt-4o-mini"


def test_selected_provider_api_key_is_used(monkeypatch):
    engine = _select(monkeypatch, "openrouter", "openai/gpt-4o-mini", "sk-or-selected")

    assert engine._selected_credentials()["api_key"] == "sk-or-selected"


def test_empty_cloud_model_is_reported(monkeypatch):
    engine = _select(monkeypatch, "openrouter", "")

    with pytest.raises(ModelNotConfiguredError):
        engine._qualified_model()


def test_gemini_3_uses_the_provider_default_temperature():
    assert cloud_engine.effective_temperature(
        "gemini/gemini-3.5-flash-lite", 0.7
    ) == 1.0
    assert cloud_engine.effective_temperature(
        "openrouter/google/gemini-3-pro", 0.7
    ) == 1.0
    assert cloud_engine.effective_temperature(
        "gemini/gemini-2.5-flash", 0.7
    ) == 0.7
    assert cloud_engine.effective_temperature(
        "gemini/gemini-3.5-flash-lite", 1.0
    ) == 1.0


def test_reasoning_effort_maps_per_provider():
    assert cloud_engine.reasoning_effort(
        "gemini", "gemini-3.5-flash-lite", True
    ) == "medium"
    assert cloud_engine.reasoning_effort(
        "gemini", "gemini-3.5-flash-lite", False
    ) == "none"
    assert cloud_engine.reasoning_effort(
        "anthropic", "claude-sonnet-4.5", False
    ) == "none"
    assert cloud_engine.reasoning_effort(
        "openrouter", "nvidia/nemotron-3.5-super-vl:free", True
    ) == "medium"
    assert cloud_engine.reasoning_effort(
        "openrouter", "nvidia/nemotron-3.5-super-vl:free", False
    ) == "minimal"
    assert cloud_engine.reasoning_effort("groq", "llama-3.3-70b-versatile", True) is None
    assert cloud_engine.reasoning_effort("mistral", "codestral-2508", True) is None


class FakeMessage:
    def __init__(self):
        self.content = "Done."
        self.reasoning_content = ""
        self.tool_calls = []
        self.thinking_blocks = None
        self.reasoning_details = None


class FakeChoice:
    def __init__(self):
        self.message = FakeMessage()


class FakeResponse:
    def __init__(self):
        self.choices = [FakeChoice()]


class FakeLiteLLM:
    def __init__(self):
        self.kwargs = None

    def completion(self, **kwargs):
        self.kwargs = kwargs
        return FakeResponse()


def _fake_litellm(monkeypatch):
    fake = FakeLiteLLM()
    utils = types.ModuleType("litellm.utils")
    utils.supports_reasoning = (
        lambda model, custom_llm_provider=None: "gpt-4o-mini" not in str(model)
    )
    utils.supports_none_reasoning_effort = (
        lambda model, custom_llm_provider=None: False
    )
    fake.utils = utils
    monkeypatch.setitem(sys.modules, "litellm", fake)
    monkeypatch.setitem(sys.modules, "litellm.utils", utils)
    return fake


def test_cloud_complete_sends_reasoning_effort_and_raises_the_token_cap(monkeypatch):
    fake = _fake_litellm(monkeypatch)
    engine = _select(monkeypatch, "gemini", "gemini-3.5-flash-lite")

    result = engine.complete(
        [{"role": "user", "content": "think hard"}],
        thinking_mode=True,
    )

    assert result["content"] == "Done."
    assert fake.kwargs["reasoning_effort"] == "medium"
    assert fake.kwargs["max_tokens"] >= 4096
    assert fake.kwargs["temperature"] == 1.0


def test_cloud_complete_disables_reasoning_for_normal_mode(monkeypatch):
    fake = _fake_litellm(monkeypatch)
    engine = _select(monkeypatch, "gemini", "gemini-3.5-flash-lite")

    engine.complete([{"role": "user", "content": "be quick"}], thinking_mode=False)

    assert fake.kwargs["reasoning_effort"] == "none"
    assert fake.kwargs["max_tokens"] >= 2048
    assert fake.kwargs["temperature"] == 1.0


def test_cloud_complete_skips_reasoning_for_non_reasoning_models(monkeypatch):
    fake = _fake_litellm(monkeypatch)
    engine = _select(monkeypatch, "openai", "gpt-4o-mini")

    engine.complete([{"role": "user", "content": "hello"}], thinking_mode=True)

    assert "reasoning_effort" not in fake.kwargs
    assert fake.kwargs["max_tokens"] == 1024


def test_cloud_complete_retries_without_reasoning_when_rejected(monkeypatch):
    calls = []

    class RejectingLiteLLM:
        def completion(self, **kwargs):
            calls.append(dict(kwargs))
            if "reasoning_effort" in kwargs:
                raise ValueError("Unsupported parameter: reasoning_effort")
            return FakeResponse()

    _fake_litellm(monkeypatch)
    monkeypatch.setitem(sys.modules, "litellm", RejectingLiteLLM())
    engine = _select(monkeypatch, "gemini", "gemini-3.5-flash-lite")

    result = engine.complete(
        [{"role": "user", "content": "think hard"}], thinking_mode=True
    )

    assert result["content"] == "Done."
    assert len(calls) == 2
    assert "reasoning_effort" in calls[0]
    assert "reasoning_effort" not in calls[1]
