"""Unit tests for the STT engine boundary. No model or runtime is required."""

import queue
from pathlib import Path

import numpy as np

from backend.ai.stt_engine import (
    PROTOCOL_PREFIX,
    SAMPLE_RATE,
    STTEngine,
)


class FakeProc:
    def __init__(self, lines):
        self.stdout = iter(lines)


def test_short_and_silent_clips_never_start_a_worker(monkeypatch):
    engine = STTEngine()

    def unexpected_start(_model_dir):
        raise AssertionError("worker must not start for empty audio")

    monkeypatch.setattr(engine, "_start_worker_locked", unexpected_start)

    assert engine.transcribe(np.zeros(0, dtype=np.float32)) == ""
    assert engine.transcribe(np.ones(100, dtype=np.float32) * 0.5) == ""
    assert engine.transcribe(np.zeros(SAMPLE_RATE, dtype=np.float32)) == ""


def test_missing_model_file_returns_empty(monkeypatch, tmp_path):
    engine = STTEngine()
    monkeypatch.setattr(engine, "_resolve_model_dir", lambda: tmp_path)

    def unexpected_start(_model_dir):
        raise AssertionError("worker must not start without model.fermion")

    monkeypatch.setattr(engine, "_start_worker_locked", unexpected_start)
    audio = np.ones(SAMPLE_RATE, dtype=np.float32) * 0.1

    assert engine.transcribe(audio) == ""


def test_is_available_requires_model_and_runtime(monkeypatch, tmp_path):
    engine = STTEngine()
    monkeypatch.setattr(engine, "_resolve_model_dir", lambda: tmp_path)
    monkeypatch.setattr(engine, "_runtime_python", lambda: None)

    assert engine.is_available() is False

    (tmp_path / "model.fermion").write_bytes(b"stub")
    assert engine.is_available() is False

    monkeypatch.setattr(engine, "_runtime_python", lambda: Path("python.exe"))
    assert engine.is_available() is True


def test_stdout_pump_ignores_logs_and_reports_eof():
    engine = STTEngine()
    messages = queue.Queue()
    proc = FakeProc([
        "runtime progress line\n",
        PROTOCOL_PREFIX + '{"event": "ready"}\n',
        PROTOCOL_PREFIX + "not json\n",
    ])

    engine._pump_stdout(proc, messages)

    received = []
    while not messages.empty():
        received.append(messages.get_nowait())

    assert {"event": "ready"} in received
    assert received[-1] == {"event": "eof"}
