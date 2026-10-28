"""Voice provider tests: normalization, key reuse, routing, and fallback.

No microphone, model file, network, or audio device is required. Cloud calls
are replaced at the transport boundary so the tests also pin the exact request
shape sent to each provider.
"""

import base64
import io
import types

import numpy as np
import pytest
import soundfile as sf

from backend import config_manager as config_module
from backend.ai import stt_engine as stt_module
from backend.ai import tts_engine as tts_module
from backend.ai.stt_engine import SAMPLE_RATE as STT_RATE
from backend.ai.stt_engine import STTEngine
from backend.ai.tts_engine import SAMPLE_RATE as TTS_RATE
from backend.ai.tts_engine import ParadeeTTSEngine
from backend.ai.voice_providers import (
    LOCAL_TTS_VOICE_ID,
    LOCAL_TTS_VOICES,
    VOICE_PROVIDER_IDS,
    VOICE_PROVIDERS,
    default_stt_model,
    default_tts_model,
    default_tts_voice,
)
from backend.config_schema import normalize_config, normalize_voice


class FakeConfig:
    def __init__(self, voice=None, ai=None):
        self.voice = voice or {}
        self.ai = ai or {}

    def get(self, section, key=None, default=None):
        if section == "voice":
            return self.voice.get(key, default)
        if section == "ai_provider":
            return self.ai.get(key, default)
        return default


def patch_config(monkeypatch, voice=None, ai=None):
    fake = FakeConfig(voice, ai)
    monkeypatch.setattr(stt_module, "config_manager", fake)
    monkeypatch.setattr(tts_module, "config_manager", fake)
    monkeypatch.setattr(config_module, "config_manager", fake)
    return fake


class FakeResponse:
    def __init__(self, payload=None, content=b""):
        self.payload = payload
        self.content = content

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


def cloud_ai(provider, key="test-key"):
    return {
        "cloud_provider": provider,
        "cloud_providers": {provider: {"api_key": key, "model": "chat-model"}},
    }


