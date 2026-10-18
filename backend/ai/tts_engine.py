"""
Aether TTS Engine — Paradee 24kHz Synthesis
Ultra-fast onnxruntime synthesis using Paradee ONNX and sounddevice audio playback.
Zero PyTorch dependency, low latency, 24,000 Hz sample rate.
"""

import json
from pathlib import Path
from typing import Optional
import numpy as np
import sounddevice as sd
import soundfile as sf
from ..config_manager import config_manager

SAMPLE_RATE = 24000


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
            # Check default local directory
            model_p = Path("E:/Codes/Models/models/onnx/paradee.onnx")

        # config.json lives next to /models or parent directory
        config_candidates = [
            model_p.parent.parent / "config.json",
            model_p.parent / "config.json",
            Path("E:/Codes/Models/models/config.json"),
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
        """Checks if model files exist without loading them."""
        model_p, _ = self._resolve_paths()
        return model_p.exists()

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

    def speak(self, text: str, speed: float = 1.0, blocking: bool = True) -> None:
        """Synthesizes text and streams to speakers via sounddevice."""
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
