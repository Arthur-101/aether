"""
On-demand speed test for the Stats tab.

Cloudflare's public measurement endpoints are used because they need no key
and are close to a real browser test. A run is sampled over a requested
duration (12 seconds by default): latency first, then a series of download and
upload windows. Streaming a sample at a time keeps the island responsive and
gives the UI a live trace, while the per-sample byte cap and deadline keep a
click from pouring gigabytes through a metered connection.
"""

from __future__ import annotations

import statistics
import time
import urllib.request
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

LATENCY_URL = "https://speed.cloudflare.com/__down?bytes=1"
DOWNLOAD_URL = "https://speed.cloudflare.com/__down?bytes={size}"
UPLOAD_URL = "https://speed.cloudflare.com/__up"

LATENCY_SAMPLES = 3

DEFAULT_DURATION_SECONDS = 12
MIN_DURATION_SECONDS = 5
MAX_DURATION_SECONDS = 60
DOWNLOAD_SHARE = 0.55

# Each sample is paced to an interval, so a fast link does not finish the whole
# run in one burst and a slow link is bounded per sample instead of by one
# enormous request. The sample count is derived from the requested duration.
DOWNLOAD_INTERVAL = 0.72
DOWNLOAD_SAMPLE_SECONDS = 0.5
DOWNLOAD_START_BYTES = 1_500_000
DOWNLOAD_MIN_BYTES = 384_000
DOWNLOAD_MAX_BYTES = 8_000_000
DOWNLOAD_TARGET_SECONDS = 0.3

UPLOAD_INTERVAL = 0.62
UPLOAD_START_BYTES = 128_000
UPLOAD_MIN_BYTES = 32_000
UPLOAD_MAX_BYTES = 1_000_000
UPLOAD_TARGET_SECONDS = 0.2

TIMEOUT_SECONDS = 8.0
USER_AGENT = "Aether/1.0 (+desktop)"

ProgressCallback = Callable[[Dict[str, Any]], None]


def _open(url: str, data: Optional[bytes] = None, timeout: float = TIMEOUT_SECONDS):
    request = urllib.request.Request(
        url, data=data, headers={"User-Agent": USER_AGENT}
    )
    return urllib.request.urlopen(request, timeout=timeout)


def _sleep(seconds: float) -> None:
    """Indirection so tests can exercise the runner without waiting."""
    time.sleep(seconds)


def _measure_latency() -> Dict[str, Optional[float]]:
    """Returns the median ping and variation after one warm-up probe."""
    try:
        # The first request pays for TLS setup; excluding it from the median
        # keeps an otherwise healthy connection from looking slow.
        with _open(LATENCY_URL, timeout=4.0) as response:
            response.read(1)
    except Exception:
        pass

    readings: List[float] = []
    for _ in range(LATENCY_SAMPLES):
        started = time.perf_counter()
        with _open(LATENCY_URL, timeout=4.0) as response:
            response.read(1)
        readings.append((time.perf_counter() - started) * 1000.0)

    if not readings:
        return {"ping_ms": None, "jitter_ms": None}

    ping = round(statistics.median(readings), 1)
    deltas = [abs(current - previous) for previous, current in zip(readings, readings[1:])]
    jitter = round(statistics.median(deltas), 1) if deltas else 0.0
    return {"ping_ms": ping, "jitter_ms": jitter}


def _measure_download(
    size: int, max_seconds: float = DOWNLOAD_SAMPLE_SECONDS
) -> float:
    """Reads one capped download window and returns its sampled throughput."""
    received = 0
    started = time.perf_counter()
    with _open(DOWNLOAD_URL.format(size=size)) as response:
        while time.perf_counter() - started < max_seconds:
            chunk = response.read(64 * 1024)
            if not chunk:
                break
            received += len(chunk)

    if received <= 0:
        raise RuntimeError("empty download response")
    elapsed = max(time.perf_counter() - started, 0.001)
    return round((received * 8) / elapsed / 1_000_000, 2)


def _measure_upload(size: int) -> float:
    payload = b"\0" * size
    started = time.perf_counter()
    with _open(UPLOAD_URL, data=payload) as response:
        response.read()
    elapsed = max(time.perf_counter() - started, 0.001)
    return round((size * 8) / elapsed / 1_000_000, 2)


def _next_sample_size(
    current: int, elapsed: float, target: float, minimum: int, maximum: int
) -> int:
    """Grows or shrinks the next transfer toward the per-sample time target."""
    if elapsed <= 0:
        return maximum
    desired = current * (target / elapsed)
    return int(max(minimum, min(maximum, desired)))


def _pace(sample_seconds: float, interval: float) -> None:
    remaining = interval - sample_seconds
    if remaining > 0:
        _sleep(remaining)