def wav_bytes(samples=None, rate=TTS_RATE):
    if samples is None:
        samples = np.zeros(rate // 10, dtype=np.float32)
    buffer = io.BytesIO()
    sf.write(buffer, samples, rate, format="WAV", subtype="PCM_16")
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Registry and normalization
# ---------------------------------------------------------------------------


def test_registry_has_every_cloud_provider_with_voice_defaults():
    assert set(VOICE_PROVIDER_IDS) == {
        "openai",
        "groq",
        "mistral",
        "gemini",
        "openrouter",
    }
    for provider in VOICE_PROVIDER_IDS:
        assert default_stt_model(provider)
        assert default_tts_model(provider)
        assert default_tts_voice(provider)
        assert provider in VOICE_PROVIDERS


def test_local_voice_is_the_default():
    voice = normalize_voice({})

    assert voice["stt_provider"] == "local"
    assert voice["tts_provider"] == "local"
    assert voice["stt_model"] == ""
    assert voice["tts_model"] == ""
    assert voice["tts_voice_id"] == "af_heart"


def test_local_voice_catalog_matches_the_paradee_default():
    assert LOCAL_TTS_VOICE_ID == "af_heart"
    assert [voice["id"] for voice in LOCAL_TTS_VOICES] == [LOCAL_TTS_VOICE_ID]
    assert all(voice["label"] for voice in LOCAL_TTS_VOICES)
    assert normalize_voice({"tts_provider": "local"})["tts_voice_id"] == (
        LOCAL_TTS_VOICE_ID
    )


def test_cloud_voice_fills_provider_defaults_without_touching_chat_model():
    voice = normalize_voice({"stt_provider": "groq", "tts_provider": "gemini"})

    assert voice["stt_model"] == "whisper-large-v3-turbo"
    assert voice["tts_model"] == "gemini-3.8-flash-tts"
    assert voice["tts_voice_id"] == "Kore"


def test_cloud_voice_keeps_custom_model_and_voice_ids():
    voice = normalize_voice(
        {
            "stt_provider": "openai",
            "stt_model": "my-custom-stt",
            "tts_provider": "mistral",
            "tts_model": "my-custom-tts",
            "tts_voice_id": "en_paul_cheerful",
        }
    )

    assert voice["stt_model"] == "my-custom-stt"
    assert voice["tts_model"] == "my-custom-tts"
    assert voice["tts_voice_id"] == "en_paul_cheerful"


def test_switching_cloud_tts_replaces_the_local_voice_placeholder():
    voice = normalize_voice(
        {"tts_provider": "mistral", "tts_voice_id": "af_heart"}
    )

    assert voice["tts_voice_id"] == "en_paul_neutral"


def test_invalid_voice_provider_falls_back_to_local():
    voice = normalize_voice(
        {
            "stt_provider": "not-a-provider",
            "tts_provider": "also-not-a-provider",
            "tts_voice_id": "custom",
        }
    )

    assert voice["stt_provider"] == "local"
    assert voice["tts_provider"] == "local"
    assert voice["tts_voice_id"] == "custom"


def test_normalize_config_includes_voice_section():
    normalized = normalize_config(
        {
            "voice": {
                "stt_provider": "openrouter",
                "tts_provider": "groq",
                "tts_speed": 9,
                "mic_device_index": "3",
            }
        }
    )

    voice = normalized["voice"]
    assert voice["stt_provider"] == "openrouter"
    assert voice["stt_model"] == "openai/whisper-large-v3"
    assert voice["tts_provider"] == "groq"
    assert voice["tts_model"] == "canopylabs/orpheus-v1-english"
    assert voice["tts_voice_id"] == "troy"
    assert voice["tts_speed"] == 2.0
    assert voice["mic_device_index"] == 3


# ---------------------------------------------------------------------------
# STT routing
# ---------------------------------------------------------------------------


def test_cloud_stt_uses_the_saved_provider_key(monkeypatch):
    patch_config(
        monkeypatch,
        voice={"stt_provider": "groq"},
        ai=cloud_ai("groq"),
    )
    engine = STTEngine()
    calls = []
    monkeypatch.setattr(
        engine,
        "_transcribe_cloud",
        lambda provider, audio: calls.append(provider) or "hello",
    )
    monkeypatch.setattr(
        engine,
        "_transcribe_local",
        lambda audio: pytest.fail("cloud success must not run local"),
    )

    audio = np.ones(STT_RATE, dtype=np.float32) * 0.1
    assert engine.transcribe(audio) == "hello"
    assert calls == ["groq"]


def test_cloud_stt_empty_result_falls_back_to_local(monkeypatch):
    patch_config(
        monkeypatch,
        voice={"stt_provider": "gemini"},
        ai=cloud_ai("gemini"),
    )
    engine = STTEngine()
    monkeypatch.setattr(engine, "_transcribe_cloud", lambda provider, audio: "")
    monkeypatch.setattr(engine, "_transcribe_local", lambda audio: "local text")

    audio = np.ones(STT_RATE, dtype=np.float32) * 0.1
    assert engine.transcribe(audio) == "local text"


def test_local_stt_never_escalates_to_cloud(monkeypatch):
    patch_config(
        monkeypatch,
        voice={"stt_provider": "local"},
        ai=cloud_ai("groq"),
    )
    engine = STTEngine()
    monkeypatch.setattr(
        engine,
        "_transcribe_cloud",
        lambda provider, audio: pytest.fail("local must not upload audio"),
    )
    monkeypatch.setattr(engine, "_transcribe_local", lambda audio: "local text")

    audio = np.ones(STT_RATE, dtype=np.float32) * 0.1
    assert engine.transcribe(audio) == "local text"


def test_cloud_stt_is_available_without_local_files(monkeypatch, tmp_path):
    patch_config(
        monkeypatch,
        voice={"stt_provider": "groq"},
        ai=cloud_ai("groq"),
    )
    engine = STTEngine()
    monkeypatch.setattr(engine, "_resolve_model_dir", lambda: tmp_path)
    monkeypatch.setattr(engine, "_runtime_python", lambda: None)

    assert engine.is_available() is True


def test_cloud_stt_without_key_reports_unavailable(monkeypatch, tmp_path):
    patch_config(
        monkeypatch,
        voice={"stt_provider": "groq"},
        ai=cloud_ai("groq", key=""),
    )
    engine = STTEngine()
    monkeypatch.setattr(engine, "_resolve_model_dir", lambda: tmp_path)
    monkeypatch.setattr(engine, "_runtime_python", lambda: None)

    assert engine.is_available() is False


def test_cloud_stt_without_key_falls_back_to_local(monkeypatch):
    patch_config(
        monkeypatch,
        voice={"stt_provider": "groq"},
        ai=cloud_ai("groq", key=""),
    )
    engine = STTEngine()
    monkeypatch.setattr(
        engine,
        "_transcribe_cloud",
        lambda provider, audio: pytest.fail("no key means no cloud call"),
    )
    monkeypatch.setattr(engine, "_transcribe_local", lambda audio: "local text")

    audio = np.ones(STT_RATE, dtype=np.float32) * 0.1
    assert engine.transcribe(audio) == "local text"


def test_openrouter_stt_posts_multipart_audio(monkeypatch):
    patch_config(
        monkeypatch,
        voice={"stt_provider": "openrouter", "stt_model": "openai/whisper-large-v3"},
        ai=cloud_ai("openrouter"),
    )
    captured = {}

    def fake_post(url, headers=None, data=None, files=None, timeout=None):
        captured.update(
            url=url, headers=headers, data=data, files=files, timeout=timeout
        )
        return FakeResponse(payload={"text": "  transcribed  "})

    monkeypatch.setattr(stt_module, "httpx", types.SimpleNamespace(post=fake_post))
    engine = STTEngine()

    audio = np.ones(STT_RATE, dtype=np.float32) * 0.1
    assert engine._transcribe_cloud("openrouter", audio) == "transcribed"
    assert captured["url"] == stt_module.OPENROUTER_TRANSCRIPTION_URL
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["data"] == {"model": "openai/whisper-large-v3"}
    filename, payload, mime = captured["files"]["file"]
    assert filename == "audio.wav"
    assert mime == "audio/wav"
    decoded, rate = sf.read(io.BytesIO(payload), dtype="float32")
    assert rate == STT_RATE
    assert decoded.size == audio.size


def test_litellm_stt_uses_provider_prefixed_model(monkeypatch):
    patch_config(
        monkeypatch,
        voice={"stt_provider": "mistral", "stt_model": "voxtral-mini-transcribe-3-0"},
        ai=cloud_ai("mistral"),
    )
    captured = {}

    def fake_transcription(**kwargs):
        captured.update(kwargs)
        return types.SimpleNamespace(text="  hello world  ")

    import litellm

    monkeypatch.setattr(litellm, "transcription", fake_transcription)
    engine = STTEngine()

    audio = np.ones(STT_RATE, dtype=np.float32) * 0.1
    assert engine._transcribe_cloud("mistral", audio) == "hello world"
    assert captured["model"] == "mistral/voxtral-mini-transcribe-3-0"
    assert captured["api_key"] == "test-key"
    assert captured["file"][0] == "audio.wav"


# ---------------------------------------------------------------------------
# TTS routing
# ---------------------------------------------------------------------------


def test_cloud_tts_plays_provider_audio(monkeypatch):
    patch_config(
        monkeypatch,
        voice={"tts_provider": "openai"},
        ai=cloud_ai("openai"),
    )
    engine = ParadeeTTSEngine()
    played = {}
    monkeypatch.setattr(
        engine, "_synthesize_cloud", lambda provider, text, speed: np.ones(240, dtype=np.float32)
    )
    monkeypatch.setattr(engine, "synthesize", lambda text, speed: pytest.fail("cloud success must not run local"))
    monkeypatch.setattr(tts_module.sd, "play", lambda audio, samplerate: played.update(audio=audio, rate=samplerate))
    monkeypatch.setattr(tts_module.sd, "wait", lambda: None)

    engine.speak("hello")
    assert played["rate"] == TTS_RATE
    assert played["audio"].size == 240


def test_cloud_tts_failure_falls_back_to_local(monkeypatch):
    patch_config(
        monkeypatch,
        voice={"tts_provider": "gemini"},
        ai=cloud_ai("gemini"),
    )
    engine = ParadeeTTSEngine()
    played = {}
    monkeypatch.setattr(
        engine,
        "_synthesize_cloud",
        lambda provider, text, speed: (_ for _ in ()).throw(RuntimeError("offline")),
    )
    monkeypatch.setattr(engine, "synthesize", lambda text, speed: np.ones(120, dtype=np.float32))
    monkeypatch.setattr(tts_module.sd, "play", lambda audio, samplerate: played.update(audio=audio, rate=samplerate))
    monkeypatch.setattr(tts_module.sd, "wait", lambda: None)

    engine.speak("hello")
    assert played["audio"].size == 120


def test_local_tts_never_escalates_to_cloud(monkeypatch):
    patch_config(
        monkeypatch,
        voice={"tts_provider": "local"},
        ai=cloud_ai("openai"),
    )
    engine = ParadeeTTSEngine()
    played = {}
    monkeypatch.setattr(
        engine,
        "_synthesize_cloud",
        lambda provider, text, speed: pytest.fail("local must not call cloud"),
    )
    monkeypatch.setattr(engine, "synthesize", lambda text, speed: np.ones(80, dtype=np.float32))
    monkeypatch.setattr(tts_module.sd, "play", lambda audio, samplerate: played.update(audio=audio))
    monkeypatch.setattr(tts_module.sd, "wait", lambda: None)

    engine.speak("hello")
    assert played["audio"].size == 80


def test_cloud_tts_is_available_without_local_model(monkeypatch, tmp_path):
    patch_config(
        monkeypatch,
        voice={"tts_provider": "openai"},
        ai=cloud_ai("openai"),
    )
    engine = ParadeeTTSEngine()
    monkeypatch.setattr(engine, "_resolve_paths", lambda: (tmp_path / "missing.onnx", tmp_path / "config.json"))

    assert engine.is_available() is True


def test_cloud_tts_without_key_reports_unavailable(monkeypatch, tmp_path):
    patch_config(
        monkeypatch,
        voice={"tts_provider": "openai"},
        ai=cloud_ai("openai", key=""),
    )
    engine = ParadeeTTSEngine()
    monkeypatch.setattr(engine, "_resolve_paths", lambda: (tmp_path / "missing.onnx", tmp_path / "config.json"))

    assert engine.is_available() is False


def test_cloud_tts_without_key_falls_back_to_local(monkeypatch):
    patch_config(
        monkeypatch,
        voice={"tts_provider": "openai"},
        ai=cloud_ai("openai", key=""),
    )
    engine = ParadeeTTSEngine()
    played = {}
    monkeypatch.setattr(
        engine,
        "_synthesize_cloud",
        lambda provider, text, speed: pytest.fail("no key means no cloud call"),
    )
    monkeypatch.setattr(engine, "synthesize", lambda text, speed: np.ones(60, dtype=np.float32))
    monkeypatch.setattr(tts_module.sd, "play", lambda audio, samplerate: played.update(audio=audio))
    monkeypatch.setattr(tts_module.sd, "wait", lambda: None)

    engine.speak("hello")
    assert played["audio"].size == 60


def test_split_text_respects_groq_200_character_limit():
    text = ("This is a sentence about voice output. " * 20).strip()
    chunks = ParadeeTTSEngine._split_text(text, 200)

    assert len(chunks) > 1
    assert all(0 < len(chunk) <= 200 for chunk in chunks)
    assert " ".join(chunks) == text


def test_decode_audio_and_resample_to_24k():
    source = np.linspace(-0.25, 0.25, 4800, dtype=np.float32)
    decoded, rate = ParadeeTTSEngine._decode_audio(wav_bytes(source, rate=48000))

    assert rate == 48000
    assert decoded.shape == source.shape
    resampled = ParadeeTTSEngine._resample(decoded, rate, TTS_RATE)
    assert resampled.shape == (2400,)
    assert resampled.dtype == np.float32


def test_litellm_tts_sends_speed_only_to_openai(monkeypatch):
    import litellm

    captured = []

    def fake_speech(**kwargs):
        captured.append(kwargs)
        return types.SimpleNamespace(content=wav_bytes())

    monkeypatch.setattr(litellm, "speech", fake_speech)
    engine = ParadeeTTSEngine()

    engine._cloud_tts_litellm("openai", "gpt-4o-mini-tts", "alloy", "hi", 1.25, "key")
    engine._cloud_tts_litellm("groq", "canopylabs/orpheus-v1-english", "troy", "hi", 1.25, "key")

    assert captured[0]["model"] == "openai/gpt-4o-mini-tts"
    assert captured[0]["speed"] == 1.25
    assert captured[0]["response_format"] == "wav"
    assert captured[1]["model"] == "groq/canopylabs/orpheus-v1-english"
    assert "speed" not in captured[1]
    assert captured[1]["response_format"] == "wav"


def test_openrouter_tts_posts_openai_compatible_speech(monkeypatch):
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured.update(url=url, headers=headers, json=json, timeout=timeout)
        return FakeResponse(content=b"mp3-bytes")

    monkeypatch.setattr(tts_module, "httpx", types.SimpleNamespace(post=fake_post))
    engine = ParadeeTTSEngine()

    result = engine._cloud_tts_openrouter(
        "mistralai/voxtral-mini-tts-2603", "en_paul_neutral", "hello", "or-key"
    )

    assert result == b"mp3-bytes"
    assert captured["url"] == tts_module.OPENROUTER_SPEECH_URL
    assert captured["headers"]["Authorization"] == "Bearer or-key"
    assert captured["json"] == {
        "model": "mistralai/voxtral-mini-tts-2603",
        "input": "hello",
        "voice": "en_paul_neutral",
        "response_format": "mp3",
    }


def test_gemini_tts_reads_the_last_audio_block(monkeypatch):
    captured = {}
    first = base64.b64encode(b"first").decode("ascii")
    last = base64.b64encode(b"last").decode("ascii")

    def fake_post(url, headers=None, json=None, timeout=None):
        captured.update(url=url, headers=headers, json=json)
        return FakeResponse(
            payload={
                "steps": [
                    {
                        "type": "model_output",
                        "content": [{"type": "audio", "data": first}],
                    },
                    {
                        "type": "model_output",
                        "content": [{"type": "audio", "data": last}],
                    },
                ]
            }
        )

    monkeypatch.setattr(tts_module, "httpx", types.SimpleNamespace(post=fake_post))
    engine = ParadeeTTSEngine()

    result = engine._cloud_tts_gemini(
        "gemini-3.8-flash-tts", "Kore", "hello", "gemini-key"
    )

    assert result == b"last"
    assert captured["url"] == tts_module.GEMINI_INTERACTIONS_URL
    assert captured["headers"]["x-goog-api-key"] == "gemini-key"
    assert captured["json"]["model"] == "gemini-3.8-flash-tts"
    assert captured["json"]["response_format"] == {"type": "audio"}
    assert captured["json"]["generation_config"]["speech_config"] == [{"voice": "Kore"}]


def test_cloud_tts_stitches_chunks_with_a_short_gap(monkeypatch):
    patch_config(
        monkeypatch,
        voice={
            "tts_provider": "groq",
            "tts_model": "canopylabs/orpheus-v1-english",
            "tts_voice_id": "troy",
        },
        ai=cloud_ai("groq"),
    )
    engine = ParadeeTTSEngine()
    wav = wav_bytes(np.zeros(2400, dtype=np.float32), rate=TTS_RATE)
    monkeypatch.setattr(
        engine,
        "_cloud_tts_litellm",
        lambda provider, model, voice, text, speed, api_key: wav,
    )

    text = ("Sentence one is spoken here. " * 12).strip()
    audio = engine._synthesize_cloud("groq", text, 1.0)
    chunks = engine._split_text(text, 200)

    assert len(chunks) > 1
    expected = len(chunks) * 2400 + (len(chunks) - 1) * int(
        TTS_RATE * tts_module.CLOUD_CHUNK_GAP_S
    )
    assert audio.size == expected
