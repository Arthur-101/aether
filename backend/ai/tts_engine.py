"""
Aether TTS Engine — local ONNX synthesis plus optional cloud TTS.

The local path is model-family agnostic: an ONNX graph that takes a ``style``
input is treated as Kokoro-family (phoneme tokens + a voice style vector) and
anything else as the older single-voice character-token graph. Voices are
discovered from the model's own sidecar files, never from a hardcoded catalog.
Synthesis runs on onnxruntime with no PyTorch dependency, at 24,000 Hz.
"""

import base64
import io
import json
import logging
import re
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple
import httpx
import numpy as np
import sounddevice as sd
import soundfile as sf
from ..config_manager import config_manager, find_model_file, get_models_dir
from .local_voices import (
    detect_family,
    discover_voices,
    find_voice_archive,
    tokenize_with_vocab,
)
from .voice_providers import (
    VOICE_PROVIDER_IDS,
    default_tts_voice,
    provider_api_key,
    provider_model,
)

logger = logging.getLogger("aether.tts")
SAMPLE_RATE = 24000
CLOUD_TIMEOUT_S = 120.0
CLOUD_TEXT_CHUNK = 4000
# Kokoro caps a style vector at 510 token positions. Chunk text so a single
# utterance stays well below that; prosody is preserved because splits happen
# on sentence boundaries.
KOKORO_TEXT_CHUNK = 320
KOKORO_MAX_TOKENS = 508
KOKORO_CHUNK_GAP_S = 0.08
# Groq Orpheus rejects inputs over 200 characters; the rest are kept well
# below their provider limits so one spoken reply rarely needs more than a call.
CLOUD_TTS_CHUNK_LIMITS = {
    "openai": 4000,
    "groq": 200,
    "mistral": 4000,
    "gemini": 4000,
    "openrouter": 4000,
}
CLOUD_CHUNK_GAP_S = 0.12
OPENROUTER_SPEECH_URL = "https://openrouter.ai/api/v1/audio/speech"
GEMINI_INTERACTIONS_URL = (
    "https://generativelanguage.googleapis.com/v1beta/interactions"
)


