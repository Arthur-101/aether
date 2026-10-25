"""Tests for per-provider cloud credentials and OpenRouter model qualification."""

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
    ai = normalize_ai_provider({"mode": "cloud", "cloud_provider": "mistral"})

    assert ai["cloud_provider"] == "gemini"
    assert ai["mode"] == "cloud"


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
