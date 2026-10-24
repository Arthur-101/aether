"""Real-time audio levels for the cozy media visualizer.

The Windows audio session meter is a cheap COM counter that reports the peak
of the session that is playing. Reading it is much lighter than capturing and
FFT-ing loopback audio, and it follows the same session the media widget is
showing.

The meter thread only reads the device while a session is playing. It publishes
five smoothed values (one per wave line) at 30 Hz; the frontend turns those into
CSS variables, so there is no per-frame JavaScript loop in the webview.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from typing import Any, Callable, Deque, Dict, List, Optional, Tuple

logger = logging.getLogger("aether.media.levels")

TICK_SECONDS = 1 / 30
SESSION_REFRESH_SECONDS = 2.0
# Center line first, then the two neighbours, then the two outer lines. The
# outer lines get less energy and a longer delay, so a beat ripples outward.
LINE_GAINS = (1.0, 0.82, 0.82, 0.6, 0.6)
LINE_DELAYS = (0, 2, 2, 4, 4)
LINE_ATTACK = (0.7, 0.55, 0.55, 0.4, 0.4)
LINE_RELEASE = (0.22, 0.17, 0.17, 0.12, 0.12)
HISTORY_TICKS = 8


def _stem(name: str) -> str:
    """Normalizes a process or session name to the media source id."""
    cleaned = (name or "").strip().lower().rsplit("\\", 1)[-1].rsplit("/", 1)[-1]
    if "!" in cleaned:
        cleaned = cleaned.split("!", 1)[0].split("_", 1)[0]
    if cleaned.endswith(".exe"):
        cleaned = cleaned[:-4]
    return cleaned


class AudioLevelMeter:
    """Polls the active media session's peak meter on a dedicated thread."""

    def __init__(self) -> None:
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._callback: Optional[Callable[[Dict[str, Any]], None]] = None
        self._lock = threading.Lock()
        self._playing = False
        self._source_id = ""
        self._reset = True
        self._was_playing = False
        self._meters: List[Tuple[str, Any]] = []
        self._meters_at = 0.0
        self._endpoint_meter: Any = None
        self._endpoint_at = 0.0
        self._history: Deque[float] = deque([0.0] * HISTORY_TICKS, maxlen=HISTORY_TICKS)
        self._levels = [0.0] * len(LINE_GAINS)
        # Session peaks are not normalized to 1.0 (they can exceed it), so the
        # meter tracks a slowly falling ceiling and reacts to the shape of the
        # music rather than to the absolute volume.
        self._peak_ceiling = 0.2

    def start(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._callback = callback
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, daemon=True, name="aether-audio-levels"
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2.0)
            self._thread = None

    def update(self, playing: bool, source_id: str) -> None:
        """Called whenever the media snapshot changes."""
        with self._lock:
            if source_id != self._source_id:
                self._source_id = source_id
                self._reset = True
            if playing != self._playing:
                self._reset = True
            self._playing = playing

    def _refresh_sessions(self) -> None:
        try:
            from pycaw.pycaw import AudioUtilities, IAudioMeterInformation

            meters: List[Tuple[str, Any]] = []
            for session in AudioUtilities.GetAllSessions():
                try:
                    name = (
                        session.Process.name()
                        if session.Process is not None
                        else session.DisplayName
                    )
                except Exception:
                    name = ""
                try:
                    meter = session._ctl.QueryInterface(IAudioMeterInformation)
                except Exception:
                    continue
                meters.append((_stem(name), meter))
            self._meters = meters
            self._meters_at = time.monotonic()
        except Exception as exc:
            logger.debug("Audio session meters unavailable: %s", exc)
            self._meters = []
            self._meters_at = time.monotonic()

    def _endpoint_peak(self) -> float:
        """Fallback for machines where session meters cannot be queried."""
        try:
            from comtypes import CLSCTX_ALL
            from pycaw.pycaw import AudioUtilities, IAudioMeterInformation

            now = time.monotonic()
            if self._endpoint_meter is None or now - self._endpoint_at > 5.0:
                device = AudioUtilities.GetSpeakers()
                interface = device._dev.Activate(
                    IAudioMeterInformation._iid_, CLSCTX_ALL, None
                )
                self._endpoint_meter = interface.QueryInterface(
                    IAudioMeterInformation
                )
                self._endpoint_at = now
            return float(self._endpoint_meter.GetPeakValue())
        except Exception:
            self._endpoint_meter = None
            return 0.0

    def _read_peak(self, source_id: str) -> float:
        now = time.monotonic()
        if not self._meters or now - self._meters_at > SESSION_REFRESH_SECONDS:
            self._refresh_sessions()

        # Prefer the process that owns the current SMTC session. Fall back to
        # the loudest active session, then to the endpoint meter.
        for name, meter in self._meters:
            if source_id and name == source_id:
                try:
                    return float(meter.GetPeakValue())
                except Exception:
                    break

        peaks: List[float] = []
        for _name, meter in self._meters:
            try:
                peaks.append(float(meter.GetPeakValue()))
            except Exception:
                continue
        if peaks:
            return max(peaks)
        return self._endpoint_peak()

    def _shape(self, peak: float) -> Tuple[List[float], float]:
        # Session peaks are relative to the app's own mix and can exceed 1.0.
        # A rolling ceiling keeps the response expressive across quiet and loud
        # tracks without pinning every loud passage to the top.
        peak = max(0.0, peak)
        self._peak_ceiling = max(peak, self._peak_ceiling * 0.995, 0.2)
        energy = min(1.0, peak / self._peak_ceiling) ** 0.8
        self._history.append(energy)

        levels: List[float] = []
        for index, (gain, delay, attack, release) in enumerate(
            zip(LINE_GAINS, LINE_DELAYS, LINE_ATTACK, LINE_RELEASE)
        ):
            delayed = self._history[-1 - delay] if delay < len(self._history) else 0.0
            target = min(1.0, delayed * gain)
            current = self._levels[index]
            coefficient = attack if target > current else release
            current += (target - current) * coefficient
            levels.append(round(current, 4))
        self._levels = levels
        return levels, round(energy, 4)

    def _emit(self, levels: List[float], energy: float, playing: bool) -> None:
        if self._callback is None:
            return
        try:
            self._callback(
                {
                    "levels": levels,
                    "energy": energy,
                    "playing": playing,
                }
            )
        except Exception as exc:
            logger.debug("Audio level callback failed: %s", exc)

    def _run(self) -> None:
        try:
            import comtypes

            comtypes.CoInitialize()
        except Exception:
            comtypes = None

        try:
            while not self._stop.is_set():
                with self._lock:
                    playing = self._playing
                    source_id = self._source_id
                    reset = self._reset
                    self._reset = False

                if reset:
                    self._history = deque(
                        [0.0] * HISTORY_TICKS, maxlen=HISTORY_TICKS
                    )
                    self._levels = [0.0] * len(LINE_GAINS)
                    self._peak_ceiling = 0.2

                if not playing:
                    if self._was_playing:
                        self._emit([0.0] * len(LINE_GAINS), 0.0, False)
                        self._was_playing = False
                    self._stop.wait(0.12)
                    continue

                self._was_playing = True
                peak = self._read_peak(source_id)
                levels, energy = self._shape(peak)
                self._emit(levels, energy, True)
                self._stop.wait(TICK_SECONDS)
        finally:
            if comtypes is not None:
                try:
                    comtypes.CoUninitialize()
                except Exception:
                    pass


audio_level_meter = AudioLevelMeter()


def start_audio_levels(callback: Callable[[Dict[str, Any]], None]) -> None:
    audio_level_meter.start(callback)


def stop_audio_levels() -> None:
    audio_level_meter.stop()


def update_audio_levels(playing: bool, source_id: str) -> None:
    audio_level_meter.update(playing, source_id)