class LocalTTSEngine:
    """Manages a local ONNX session, voice discovery, and audio output."""

    def __init__(self):
        self._session = None
        self._vocab: Dict[str, int] = {}
        self._token_keys: Tuple[str, ...] = ()
        self._config: Optional[Dict[str, Any]] = None
        self._config_path: Optional[Path] = None
        self._model_path: Optional[Path] = None
        self._family = ""
        self._input_names: Tuple[str, ...] = ()
        self._voices: Optional[List[Dict[str, str]]] = None
        self._voices_path: Optional[Path] = None
        self._voice_archive = None
        self._style_cache: Dict[str, np.ndarray] = {}
        self._phonemizer_ready = False

    def _resolve_paths(self) -> tuple[Path, Path]:
        """Resolves the ONNX model path and config.json path dynamically."""
        configured = config_manager.get("voice", "tts_model_path", "")
        if configured and Path(configured).exists():
            model_p = Path(configured)
        else:
            discovered = find_model_file(["*.onnx"], get_models_dir())
            model_p = (
                Path(discovered) if discovered else get_models_dir() / "model.onnx"
            )

        # Prefer a config beside the model, then an ancestor models folder.
        config_candidates = [
            model_p.parent / "config.json",
            model_p.parent.parent / "config.json",
            get_models_dir() / "models" / "config.json",
            get_models_dir() / "config.json",
        ]
        config_p = next(
            (p for p in config_candidates if p.exists()), config_candidates[0]
        )
        return model_p, config_p

    def _read_config(self) -> Dict[str, Any]:
        """Loads the model's config.json once, without creating a session."""
        _, config_p = self._resolve_paths()
        if self._config is not None and self._config_path == config_p:
            return self._config
        config: Dict[str, Any] = {}
        if config_p.exists():
            try:
                with open(config_p, "r", encoding="utf-8") as handle:
                    loaded = json.load(handle)
                if isinstance(loaded, dict):
                    config = loaded
            except Exception as exc:
                logger.warning("Could not read local TTS config %s: %s", config_p, exc)
        self._config = config
        self._config_path = config_p
        return config

    def _release_local_model(self) -> None:
        """Drops the loaded session and caches so a new model path takes effect."""
        if self._voice_archive is not None:
            try:
                self._voice_archive.close()
            except Exception:
                pass
        self._session = None
        self._vocab = {}
        self._token_keys = ()
        self._config = None
        self._config_path = None
        self._model_path = None
        self._family = ""
        self._input_names = ()
        self._voices = None
        self._voices_path = None
        self._voice_archive = None
        self._style_cache = {}

    def _ensure_loaded(self) -> None:
        """Lazy-loads the ONNX runtime session and token vocabulary."""
        model_p, _ = self._resolve_paths()
        if self._session is not None:
            if self._model_path == model_p:
                return
            self._release_local_model()

        if not model_p.exists():
            raise FileNotFoundError(f"Local TTS ONNX model not found at: {model_p}")

        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 4
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        # Constant-folding warnings for Kokoro's half-precision graph are noise.
        opts.log_severity_level = 3

        session = ort.InferenceSession(
            str(model_p), sess_options=opts, providers=["CPUExecutionProvider"]
        )
        self._session = session
        self._model_path = model_p
        self._input_names = tuple(item.name for item in session.get_inputs())
        self._family = detect_family(self._input_names)

        vocab = self._read_config().get("vocab", {})
        self._vocab = vocab if isinstance(vocab, dict) else {}
        self._token_keys = tuple(
            sorted((key for key in self._vocab if key), key=len, reverse=True)
        )

    def is_available(self) -> bool:
        """True when either the selected cloud provider or local model can run."""
        return self._cloud_configured() or self._local_available()

    def available_voices(self) -> List[Dict[str, str]]:
        """Returns the voices bundled with the selected local model."""
        model_p, _ = self._resolve_paths()
        if self._voices is None or self._voices_path != model_p:
            self._voices = discover_voices(model_p)
            self._voices_path = model_p
        return list(self._voices)

    def default_voice_id(self) -> str:
        """Returns the model-declared default voice, else its first voice."""
        config = self._read_config()
        for key in ("default_voice", "default_voice_id"):
            value = config.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        voices = self.available_voices()
        return voices[0]["id"] if voices else ""

    def resolve_voice_id(self, voice_id: str = "") -> str:
        """Returns an explicit voice, or the model default when it is empty."""
        return str(voice_id or "").strip() or self.default_voice_id()

    def _ensure_phonemizer(self) -> None:
        """Points phonemizer at the bundled espeak-ng once per process."""
        if self._phonemizer_ready:
            return
        try:
            import espeakng_loader
            from phonemizer.backend.espeak.wrapper import EspeakWrapper

            EspeakWrapper.set_library(str(espeakng_loader.get_library_path()))
            EspeakWrapper.set_data_path(str(espeakng_loader.get_data_path()))
        except Exception as exc:
            logger.warning("espeak-ng setup failed: %s", exc)
        self._phonemizer_ready = True

    def phonemize(self, text: str) -> str:
        """Converts text to IPA phonemes for Kokoro-family models."""
        self._ensure_phonemizer()
        from phonemizer import phonemize

        try:
            return phonemize(
                text,
                language="en-us",
                backend="espeak",
                strip=True,
                preserve_punctuation=True,
                with_stress=True,
            )
        except Exception as exc:
            raise RuntimeError(
                "Local TTS could not phonemize the reply. Install phonemizer-fork "
                "and espeakng-loader (see backend/requirements.txt)."
            ) from exc

    def tokenize_phonemes(self, phonemes: str) -> List[int]:
        """Maps IPA text onto the model's phoneme vocab."""
        return tokenize_with_vocab(phonemes, self._vocab, self._token_keys)

    def _load_voice_styles(self, voice_id: str) -> np.ndarray:
        """Loads the style matrix for one voice, from the archive or a file."""
        cached = self._style_cache.get(voice_id)
        if cached is not None:
            return cached

        model_p = self._model_path or self._resolve_paths()[0]
        archive = find_voice_archive(model_p)
        if archive is not None:
            if self._voice_archive is None:
                self._voice_archive = np.load(archive, allow_pickle=False)
            if voice_id in self._voice_archive.files:
                styles = np.asarray(self._voice_archive[voice_id], dtype=np.float32)
                self._style_cache[voice_id] = styles
                return styles

        voice_file = model_p.parent / "voices" / f"{voice_id}.pt"
        if voice_file.exists():
            try:
                import torch

                loaded = torch.load(str(voice_file), map_location="cpu")
                if isinstance(loaded, dict):
                    loaded = next(iter(loaded.values()))
                styles = np.asarray(loaded, dtype=np.float32)
                self._style_cache[voice_id] = styles
                return styles
            except Exception as exc:
                logger.warning("Could not load voice file %s: %s", voice_file, exc)

        raise RuntimeError(
            f"Voice '{voice_id or 'default'}' is not available for this local model. "
            "Pick another voice in Settings → Voice Engine."
        )

    def _style_vector(self, voice_id: str, token_length: int) -> np.ndarray:
        """Returns the style row indexed by the padded token length."""
        styles = self._load_voice_styles(voice_id)
        index = max(0, min(int(token_length), len(styles) - 1))
        return styles[index].reshape(1, -1).astype(np.float32)

    def _local_available(self) -> bool:
        """Checks if local model files exist without loading them."""
        model_p, _ = self._resolve_paths()
        return model_p.exists()

    def _provider(self) -> str:
        """Returns the selected TTS provider, defaulting to local."""
        provider = str(
            config_manager.get("voice", "tts_provider", "local") or "local"
        ).strip().lower()
        return provider if provider in VOICE_PROVIDER_IDS else "local"

    def _cloud_configured(self) -> bool:
        provider = self._provider()
        return provider != "local" and bool(provider_api_key(provider))

    def tokenize(self, text: str) -> list[int]:
        """Maps characters to vocab token IDs (character-token models only)."""
        self._ensure_loaded()
        if not self._vocab:
            return [ord(c) % 178 for c in text]

        tokens = []
        for char in text.lower():
            if char in self._vocab:
                tokens.append(self._vocab[char])
            elif " " in self._vocab:
                tokens.append(self._vocab[" "])

        # Fallback to silence token if empty
        return tokens if tokens else [self._vocab.get(" ", 16)]

    def synthesize(self, text: str, speed: float = 1.0) -> np.ndarray:
        """Synthesizes text into a 24kHz float32 waveform."""
        self._ensure_loaded()
        if self._family == "kokoro":
            return self._synthesize_kokoro(text, speed)
        return self._synthesize_paradee(text, speed)

    def _synthesize_paradee(self, text: str, speed: float) -> np.ndarray:
        """Character-token models: input ids plus speed, one shot."""
        token_ids = self.tokenize(text)
        outputs = self._session.run(
            None,
            {
                "input_ids": np.array([token_ids], dtype=np.int64),
                "speed": np.array([speed], dtype=np.float32),
            },
        )
        return self._normalize_wave(np.squeeze(outputs[0]))

    def _synthesize_kokoro(self, text: str, speed: float) -> np.ndarray:
        """Phoneme-token models: per-chunk style vector indexed by token count."""
        voice_id = self.resolve_voice_id(
            str(config_manager.get("voice", "tts_voice_id", "") or "")
        )
        chunks = self._split_text(text, KOKORO_TEXT_CHUNK)
        if not chunks:
            return np.zeros(0, dtype=np.float32)

        parts: List[np.ndarray] = []
        for chunk in chunks:
            phonemes = self.phonemize(chunk)
            token_ids = self.tokenize_phonemes(phonemes)
            if not token_ids:
                continue
            # Kokoro expects a pad token (0) at both ends; style is indexed by
            # this padded length.
            token_ids = token_ids[: KOKORO_MAX_TOKENS - 2]
            padded = [0, *token_ids, 0]
            style = self._style_vector(voice_id, len(padded))
            outputs = self._session.run(
                None,
                {
                    "input_ids": np.array([padded], dtype=np.int64),
                    "style": style,
                    "speed": np.array([speed], dtype=np.float32),
                },
            )
            parts.append(np.asarray(outputs[0]).reshape(-1))

        if not parts:
            return np.zeros(0, dtype=np.float32)
        gap = np.zeros(int(SAMPLE_RATE * KOKORO_CHUNK_GAP_S), dtype=np.float32)
        joined: List[np.ndarray] = []
        for index, part in enumerate(parts):
            if index:
                joined.append(gap)
            joined.append(part)
        logger.info(
            "Local TTS (%s) synthesized %d chars in %d chunk(s) with voice %s.",
            self._family,
            len(text),
            len(parts),
            voice_id or "default",
        )
        return self._normalize_wave(np.concatenate(joined))

    @staticmethod
    def _normalize_wave(audio: np.ndarray) -> np.ndarray:
        """Flattens to mono float32 and prevents clipping."""
        wave = np.asarray(audio, dtype=np.float32).reshape(-1)
        if wave.size:
            peak = float(np.max(np.abs(wave)))
            if peak > 1.0:
                wave = wave / peak
        return wave

    @staticmethod
    def _split_text(text: str, limit: int) -> list[str]:
        """Splits speech into provider-sized chunks at natural boundaries."""
        cleaned = " ".join(str(text or "").split())
        if not cleaned:
            return []
        if limit <= 0 or len(cleaned) <= limit:
            return [cleaned]

        chunks: list[str] = []
        remaining = cleaned
        while len(remaining) > limit:
            window = remaining[:limit]
            split_at = -1
            for marker in (". ", "! ", "? ", "; ", ", "):
                split_at = max(split_at, window.rfind(marker))
            if split_at < limit // 2:
                split_at = window.rfind(" ")
            if split_at <= 0:
                split_at = limit
            else:
                split_at += 1  # Keep the punctuation with the spoken chunk.
            piece = remaining[:split_at].strip()
            if piece:
                chunks.append(piece)
            remaining = remaining[split_at:].strip()
        if remaining:
            chunks.append(remaining)
        return chunks

    @staticmethod
    def _resample(audio: np.ndarray, source_rate: int, target_rate: int) -> np.ndarray:
        """Linearly resamples provider audio to the engine's 24 kHz output rate."""
        if audio.size == 0 or source_rate == target_rate:
            return np.ascontiguousarray(audio, dtype=np.float32)
        target_size = max(1, int(round(audio.size * target_rate / source_rate)))
        source_times = np.arange(audio.size, dtype=np.float64)
        target_times = np.linspace(0, audio.size - 1, target_size, dtype=np.float64)
        return np.interp(target_times, source_times, audio).astype(np.float32)

    @staticmethod
    def _decode_audio(data: bytes) -> tuple[np.ndarray, int]:
        """Decodes WAV/MP3 provider responses into mono float32 samples."""
        if not data:
            raise ValueError("provider returned empty audio")
        audio, rate = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
        if audio.shape[1] > 1:
            audio = audio.mean(axis=1)
        else:
            audio = audio[:, 0]
        return np.ascontiguousarray(audio, dtype=np.float32), int(rate)

    def _cloud_tts_litellm(
        self,
        provider: str,
        model: str,
        voice: str,
        text: str,
        speed: float,
        api_key: str,
    ) -> bytes:
        """Uses LiteLLM's native speech handler (OpenAI, Groq, Mistral)."""
        import litellm

        kwargs = {
            "model": f"{provider}/{model}",
            "input": text,
            "voice": voice,
            "api_key": api_key,
            "timeout": CLOUD_TIMEOUT_S,
            "response_format": "wav",
        }
        # Only OpenAI honours a speed multiplier; Groq and Mistral reject it.
        if provider == "openai":
            kwargs["speed"] = max(0.25, min(4.0, float(speed)))
        response = litellm.speech(**kwargs)
        return bytes(response.content or b"")

    def _cloud_tts_openrouter(
        self, model: str, voice: str, text: str, api_key: str
    ) -> bytes:
        """Calls OpenRouter's OpenAI-compatible speech endpoint directly."""
        response = httpx.post(
            OPENROUTER_SPEECH_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "input": text,
                "voice": voice,
                "response_format": "mp3",
            },
            timeout=CLOUD_TIMEOUT_S,
        )
        response.raise_for_status()
        return response.content

    def _cloud_tts_gemini(
        self, model: str, voice: str, text: str, api_key: str
    ) -> bytes:
        """Calls the Gemini Interactions audio endpoint and extracts WAV data."""
        response = httpx.post(
            GEMINI_INTERACTIONS_URL,
            headers={
                "x-goog-api-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "input": [
                    {
                        "type": "user_input",
                        "content": [{"type": "text", "text": text}],
                    }
                ],
                "response_format": {"type": "audio"},
                "generation_config": {
                    "speech_config": [{"voice": voice}],
                },
            },
            timeout=CLOUD_TIMEOUT_S,
        )
        response.raise_for_status()
        payload = response.json()

        encoded = ""
        for step in reversed(payload.get("steps") or []):
            if not isinstance(step, dict) or step.get("type") != "model_output":
                continue
            for block in reversed(step.get("content") or []):
                if (
                    isinstance(block, dict)
                    and block.get("type") == "audio"
                    and block.get("data")
                ):
                    encoded = str(block["data"])
                    break
            if encoded:
                break
        if not encoded:
            # Some SDK-shaped responses expose the last audio block directly.
            output_audio = payload.get("output_audio")
            if isinstance(output_audio, dict):
                encoded = str(output_audio.get("data") or "")
        if not encoded:
            raise ValueError("Gemini TTS returned no audio")
        return base64.b64decode(encoded)

    def _synthesize_cloud(
        self, provider: str, text: str, speed: float
    ) -> np.ndarray:
        """Synthesizes one reply through the selected provider at 24 kHz."""
        api_key = provider_api_key(provider)
        if not api_key:
            raise RuntimeError(f"{provider} API key is missing")
        model = provider_model(
            provider,
            str(config_manager.get("voice", "tts_model", "") or ""),
            "tts",
        )
        if not model:
            raise RuntimeError(f"{provider} TTS model is not configured")
        voice = str(config_manager.get("voice", "tts_voice_id", "") or "").strip()
        if not voice:
            voice = default_tts_voice(provider)

        limit = CLOUD_TTS_CHUNK_LIMITS.get(provider, CLOUD_TEXT_CHUNK)
        chunks = self._split_text(text, limit)
        if not chunks:
            return np.zeros(0, dtype=np.float32)

        parts: list[np.ndarray] = []
        for chunk in chunks:
            if provider == "gemini":
                data = self._cloud_tts_gemini(model, voice, chunk, api_key)
            elif provider == "openrouter":
                data = self._cloud_tts_openrouter(model, voice, chunk, api_key)
            else:
                data = self._cloud_tts_litellm(
                    provider, model, voice, chunk, speed, api_key
                )
            audio, rate = self._decode_audio(data)
            parts.append(self._resample(audio, rate, SAMPLE_RATE))

        gap = np.zeros(int(SAMPLE_RATE * CLOUD_CHUNK_GAP_S), dtype=np.float32)
        joined: list[np.ndarray] = []
        for index, part in enumerate(parts):
            if index:
                joined.append(gap)
            joined.append(part)
        audio = np.concatenate(joined).astype(np.float32)
        peak = float(np.max(np.abs(audio))) if audio.size else 0.0
        if peak > 1.0:
            audio = audio / peak
        logger.info(
            "Cloud TTS (%s/%s) synthesized %d chars in %d chunk(s).",
            provider,
            model,
            len(text),
            len(chunks),
        )
        return audio

    def speak(
        self,
        text: str,
        speed: float = 1.0,
        blocking: bool = True,
        cancel: Optional[threading.Event] = None,
    ) -> None:
        """Synthesizes text and streams to speakers via sounddevice.

        Cloud is only used when the user explicitly selected a cloud TTS
        provider with a stored key. Cloud failures fall back to the local model;
        local failures never escalate to a provider.

        ``cancel`` lets a caller abandon a queued utterance: it is checked
        before synthesis and again before playback, so a superseded request
        never talks over the one that replaced it.
        """
        if cancel is not None and cancel.is_set():
            return
        speed = float(config_manager.get("voice", "tts_speed", speed) or speed)
        provider = self._provider()
        if provider != "local":
            if self._cloud_configured():
                try:
                    audio = self._synthesize_cloud(provider, text, speed)
                    if cancel is not None and cancel.is_set():
                        return
                    if audio.size:
                        sd.play(audio, samplerate=SAMPLE_RATE)
                        if blocking:
                            sd.wait()
                        return
                    logger.warning(
                        "Cloud TTS (%s) returned no audio; falling back to the local model.",
                        provider,
                    )
                except Exception as exc:
                    logger.warning(
                        "Cloud TTS (%s) failed: %s; falling back to the local model.",
                        provider,
                        exc,
                    )
            else:
                logger.warning(
                    "Cloud TTS (%s) has no saved key; using the local model.",
                    provider,
                )

        if cancel is not None and cancel.is_set():
            return
        audio = self.synthesize(text, speed=speed)
        if cancel is not None and cancel.is_set():
            return
        sd.play(audio, samplerate=SAMPLE_RATE)
        if blocking:
            sd.wait()

    def save_wav(self, text: str, output_path: str, speed: float = 1.0) -> str:
        """Synthesizes text and writes output to a WAV file."""
        audio = self.synthesize(text, speed=speed)
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(out), audio, samplerate=SAMPLE_RATE)
        return str(out)


# Global singleton instance
tts_engine = LocalTTSEngine()
# Backwards-compatible alias for callers written against the old class name.
ParadeeTTSEngine = LocalTTSEngine
