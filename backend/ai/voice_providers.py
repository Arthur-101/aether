"""Cloud voice provider registry shared by STT, TTS, and the Settings UI.

Keys are read from the existing ``ai_provider.cloud_providers`` store, so voice
does not ask for a second copy of the same credential. Models and voices are
voice-specific and must not reuse the chat model field.
"""

from typing import Any, Dict, List, Optional

LOCAL_PROVIDER = "local"
VOICE_PROVIDER_IDS = ("openai", "groq", "mistral", "gemini", "openrouter")
VOICE_PROVIDERS: Dict[str, Dict[str, Any]] = {
    "openai": {
        "label": "OpenAI",
        "stt_model": "gpt-4o-transcribe",
        "tts_model": "gpt-4o-mini-tts",
        "tts_voice": "alloy",
        "stt_models": (
            "gpt-4o-transcribe",
            "gpt-4o-mini-transcribe",
            "whisper-1",
        ),
        "tts_models": ("gpt-4o-mini-tts", "tts-1", "tts-1-hd"),
        "voices": (
            "alloy",
            "ash",
            "ballad",
            "coral",
            "echo",
            "fable",
            "nova",
            "onyx",
            "sage",
            "shimmer",
            "verse",
        ),
        "base_url": "https://api.openai.com/v1",
        "stt_transport": "litellm",
        "tts_transport": "litellm",
    },
    "groq": {
        "label": "Groq",
        "stt_model": "whisper-large-v3-turbo",
        "tts_model": "canopylabs/orpheus-v1-english",
        "tts_voice": "troy",
        "stt_models": ("whisper-large-v3-turbo", "whisper-large-v3"),
        "tts_models": (
            "canopylabs/orpheus-v1-english",
            "canopylabs/orpheus-arabic-saudi",
        ),
        "voices": ("autumn", "diana", "hannah", "austin", "daniel", "troy"),
        "base_url": "https://api.groq.com/openai/v1",
        "stt_transport": "litellm",
        "tts_transport": "litellm",
    },
    "mistral": {
        "label": "Mistral",
        "stt_model": "voxtral-mini-transcribe-3-0",
        "tts_model": "voxtral-mini-tts-3-0",
        "tts_voice": "en_paul_neutral",
        "stt_models": (
            "voxtral-mini-transcribe-3-0",
            "voxtral-small-transcribe-3-0",
        ),
        "tts_models": (
            "voxtral-mini-tts-3-0",
            "voxtral-mini-tts-realtime-3-0",
        ),
        "voices": ("en_paul_neutral",),
        "base_url": "https://api.mistral.ai/v1",
        "stt_transport": "litellm",
        "tts_transport": "litellm",
    },
    "gemini": {
        "label": "Google Gemini",
        "stt_model": "gemini-3.5-transcribe",
        "tts_model": "gemini-3.8-flash-tts",
        "tts_voice": "Kore",
        "stt_models": ("gemini-3.5-transcribe",),
        "tts_models": (
            "gemini-3.8-flash-tts",
            "gemini-3.8-flash-lite-tts",
        ),
        "voices": (
            "Zephyr",
            "Puck",
            "Charon",
            "Kore",
            "Fenrir",
            "Leda",
            "Orus",
            "Aoede",
            "Callirrhoe",
            "Autonoe",
            "Enceladus",
            "Iapetus",
            "Umbriel",
            "Algieba",
            "Despina",
            "Erinome",
            "Algenib",
            "Rasalgethi",
            "Laomedeia",
            "Achernar",
            "Alnilam",
            "Schedar",
            "Gacrux",
            "Pulcherrima",
            "Achird",
            "Zubenelgenubi",
            "Vindemiatrix",
            "Sadachbia",
            "Sadaltager",
            "Sulafat",
        ),
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "stt_transport": "litellm",
        "tts_transport": "gemini",
    },
    "openrouter": {
        "label": "OpenRouter",
        "stt_model": "openai/whisper-large-v3",
        "tts_model": "mistralai/voxtral-mini-tts-2603",
        "tts_voice": "en_paul_neutral",
        "stt_models": (
            "openai/whisper-large-v3",
            "openai/whisper-1",
            "elevenlabs/scribe-v2",
        ),
        "tts_models": (
            "mistralai/voxtral-mini-tts-2603",
            "x-ai/grok-voice-tts-1.0",
            "microsoft/mai-voice-2",
        ),
        "voices": (
            "en_paul_neutral",
            "eve",
            "ara",
            "rex",
            "sal",
            "leo",
            "en-US-Harper:MAI-Voice-2",
        ),
        "base_url": "https://openrouter.ai/api/v1",
        "stt_transport": "openrouter",
        "tts_transport": "openrouter",
    },
}


def provider_entry(provider: str) -> Optional[Dict[str, Any]]:
    """Returns the registry entry for a cloud provider, if it is known."""
    return VOICE_PROVIDERS.get(str(provider or "").strip().lower())


def default_stt_model(provider: str) -> str:
    entry = provider_entry(provider)
    return str(entry.get("stt_model") or "") if entry else ""


def default_tts_model(provider: str) -> str:
    entry = provider_entry(provider)
    return str(entry.get("tts_model") or "") if entry else ""


def default_tts_voice(provider: str) -> str:
    entry = provider_entry(provider)
    return str(entry.get("tts_voice") or "") if entry else ""


def provider_api_key(provider: str) -> str:
    """Reads the provider key from the shared AI credential store."""
    # Imported lazily so config_schema can import this registry without a cycle.
    from ..config_manager import config_manager

    provider = str(provider or "").strip().lower()
    if not provider:
        return ""
    providers = config_manager.get("ai_provider", "cloud_providers", {}) or {}
    entry = providers.get(provider) if isinstance(providers, dict) else None
    key = str((entry or {}).get("api_key") or "").strip() if isinstance(entry, dict) else ""
    if key:
        return key
    # Older configs mirror the selected provider's key at the top level.
    selected = str(
        config_manager.get("ai_provider", "cloud_provider", "") or ""
    ).strip().lower()
    if selected == provider:
        return str(config_manager.get("ai_provider", "api_key", "") or "").strip()
    return ""


def provider_model(provider: str, configured: str, kind: str) -> str:
    """Returns a user override or the registry default for STT/TTS."""
    value = str(configured or "").strip()
    if value:
        return value
    return default_stt_model(provider) if kind == "stt" else default_tts_model(provider)


def provider_voices(provider: str) -> List[str]:
    entry = provider_entry(provider)
    return list(entry.get("voices") or ()) if entry else []
