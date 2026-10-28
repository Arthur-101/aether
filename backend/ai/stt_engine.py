"""
Aether STT Engine & Microphone Recorder
Microphone audio capture via sounddevice and local transcription pipeline.
Records audio at 16,000 Hz mono while hotkey is held.

Phonon-2 runs in an isolated Python runtime under ``bin/stt-runtime`` so the
backend never imports Torch. The runtime loads the model once in a resident
worker and answers newline-delimited JSON requests over stdin/stdout.
"""

import base64
import io
import json
import logging
import os
import queue
import subprocess
import sys
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional

import httpx
import numpy as np
import soundfile as sf
import sounddevice as sd
from ..config_manager import config_manager, find_model_dir, get_models_dir
from .voice_providers import (
    VOICE_PROVIDER_IDS,
    provider_api_key,
    provider_model,
)

logger = logging.getLogger("aether.stt")
SAMPLE_RATE = 16000
PROTOCOL_PREFIX = "@@AETHER_STT@@ "
RUNTIME_RELATIVE = Path("bin") / "stt-runtime" / "Scripts" / "python.exe"
MODEL_FILE = "model.fermion"
START_TIMEOUT_S = 120.0
FAILURE_COOLDOWN_S = 30.0
CLOUD_TIMEOUT_S = 60.0
OPENROUTER_TRANSCRIPTION_URL = (
    "https://openrouter.ai/api/v1/audio/transcriptions"
)


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
    """Manages local Phonon-2 speech-to-text transcription."""

    def __init__(self):
        self.recorder = AudioRecorder(sample_rate=SAMPLE_RATE)
        self._model_dir: Optional[Path] = None
        self._proc: Optional[subprocess.Popen] = None
        self._proc_model: Optional[Path] = None
        self._queue: Optional["queue.Queue[Dict[str, Any]]"] = None
        self._stderr_tail: Deque[str] = deque(maxlen=20)
        self._lock = threading.Lock()
        self._next_id = 0
        self._retry_after = 0.0
        self._missing_runtime_logged = False

    def _resolve_model_dir(self) -> Path:
        """Resolves the Phonon-2 model directory dynamically."""
        configured = config_manager.get("voice", "stt_model_dir", "")
        if configured and Path(configured).exists():
            return Path(configured)
        discovered = find_model_dir(
            ["*phonon2*", "*phonon*"], get_models_dir()
        )
        return Path(discovered) if discovered else get_models_dir()

    def _runtime_candidates(self) -> List[Path]:
        """Returns every plausible location of the isolated STT runtime."""
        candidates: List[Path] = []
        override = os.environ.get("AETHER_STT_RUNTIME", "").strip()
        if override:
            override_path = Path(override).expanduser()
            candidates.append(override_path)
            if override_path.is_dir():
                candidates.append(override_path / "Scripts" / "python.exe")
                candidates.append(override_path / "python.exe")

        bundle = getattr(sys, "_MEIPASS", "")
        if bundle:
            candidates.append(Path(bundle) / RUNTIME_RELATIVE)
            candidates.append(Path(bundle) / "aether" / RUNTIME_RELATIVE)

        # Development checkout: backend/ai/stt_engine.py -> aether/bin/...
        candidates.append(Path(__file__).resolve().parents[2] / RUNTIME_RELATIVE)
        candidates.append(Path(sys.executable).resolve().parent / RUNTIME_RELATIVE)

        unique: List[Path] = []
        seen = set()
        for candidate in candidates:
            if candidate not in seen:
                seen.add(candidate)
                unique.append(candidate)
        return unique

    def _runtime_python(self) -> Optional[Path]:
        """Returns the isolated runtime's Python, if it is installed."""
        for candidate in self._runtime_candidates():
            if candidate.is_file():
                return candidate
        return None

    def _worker_script(self) -> Optional[Path]:
        """Returns the worker script bundled beside this module."""
        candidate = Path(__file__).with_name("stt_worker.py")
        if candidate.is_file():
            return candidate
        bundle = getattr(sys, "_MEIPASS", "")
        if bundle:
            candidate = Path(bundle) / "backend" / "ai" / "stt_worker.py"
            if candidate.is_file():
                return candidate
        return None

    def _provider(self) -> str:
        """Returns the selected STT provider, defaulting to local."""
        provider = str(
            config_manager.get("voice", "stt_provider", "local") or "local"
        ).strip().lower()
        return provider if provider in VOICE_PROVIDER_IDS else "local"

    def _cloud_configured(self) -> bool:
        provider = self._provider()
        return provider != "local" and bool(provider_api_key(provider))

    def _local_available(self) -> bool:
        """Checks if the local model files and isolated runtime exist."""
        p = self._resolve_model_dir()
        return (p / MODEL_FILE).exists() and self._runtime_python() is not None

    def is_available(self) -> bool:
        """True when either the selected cloud provider or local STT can run."""
        return self._cloud_configured() or self._local_available()

    @staticmethod
    def _format_tail(tail: Deque[str]) -> str:
        lines = [line for line in list(tail)[-3:] if line]
        return f": {' | '.join(lines)}" if lines else ""

    def _pump_stdout(
        self,
        proc: subprocess.Popen,
        messages: "queue.Queue[Dict[str, Any]]",
    ) -> None:
        try:
            for line in proc.stdout:
                line = line.strip()
                if not line:
                    continue
                if line.startswith(PROTOCOL_PREFIX):
                    try:
                        messages.put(json.loads(line[len(PROTOCOL_PREFIX):]))
                    except json.JSONDecodeError:
                        logger.debug("Phonon-2 sent a malformed protocol line")
                else:
                    logger.debug("Phonon-2: %s", line)
        except (OSError, ValueError):
            pass
        finally:
            messages.put({"event": "eof"})

    def _pump_stderr(self, proc: subprocess.Popen, tail: Deque[str]) -> None:
        try:
            for line in proc.stderr:
                line = line.rstrip()
                if line:
                    tail.append(line)
                    logger.debug("Phonon-2: %s", line)
        except (OSError, ValueError):
            pass

    def _stop_worker_locked(self) -> None:
        """Stops the resident worker. Caller must hold ``self._lock``."""
        proc = self._proc
        self._proc = None
        self._proc_model = None
        self._queue = None
        if proc is None:
            return

        try:
            if proc.stdin is not None and not proc.stdin.closed:
                proc.stdin.close()
        except (OSError, ValueError):
            pass
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
                try:
                    proc.wait(timeout=2)
                except (OSError, subprocess.TimeoutExpired):
                    pass
        except (OSError, ValueError):
            pass

    def _start_worker_locked(self, model_dir: Path) -> bool:
        """Starts or reuses the resident Phonon-2 worker."""
        if (
            self._proc is not None
            and self._proc.poll() is None
            and self._proc_model == model_dir
        ):
            return True

        self._stop_worker_locked()

        python = self._runtime_python()
        script = self._worker_script()
        if python is None or script is None:
            if not self._missing_runtime_logged:
                logger.warning(
                    "Phonon-2 runtime not found; dictation is disabled until the "
                    "isolated STT runtime is installed under %s.",
                    RUNTIME_RELATIVE,
                )
                self._missing_runtime_logged = True
            self._retry_after = time.monotonic() + 300.0
            return False

        env = os.environ.copy()
        env.setdefault("PYTHONIOENCODING", "utf-8")
        env["HF_HUB_OFFLINE"] = "1"
        env["TRANSFORMERS_OFFLINE"] = "1"
        env["TOKENIZERS_PARALLELISM"] = "false"
        creationflags = (
            getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
        )
        try:
            proc = subprocess.Popen(
                [str(python), str(script), str(model_dir)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                env=env,
                creationflags=creationflags,
            )
        except OSError as exc:
            logger.warning("Could not start the Phonon-2 runtime: %s", exc)
            self._retry_after = time.monotonic() + FAILURE_COOLDOWN_S
            return False

        messages: "queue.Queue[Dict[str, Any]]" = queue.Queue()
        tail: Deque[str] = deque(maxlen=20)
        self._proc = proc
        self._proc_model = model_dir
        self._queue = messages
        self._stderr_tail = tail
        threading.Thread(
            target=self._pump_stdout,
            args=(proc, messages),
            name="phonon-stdout",
            daemon=True,
        ).start()
        threading.Thread(
            target=self._pump_stderr,
            args=(proc, tail),
            name="phonon-stderr",
            daemon=True,
        ).start()

        deadline = time.monotonic() + START_TIMEOUT_S
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                logger.warning(
                    "Phonon-2 did not become ready within %.0fs%s",
                    START_TIMEOUT_S,
                    self._format_tail(tail),
                )
                break

            try:
                message = messages.get(timeout=min(0.5, remaining))
            except queue.Empty:
                if proc.poll() is not None:
                    logger.warning(
                        "Phonon-2 exited during startup (code %s)%s",
                        proc.returncode,
                        self._format_tail(tail),
                    )
                    break
                continue

            event = message.get("event")
            if event == "ready":
                logger.info("Phonon-2 ready with model %s.", model_dir)
                return True
            if event == "fatal":
                logger.warning("Phonon-2 failed to load: %s", message.get("error"))
                break
            if event == "eof":
                logger.warning(
                    "Phonon-2 closed its output during startup%s",
                    self._format_tail(tail),
                )
                break

        self._stop_worker_locked()
        self._retry_after = time.monotonic() + FAILURE_COOLDOWN_S
        return False

    def prewarm(self) -> None:
        """Loads Phonon-2 in the background while the user is still speaking."""
        if self._provider() != "local":
            return
        if self._proc is not None and self._proc.poll() is None:
            return
        threading.Thread(
            target=self._prewarm_worker,
            name="phonon-prewarm",
            daemon=True,
        ).start()

    def _prewarm_worker(self) -> None:
        model_dir = self._resolve_model_dir().resolve()
        if not (model_dir / MODEL_FILE).exists():
            return
        with self._lock:
            if time.monotonic() < self._retry_after:
                return
            self._start_worker_locked(model_dir)

    @staticmethod
    def _wav_bytes(audio: np.ndarray) -> bytes:
        """Encodes the recorder's float32 PCM as a 16-bit mono WAV clip."""
        buffer = io.BytesIO()
        sf.write(
            buffer,
            np.ascontiguousarray(audio, dtype=np.float32),
            SAMPLE_RATE,
            format="WAV",
            subtype="PCM_16",
        )
        return buffer.getvalue()

    def _transcribe_cloud(self, provider: str, audio: np.ndarray) -> str:
        """Sends one recorded clip to the selected cloud provider."""
        api_key = provider_api_key(provider)
        if not api_key:
            return ""
        model = provider_model(
            provider,
            str(config_manager.get("voice", "stt_model", "") or ""),
            "stt",
        )
        if not model:
            return ""
        try:
            wav_bytes = self._wav_bytes(audio)
            if provider == "openrouter":
                response = httpx.post(
                    OPENROUTER_TRANSCRIPTION_URL,
                    headers={"Authorization": f"Bearer {api_key}"},
                    data={"model": model},
                    files={"file": ("audio.wav", wav_bytes, "audio/wav")},
                    timeout=CLOUD_TIMEOUT_S,
                )
                response.raise_for_status()
                payload = response.json()
                text = str(payload.get("text") or "").strip()
            else:
                # LiteLLM owns the provider-specific transcription shapes
                # (OpenAI-compatible, Mistral native, Gemini Interactions).
                import litellm

                response = litellm.transcription(
                    model=f"{provider}/{model}",
                    file=("audio.wav", wav_bytes, "audio/wav"),
                    api_key=api_key,
                    timeout=CLOUD_TIMEOUT_S,
                )
                text = str(getattr(response, "text", "") or "").strip()
            if text:
                logger.info("Cloud STT (%s/%s) transcribed %.1fs.", provider, model, audio.size / SAMPLE_RATE)
            return text
        except Exception as exc:
            logger.warning("Cloud STT (%s/%s) failed: %s", provider, model, exc)
            return ""

    def transcribe(self, audio: np.ndarray) -> str:
        """
        Transcribes 16kHz float32 audio into text using the selected provider.

        Cloud failures fall back to local Phonon-2 when it is installed. Local
        failures never escalate to the cloud, so audio is not uploaded unless
        the user selected a cloud STT provider.
        """
        if audio is None:
            return ""
        audio = np.asarray(audio, dtype=np.float32).flatten()
        if audio.size < self.recorder.sample_rate * 0.2:  # Less than 200ms
            return ""
        if float(np.max(np.abs(audio))) < 0.001:
            return ""  # Pure silence

        provider = self._provider()
        if provider != "local":
            if self._cloud_configured():
                text = self._transcribe_cloud(provider, audio)
                if text:
                    return text
                logger.warning(
                    "Cloud STT (%s) returned no text; falling back to local Phonon-2.",
                    provider,
                )
            else:
                logger.warning(
                    "Cloud STT (%s) has no saved key; using local Phonon-2.",
                    provider,
                )
        return self._transcribe_local(audio)

    def _transcribe_local(self, audio: np.ndarray) -> str:
        """Runs the resident Phonon-2 worker."""
        model_dir = self._resolve_model_dir().resolve()
        if not (model_dir / MODEL_FILE).exists():
            logger.warning(
                "Phonon-2 model not found at %s; dictation is disabled.", model_dir
            )
            return ""

        with self._lock:
            if time.monotonic() < self._retry_after:
                return ""
            if not self._start_worker_locked(model_dir):
                return ""

            proc = self._proc
            messages = self._queue
            if proc is None or messages is None or proc.stdin is None:
                return ""

            self._next_id += 1
            request_id = self._next_id
            payload = base64.b64encode(
                np.ascontiguousarray(audio, dtype=np.float32).tobytes()
            ).decode("ascii")
            try:
                proc.stdin.write(
                    json.dumps({"id": request_id, "audio": payload}) + "\n"
                )
                proc.stdin.flush()
            except (OSError, ValueError) as exc:
                logger.warning("Phonon-2 request failed: %s", exc)
                self._stop_worker_locked()
                self._retry_after = time.monotonic() + FAILURE_COOLDOWN_S
                return ""

            timeout = max(
                45.0,
                audio.size / self.recorder.sample_rate * 4.0 + 30.0,
            )
            deadline = time.monotonic() + timeout
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    logger.warning(
                        "Phonon-2 timed out after %.0fs%s",
                        timeout,
                        self._format_tail(self._stderr_tail),
                    )
                    self._stop_worker_locked()
                    self._retry_after = time.monotonic() + FAILURE_COOLDOWN_S
                    return ""

                try:
                    message = messages.get(timeout=min(0.5, remaining))
                except queue.Empty:
                    if proc.poll() is not None:
                        logger.warning(
                            "Phonon-2 worker exited (code %s)%s",
                            proc.returncode,
                            self._format_tail(self._stderr_tail),
                        )
                        self._stop_worker_locked()
                        self._retry_after = time.monotonic() + FAILURE_COOLDOWN_S
                        return ""
                    continue

                event = message.get("event")
                if event == "eof":
                    logger.warning(
                        "Phonon-2 worker closed its output%s",
                        self._format_tail(self._stderr_tail),
                    )
                    self._stop_worker_locked()
                    self._retry_after = time.monotonic() + FAILURE_COOLDOWN_S
                    return ""
                if event == "fatal":
                    logger.warning("Phonon-2 worker failed: %s", message.get("error"))
                    self._stop_worker_locked()
                    self._retry_after = time.monotonic() + FAILURE_COOLDOWN_S
                    return ""
                if message.get("id") != request_id:
                    continue
                if message.get("error"):
                    logger.warning(
                        "Phonon-2 could not transcribe the clip: %s",
                        message["error"],
                    )
                    return ""

                text = str(message.get("text") or "").strip()
                logger.info(
                    "Phonon-2 transcribed %.1fs in %.2fs decode time",
                    audio.size / self.recorder.sample_rate,
                    float(message.get("decode_s") or 0.0),
                )
                return text

    def shutdown(self) -> None:
        """Stops the resident worker during backend shutdown."""
        with self._lock:
            self._stop_worker_locked()


# Global singleton instance
stt_engine = STTEngine()
