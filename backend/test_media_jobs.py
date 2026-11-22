"""Background media jobs: sizing, queueing, and cancel (no real network)."""

from __future__ import annotations

import asyncio
import threading
import time
from collections import deque
from pathlib import Path

import pytest
from PIL import Image

from backend import media_jobs
from backend.mcp_tools import media_tools


@pytest.fixture(autouse=True)
def _reset_registry(monkeypatch):
    """Gives each test its own empty queue and a fresh worker."""
    monkeypatch.setattr(media_jobs, "_queue", deque())
    monkeypatch.setattr(media_jobs, "_jobs", {})
    monkeypatch.setattr(media_jobs, "_cancels", {})
    monkeypatch.setattr(media_jobs, "_running", None)
    monkeypatch.setattr(media_jobs, "_worker", None)
    monkeypatch.setattr(media_jobs, "_loop", None)
    yield


def _drain(timeout: float = 5.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        worker = media_jobs._worker
        if worker is None or not worker.is_alive():
            return
        time.sleep(0.02)


def test_quality_settings_span_the_documented_range():
    high = media_tools.quality_settings(100)
    low = media_tools.quality_settings(30)

    assert high["audio_kbps"] == 320
    assert low["audio_kbps"] == 64
    # Quality is clamped, so an out-of-range slider value cannot break mapping.
    assert media_tools.quality_settings(500)["quality"] == 100
    assert media_tools.quality_settings(0)["quality"] == 1


def test_video_quality_reaches_the_encoder(monkeypatch, tmp_path):
    """The slider must land on a knob the encoder actually follows.

    OpenH264 ignored both quality and bitrate in the shipped FFmpeg, so every
    value produced the same file (and a "quality 100" copy made the top of the
    slider jump). MediaFoundation's quality scale is the fixing knob.
    """
    source = tmp_path / "clip.mp4"
    source.write_bytes(b"\0" * (4 * 1024 * 1024))

    top = media_tools._video_encode_args(
        ".mp4", 27.0, media_tools.quality_settings(100), None
    )
    assert top[top.index("-c:v") + 1] == "h264_mf"
    assert top[top.index("-rate_control") + 1] == "quality"
    assert top[top.index("-quality") + 1] == "100"

    low = media_tools._video_encode_args(
        ".mp4", 27.0, media_tools.quality_settings(1), None
    )
    assert low[low.index("-quality") + 1] == "1"


def test_video_sample_asks_for_the_whole_file_duration(monkeypatch, tmp_path):
    """A size cap must be spread over the whole file, not the 3 s slice.

    Measuring the slice against the full target used to ask for ~9x the real
    bitrate and saturate the encoder.
    """
    source = tmp_path / "clip.mp4"
    source.write_bytes(b"\0" * (4 * 1024 * 1024))
    captured = {}

    def fake_run(args):
        captured["args"] = args
        Path(args[-1]).write_bytes(b"\0" * 1000)

    monkeypatch.setattr(media_tools, "_ffmpeg_run", fake_run)
    monkeypatch.setattr(media_tools, "_resolve_media_binary", lambda name: "ffmpeg")

    media_tools._encode_av_sample(
        source, ".mp4", 27.0, media_tools.quality_settings(50), target_mb=10.0
    )

    args = captured["args"]
    # 10 MB over 27 s minus the 128k audio track, with maxrate making it bind.
    video_kbps = int((10.0 * 8192) / 27.0) - 128
    assert args[args.index("-b:v") + 1] == f"{video_kbps}k"
    assert args[args.index("-maxrate") + 1] == f"{video_kbps}k"
    assert args[args.index("-rate_control") + 1] == "pc_vbr"


def test_estimate_sizes_an_image_and_flags_lossless_formats(tmp_path):
    arr = Image.new("RGB", (600, 400))
    arr.putdata(
        [
            ((x * 7) % 256, (y * 5) % 256, ((x + y) * 3) % 256)
            for y in range(400)
            for x in range(600)
        ]
    )
    lossy = tmp_path / "photo.jpg"
    arr.save(lossy, quality=95)
    lossless = tmp_path / "art.png"
    arr.save(lossless)

    jpeg = media_tools.estimate_media_size(str(lossy), 40)
    png = media_tools.estimate_media_size(str(lossless), 40)

    assert jpeg["kind"] == "image"
    assert jpeg["lossless"] is False
    assert jpeg["ssim"] is not None
    assert jpeg["estimated_bytes"] > 0
    assert 0 < jpeg["ratio"] < 10

    assert png["lossless"] is True
    assert png["quality_label"] == "Lossless"
    assert png["ssim"] is None


def test_estimate_pdf_is_reported_as_lossless(tmp_path):
    from pypdf import PdfWriter

    pdf = tmp_path / "doc.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    with open(pdf, "wb") as handle:
        writer.write(handle)

    report = media_tools.estimate_media_size(str(pdf), 40)

    assert report["kind"] == "pdf"
    assert report["lossless"] is True
    assert report["estimated_bytes"] == pdf.stat().st_size


def test_estimate_rejects_unsupported_files(tmp_path):
    archive = tmp_path / "a.zip"
    archive.write_bytes(b"nope")

    with pytest.raises(ValueError):
        media_tools.estimate_media_size(str(archive))


def _run(coro):
    return asyncio.run(coro)


def _submit(**payload):
    payload.setdefault("job_id", payload.get("file_path", "job"))
    return _run(media_jobs._handle_submit(payload))


def test_second_job_queues_and_a_queued_job_can_be_cancelled(monkeypatch, tmp_path):
    events: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        media_jobs, "_broadcast", lambda event, payload: events.append((event, payload))
    )

    started = threading.Event()
    release = threading.Event()
    ran: list[str] = []

    def fake_execute(job, cancel, threads):
        ran.append(job["file_path"])
        if job["file_path"].endswith("a.mp4"):
            started.set()
            release.wait(5)
        return f"/out/{job['file_path']}"

    monkeypatch.setattr(media_jobs, "_execute", fake_execute)
    monkeypatch.setattr(media_jobs, "_thread_cap", lambda: 0)

    first = tmp_path / "a.mp4"
    second = tmp_path / "b.mp4"
    first.write_bytes(b"x")
    second.write_bytes(b"x")

    _submit(action="COMPRESS", file_path=str(first), job_id="job-a")
    assert started.wait(5), "the first job should start"

    _submit(action="COMPRESS", file_path=str(second), job_id="job-b")
    queued = [
        payload
        for event, payload in events
        if event == "MEDIA_JOB_PROGRESS" and payload["id"] == "job-b"
    ]
    assert queued and queued[0]["status"] == "queued"
    assert "current job" in queued[0]["message"]

    # Cancelling the queued job reports a result and never runs it.
    _run(media_jobs._handle_cancel({"job_id": "job-b"}))
    cancelled = [
        payload
        for event, payload in events
        if event == "MEDIA_JOB_RESULT" and payload["id"] == "job-b"
    ]
    assert cancelled and cancelled[0]["status"] == "cancelled"

    release.set()
    _drain()
    assert ran == [str(first)]
    done = [
        payload
        for event, payload in events
        if event == "MEDIA_JOB_RESULT" and payload["id"] == "job-a"
    ]
    assert done and done[0]["ok"] is True
    assert done[0]["result"] == f"/out/{first}"


