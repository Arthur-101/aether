"""
Aether TTS Engine — local Paradee 24kHz synthesis plus optional cloud TTS.
Ultra-fast onnxruntime synthesis using Paradee ONNX and sounddevice audio playback.
Zero PyTorch dependency, low latency, 24,000 Hz sample rate.
"""

import base64
import io
import json
import logging
import re
from pathlib import Path
from typing import Optional, Tuple
import httpx
import numpy as np
import sounddevice as sd
import soundfile as sf
from ..config_manager import config_manager, find_model_file, get_models_dir
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


class ParadeeTTSEngine:
    """Manages Paradee ONNX session, vocab tokenization, and audio output."""

    def __init__(self):
        self._session = None
        self._vocab = None
        self._model_path: Optional[Path] = None

    def _resolve_paths(self) -> tuple[Path, Path]:
        """Resolves the ONNX model path and config.json path dynamically."""
        configured = config_manager.get("voice", "tts_model_path", "")
        if configured and Path(configured).exists():
            model_p = Path(configured)
        else:
            discovered = find_model_file(
                ["paradee.onnx", "**/paradee.onnx", "*.onnx"], get_models_dir()
            )
            model_p = Path(discovered) if discovered else get_models_dir() / "paradee.onnx"

        # config.json lives next to /models or in an ancestor models folder
        config_candidates = [
            model_p.parent.parent / "config.json",
            model_p.parent / "config.json",
            get_models_dir() / "models" / "config.json",
            get_models_dir() / "config.json",
        ]
        config_p = next((p for p in config_candidates if p.exists()), config_candidates[0])
        return model_p, config_p

    def _ensure_loaded(self) -> None:
        """Lazy-loads the ONNX runtime session and token vocabulary."""
        if self._session is not None:
            return

        model_p, config_p = self._resolve_paths()
        if not model_p.exists():
            raise FileNotFoundError(f"Paradee ONNX model not found at: {model_p}")

        import onnxruntime as ort
        # Use CPU provider with optimal thread count
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 4
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        self._session = ort.InferenceSession(str(model_p), sess_options=opts, providers=["CPUExecutionProvider"])
        self._model_path = model_p

        if config_p.exists():
            with open(config_p, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            self._vocab = cfg.get("vocab", {})
        else:
            self._vocab = {}

    def is_available(self) -> bool:
        """True when either the selected cloud provider or local Paradee can run."""
        return self._cloud_configured() or self._local_available()

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
        """Maps characters to vocab token IDs."""
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
        """Synthesizes text into 24kHz float32 audio waveform."""
        self._ensure_loaded()
        token_ids = self.tokenize(text)

        input_ids = np.array([token_ids], dtype=np.int64)
        speed_tensor = np.array([speed], dtype=np.float32)

        outputs = self._session.run(None, {
            "input_ids": input_ids,
            "speed": speed_tensor
        })

        # Waveform shape: (1, num_samples) -> squeeze to (num_samples,)
        audio = np.squeeze(outputs[0]).astype(np.float32)
        # Normalize audio amplitude to avoid clipping
        max_val = np.max(np.abs(audio))
        if max_val > 1.0:
            audio = audio / max_val
        return audio

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
        """Linearly resamples provider audio to Paradee's 24 kHz output rate."""
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

    def speak(self, text: str, speed: float = 1.0, blocking: bool = True) -> None:
        """Synthesizes text and streams to speakers via sounddevice.

        Cloud is only used when the user explicitly selected a cloud TTS
        provider with a stored key. Cloud failures fall back to local Paradee;
        local failures never escalate to a provider.
        """
        speed = float(config_manager.get("voice", "tts_speed", speed) or speed)
        provider = self._provider()
        if provider != "local":
            if self._cloud_configured():
                try:
                    audio = self._synthesize_cloud(provider, text, speed)
                    if audio.size:
                        sd.play(audio, samplerate=SAMPLE_RATE)
                        if blocking:
                            sd.wait()
                        return
                    logger.warning(
                        "Cloud TTS (%s) returned no audio; falling back to local Paradee.",
                        provider,
                    )
                except Exception as exc:
                    logger.warning(
                        "Cloud TTS (%s) failed: %s; falling back to local Paradee.",
                        provider,
                        exc,
                    )
            else:
                logger.warning(
                    "Cloud TTS (%s) has no saved key; using local Paradee.",
                    provider,
                )

        audio = self.synthesize(text, speed=speed)
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
tts_engine = ParadeeTTSEngine()
