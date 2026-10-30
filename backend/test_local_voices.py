"""Local TTS voice discovery and family-aware synthesis tests.

No model file, audio device, or network is required. Discovery is exercised
against temporary npz/folder sidecars, and the Kokoro path is driven by a fake
ONNX session so the padded token ids and style indexing are pinned.
"""

from pathlib import Path

import numpy as np
import pytest

from backend.ai import tts_engine as tts_module
from backend.ai.local_voices import (
    detect_family,
    discover_voice_ids,
    discover_voices,
    tokenize_with_vocab,
)
from backend.ai.tts_engine import LocalTTSEngine


class FakeConfig:
    def __init__(self, voice=None):
        self.voice = voice or {}

    def get(self, section, key=None, default=None):
        if section == "voice":
            return self.voice.get(key, default)
        return default


class FakeSession:
    """Minimal InferenceSession stand-in that records the input feed."""

    def __init__(self, samples=240):
        self.feed = None
        self.samples = samples

    def run(self, output_names, feed):
        self.feed = feed
        return [np.zeros(self.samples, dtype=np.float32), None]


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------


def test_discover_voices_reads_npz_archive(tmp_path):
    np.savez(
        tmp_path / "voices-v1.0.bin",
        af_alloy=np.zeros((2, 1, 4), dtype=np.float32),
        am_michael=np.zeros((2, 1, 4), dtype=np.float32),
    )

    voices = discover_voices(tmp_path / "model.onnx")

    assert [voice["id"] for voice in voices] == ["af_alloy", "am_michael"]
    assert all(voice["label"] for voice in voices)


def test_discover_voices_reads_voice_folder(tmp_path):
    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()
    (voices_dir / "af_heart.pt").write_bytes(b"")
    (voices_dir / "am_michael.pt").write_bytes(b"")
    (voices_dir / "notes.txt").write_text("ignored", encoding="utf-8")

    assert discover_voice_ids(tmp_path / "model.onnx") == ["af_heart", "am_michael"]


def test_discover_voices_without_a_sidecar_is_empty(tmp_path):
    assert discover_voice_ids(tmp_path / "model.onnx") == []


def test_discover_voices_before_the_model_exists_is_empty(tmp_path):
    assert discover_voice_ids(tmp_path / "missing" / "model.onnx") == []


# ---------------------------------------------------------------------------
# Family detection and tokenization
# ---------------------------------------------------------------------------


def test_detect_family_uses_graph_inputs():
    assert detect_family(["input_ids", "style", "speed"]) == "kokoro"
    assert detect_family(["input_ids", "speed"]) == "paradee"


def test_tokenize_with_vocab_matches_longest_phoneme_first():
    vocab = {"h": 1, "ə": 2, "l": 3, "oʊ": 4, "ˈ": 5}

    assert tokenize_with_vocab("həloʊ", vocab) == [1, 2, 3, 4]
    # Unknown symbols are skipped instead of emitting garbage ids.
    assert tokenize_with_vocab("h?ə", vocab) == [1, 2]


# ---------------------------------------------------------------------------
# Engine behavior
# ---------------------------------------------------------------------------


def test_default_voice_prefers_config_then_first_discovered(tmp_path, monkeypatch):
    np.savez(tmp_path / "voices.bin", bbb=np.zeros((2, 1, 4)), aaa=np.zeros((2, 1, 4)))
    engine = LocalTTSEngine()
    engine._config = {}
    monkeypatch.setattr(
        engine,
        "_resolve_paths",
        lambda: (tmp_path / "model.onnx", tmp_path / "config.json"),
    )

    assert engine.default_voice_id() == "bbb"
    engine._config = {"default_voice": "aaa"}
    assert engine.default_voice_id() == "aaa"


def test_style_vector_indexes_by_token_length_and_clamps(monkeypatch):
    engine = LocalTTSEngine()
    styles = np.arange(510 * 256, dtype=np.float32).reshape(510, 256)
    monkeypatch.setattr(engine, "_load_voice_styles", lambda voice_id: styles)

    vector = engine._style_vector("any", 3)
    assert vector.shape == (1, 256)
    assert np.allclose(vector[0], styles[3])

    clamped = engine._style_vector("any", 9999)
    assert np.allclose(clamped[0], styles[509])


def test_kokoro_synthesis_pads_tokens_and_indexes_style(monkeypatch):
    engine = LocalTTSEngine()
    engine._session = FakeSession(samples=480)
    engine._family = "kokoro"
    engine._vocab = {"h": 1, "ə": 2, "l": 3, "ˈ": 4, "oʊ": 5}
    engine._token_keys = tuple(sorted(engine._vocab, key=len, reverse=True))
    monkeypatch.setattr(tts_module, "config_manager", FakeConfig())
    monkeypatch.setattr(engine, "_read_config", lambda: {"default_voice": "af_heart"})
    monkeypatch.setattr(
        engine,
        "_resolve_paths",
        lambda: (Path("model.onnx"), Path("config.json")),
    )
    engine._model_path = Path("model.onnx")
    monkeypatch.setattr(engine, "phonemize", lambda text: "həlˈoʊ")

    captured = {}
    monkeypatch.setattr(
        engine,
        "_style_vector",
        lambda voice_id, length: captured.update(voice=voice_id, length=length)
        or np.ones((1, 256), dtype=np.float32),
    )

    audio = engine.synthesize("hello world")

    assert audio.size == 480
    assert captured["voice"] == "af_heart"
    ids = engine._session.feed["input_ids"][0]
    assert ids[0] == 0 and ids[-1] == 0
    assert list(ids[1:-1]) == [1, 2, 3, 4, 5]
    assert captured["length"] == len(ids)
    assert engine._session.feed["style"].shape == (1, 256)


def test_voice_resolution_uses_default_when_empty(monkeypatch):
    engine = LocalTTSEngine()
    monkeypatch.setattr(
        engine, "_read_config", lambda: {"default_voice": "am_michael"}
    )

    assert engine.resolve_voice_id("") == "am_michael"
    assert engine.resolve_voice_id("  af_heart  ") == "af_heart"