def test_running_job_cancel_sets_the_event(monkeypatch, tmp_path):
    monkeypatch.setattr(media_jobs, "_broadcast", lambda event, payload: None)
    seen: list[threading.Event] = []
    finished = threading.Event()

    def fake_execute(job, cancel, threads):
        seen.append(cancel)
        # Wait for the cancel the handler is about to set.
        for _ in range(250):
            if cancel.is_set():
                raise media_tools.MediaCancelled("Stopped.")
            time.sleep(0.02)
        finished.set()
        return "never"

    monkeypatch.setattr(media_jobs, "_execute", fake_execute)
    monkeypatch.setattr(media_jobs, "_thread_cap", lambda: 0)

    source = tmp_path / "c.mp4"
    source.write_bytes(b"x")
    _submit(action="COMPRESS", file_path=str(source), job_id="job-c")

    for _ in range(250):
        if seen:
            break
        time.sleep(0.02)
    assert seen, "the job should have started"

    _run(media_jobs._handle_cancel({"job_id": "job-c"}))
    assert seen[0].is_set()
    _drain()
    assert not finished.is_set()


def test_missing_file_reports_an_error_result(monkeypatch, tmp_path):
    events: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        media_jobs, "_broadcast", lambda event, payload: events.append((event, payload))
    )

    _submit(action="COMPRESS", file_path=str(tmp_path / "gone.mp4"), job_id="job-x")

    results = [payload for event, payload in events if event == "MEDIA_JOB_RESULT"]
    assert results and results[0]["ok"] is False
    assert results[0]["message"] == "File not found."
    assert media_jobs._worker is None


def test_estimate_and_preview_are_registered_routes(monkeypatch, tmp_path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from backend import media_api

    app = FastAPI()
    app.include_router(media_api.router)
    client = TestClient(app)

    source = tmp_path / "pic.png"
    Image.new("RGB", (80, 60), (10, 20, 30)).save(source)

    response = client.get(
        "/api/media/estimate", params={"path": str(source), "quality": 50}
    )
    assert response.status_code == 200
    assert response.json()["kind"] == "image"

    missing = client.get(
        "/api/media/estimate", params={"path": str(tmp_path / "nope.png")}
    )
    assert missing.status_code == 404

    text = tmp_path / "notes.txt"
    text.write_text("x", encoding="utf-8")
    unsupported = client.get(
        "/api/media/estimate", params={"path": str(text)}
    )
    assert unsupported.status_code == 415


def test_main_registers_the_media_job_handlers():
    from backend.event_router import _HANDLERS
    from backend.main import app  # noqa: F401 - imports the router wiring

    assert "SUBMIT_MEDIA_JOB" in _HANDLERS
    assert "CANCEL_MEDIA_JOB" in _HANDLERS