def _progress(
    callback: Optional[ProgressCallback],
    result: Dict[str, Any],
    samples: List[Dict[str, Any]],
    phase: str,
    progress: float,
    current_mbps: Optional[float] = None,
) -> None:
    if callback is None:
        return
    payload = {
        **result,
        "state": "running",
        "phase": phase,
        "progress": round(progress, 4),
        "samples": [dict(sample) for sample in samples],
    }
    if current_mbps is not None:
        payload["current_mbps"] = current_mbps
    try:
        callback(payload)
    except Exception:
        # The UI must never be able to break a measurement.
        pass


def clamp_duration(duration_seconds: Any = DEFAULT_DURATION_SECONDS) -> int:
    """Keeps an externally requested duration inside the supported range."""
    try:
        seconds = int(round(float(duration_seconds)))
    except (TypeError, ValueError):
        seconds = DEFAULT_DURATION_SECONDS
    return max(MIN_DURATION_SECONDS, min(MAX_DURATION_SECONDS, seconds))


def run_speed_test(
    progress: Optional[ProgressCallback] = None,
    duration_seconds: Any = DEFAULT_DURATION_SECONDS,
) -> Dict[str, Any]:
    """Runs a latency, download, and upload sample. Never raises."""
    duration_seconds = clamp_duration(duration_seconds)
    started_at = time.perf_counter()
    samples: List[Dict[str, Any]] = []
    result: Dict[str, Any] = {
        "state": "done",
        "server": "Cloudflare",
        "tested_at": datetime.now().isoformat(timespec="seconds"),
        "duration_seconds": duration_seconds,
        "ping_ms": None,
        "jitter_ms": None,
        "download_mbps": None,
        "upload_mbps": None,
        "samples": samples,
    }

    _progress(progress, result, samples, "latency", 0.02)

    try:
        result.update(_measure_latency())
    except Exception:
        # A latency probe failure is not fatal; the throughput legs may work.
        pass

    # Split what is left after latency into the two throughput phases. The extra
    # sample accounts for the final unpaced window, keeping the wall clock close
    # to the requested duration.
    elapsed = time.perf_counter() - started_at
    remaining = max(duration_seconds - elapsed, 3.0)
    download_window = remaining * DOWNLOAD_SHARE
    upload_window = remaining - download_window
    download_samples = max(3, round(download_window / DOWNLOAD_INTERVAL) + 1)
    upload_samples = max(3, round(upload_window / UPLOAD_INTERVAL) + 1)

    _progress(progress, result, samples, "download", 0.08)

    size = DOWNLOAD_START_BYTES
    download_readings: List[float] = []
    download_error: Optional[Exception] = None
    for index in range(download_samples):
        sample_started = time.perf_counter()
        speed: Optional[float] = None
        try:
            speed = _measure_download(size)
        except Exception as exc:
            # A single stalled window should not throw away the other readings.
            download_error = exc

        elapsed = time.perf_counter() - sample_started
        if speed is not None:
            download_readings.append(speed)
            samples.append(
                {
                    "phase": "download",
                    "mbps": speed,
                    "t": round(time.perf_counter() - started_at, 2),
                }
            )
            result["download_mbps"] = round(statistics.median(download_readings), 2)
        progress_value = 0.08 + (0.5 * (index + 1) / download_samples)
        _progress(
            progress, result, samples, "download", progress_value, current_mbps=speed
        )

        if index < download_samples - 1:
            _pace(elapsed, DOWNLOAD_INTERVAL)
            size = _next_sample_size(
                size,
                elapsed,
                DOWNLOAD_TARGET_SECONDS,
                DOWNLOAD_MIN_BYTES,
                DOWNLOAD_MAX_BYTES,
            )

    if not download_readings:
        detail = download_error if download_error is not None else "no samples"
        result.update(state="error", message=f"Download test failed: {detail}")
        return result

    _progress(progress, result, samples, "upload", 0.58)

    size = UPLOAD_START_BYTES
    upload_readings: List[float] = []
    upload_error: Optional[Exception] = None
    for index in range(upload_samples):
        sample_started = time.perf_counter()
        speed: Optional[float] = None
        try:
            speed = _measure_upload(size)
        except Exception as exc:
            upload_error = exc

        elapsed = time.perf_counter() - sample_started
        if speed is not None:
            upload_readings.append(speed)
            samples.append(
                {
                    "phase": "upload",
                    "mbps": speed,
                    "t": round(time.perf_counter() - started_at, 2),
                }
            )
            result["upload_mbps"] = round(statistics.median(upload_readings), 2)
        progress_value = 0.58 + (0.4 * (index + 1) / upload_samples)
        _progress(
            progress, result, samples, "upload", progress_value, current_mbps=speed
        )

        if index < upload_samples - 1:
            _pace(elapsed, UPLOAD_INTERVAL)
            size = _next_sample_size(
                size,
                elapsed,
                UPLOAD_TARGET_SECONDS,
                UPLOAD_MIN_BYTES,
                UPLOAD_MAX_BYTES,
            )

    if not upload_readings:
        detail = upload_error if upload_error is not None else "no samples"
        result.update(state="error", message=f"Upload test failed: {detail}")
        return result

    result["tested_at"] = datetime.now().isoformat(timespec="seconds")
    result["samples"] = samples
    return result
