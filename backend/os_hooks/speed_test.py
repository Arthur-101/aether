"""
On-demand speed test for the Stats tab.

Cloudflare's public measurement endpoints are used because they need no key
and are close to a real browser test. The request is deliberately capped so a
click cannot pour gigabytes through a metered connection, and the whole run
is bounded by a timeout so a stalled socket cannot hold the executor forever.
"""

from __future__ import annotations

import statistics
import time
import urllib.request
from datetime import datetime
from typing import Any, Dict, Optional

LATENCY_URL = "https://speed.cloudflare.com/__down?bytes=1"
DOWNLOAD_URL = "https://speed.cloudflare.com/__down?bytes={size}"
UPLOAD_URL = "https://speed.cloudflare.com/__up"

DOWNLOAD_BYTES = 5_000_000
UPLOAD_BYTES = 1_000_000
TIMEOUT_SECONDS = 20.0
USER_AGENT = "Aether/1.0 (+desktop)"


def _open(url: str, data: Optional[bytes] = None):
    request = urllib.request.Request(
        url, data=data, headers={"User-Agent": USER_AGENT}
    )
    return urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS)


def _measure_latency(samples: int = 3) -> Optional[float]:
    readings = []
    for _ in range(samples):
        started = time.perf_counter()
        with _open(LATENCY_URL) as response:
            response.read(1)
        readings.append((time.perf_counter() - started) * 1000.0)
    return round(statistics.median(readings), 1) if readings else None


def _measure_download(size: int) -> float:
    received = 0
    started = time.perf_counter()
    with _open(DOWNLOAD_URL.format(size=size)) as response:
        while True:
            chunk = response.read(64 * 1024)
            if not chunk:
                break
            received += len(chunk)
    elapsed = max(time.perf_counter() - started, 0.001)
    return round((received * 8) / elapsed / 1_000_000, 2)


def _measure_upload(size: int) -> float:
    payload = b"\0" * size
    started = time.perf_counter()
    with _open(UPLOAD_URL, data=payload) as response:
        response.read()
    elapsed = max(time.perf_counter() - started, 0.001)
    return round((size * 8) / elapsed / 1_000_000, 2)


def run_speed_test() -> Dict[str, Any]:
    """Runs latency, download, and upload. Never raises."""
    result: Dict[str, Any] = {
        "state": "done",
        "server": "Cloudflare",
        "tested_at": datetime.now().isoformat(timespec="seconds"),
        "ping_ms": None,
        "download_mbps": None,
        "upload_mbps": None,
    }

    try:
        result["ping_ms"] = _measure_latency()
    except Exception:
        # A latency probe failure is not fatal; the throughput legs may work.
        pass

    try:
        result["download_mbps"] = _measure_download(DOWNLOAD_BYTES)
    except Exception as exc:
        result.update(state="error", message=f"Download test failed: {exc}")
        return result

    try:
        result["upload_mbps"] = _measure_upload(UPLOAD_BYTES)
    except Exception as exc:
        result.update(state="error", message=f"Upload test failed: {exc}")
        return result

    return result
