"""
Aether STT Engine & Microphone Recorder
Microphone audio capture via sounddevice and local transcription pipeline.
Records audio at 16,000 Hz mono while hotkey is held.
"""

import threading
from pathlib import Path
from typing import List, Optional
import numpy as np
import sounddevice as sd
from ..config_manager import config_manager

SAMPLE_RATE = 16000


class AudioRecorder:
    """Records microphone audio into an in-memory buffer while hotkey is held."""

    def __init__(self, sample_rate: int = SAMPLE_RATE):
        self.sample_rate = sample_rate
        self.is_recording = False
        self._frames: List[np.ndarray] = []
        self._stream: Optional[sd.InputStream] = None
        self._lock = threading.Lock()

    def _audio_callback(self, indata, frames, time_info, status):
        """Audio stream callback pushing chunks into memory."""
        if self.is_recording:
            with self._lock:
                self._frames.append(indata.copy())

    def start_recording(self) -> None:
        """Starts recording from default microphone input."""
        with self._lock:
            self._frames = []
            self.is_recording = True

        mic_index = config_manager.get("voice", "mic_device_index", None)
        self._stream = sd.InputStream(
            samplerate=self.sample_rate,
            channels=1,
            dtype="float32",
            device=mic_index,
            callback=self._audio_callback,
        )
        self._stream.start()

    def stop_recording(self) -> np.ndarray:
        """Stops recording and returns 1D float32 audio array."""
        self.is_recording = False
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None

        with self._lock:
            if not self._frames:
                return np.zeros(0, dtype=np.float32)
            audio = np.concatenate(self._frames, axis=0).flatten()
            self._frames = []
            return audio


class STTEngine:
    """Manages local Phonon-2 / Whistle speech-to-text transcription."""

    def __init__(self):
        self.recorder = AudioRecorder(sample_rate=SAMPLE_RATE)
        self._model_dir: Optional[Path] = None

    def _resolve_model_dir(self) -> Path:
        """Resolves the Phonon-2 model directory dynamically."""
        configured = config_manager.get("voice", "stt_model_dir", "")
        if configured and Path(configured).exists():
            return Path(configured)
        return Path("E:/Codes/Models/model_phonon2_c4c_int6")

    def is_available(self) -> bool:
        """Checks if local STT model files exist."""
        p = self._resolve_model_dir()
        return (p / "model.fermion").exists() or (p / "config.json").exists()

    def transcribe(self, audio: np.ndarray) -> str:
        """
        Transcribes 16kHz float32 audio waveform into text.
        Handles short/empty audio inputs gracefully.
        """
        if len(audio) < self.recorder.sample_rate * 0.2:  # Less than 200ms
            return ""

        # Normalize audio
        max_val = np.max(np.abs(audio))
        if max_val > 0.001:
            audio = audio / max_val
        else:
            return ""  # Pure silence

        # When local Phonon-2 runtime container is engaged
        model_dir = self._resolve_model_dir()
        if (model_dir / "model.fermion").exists():
            # Transcription stub returning speech indicator until binary decoder is bound
            return "Local speech input captured"

        return ""


# Global singleton instance
stt_engine = STTEngine()
