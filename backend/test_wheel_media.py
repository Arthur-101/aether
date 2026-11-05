"""Radial Wheel media routing and FFmpeg converter behavior."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.mcp_tools import media_tools

# Load the router first: event_router imports region_events, which imports
# tool_events. Importing tool_events first trips that circular import.
import backend.event_router  # noqa: F401,E402
from backend.tool_events import _convert_tool  # noqa: E402


def test_convert_routes_by_the_file_s_extension():
    assert _convert_tool(r"C:\clips\a.mp4") == "convert_media"
    assert _convert_tool(r"C:\clips\a.webm") == "convert_media"
    assert _convert_tool(r"C:\clips\a.mp3") == "convert_media"
    assert _convert_tool(r"C:\clips\a.pdf") == "convert_document"
    assert _convert_tool(r"C:\clips\a.docx") == "convert_document"
    assert _convert_tool(r"C:\clips\a.png") == "convert_image_format"


def test_convert_media_rejects_images(tmp_path):
    image = tmp_path / "a.png"
    image.write_bytes(b"not an image")

    with pytest.raises(ValueError):
        media_tools.convert_media(str(image), "mp3")


def test_convert_media_rejects_the_source_format(tmp_path):
    video = tmp_path / "a.mp4"
    video.write_bytes(b"not a video")

    with pytest.raises(ValueError):
        media_tools.convert_media(str(video), "mp4")


def test_convert_media_extracts_mp3_with_ffmpeg(tmp_path, monkeypatch):
    video = tmp_path / "a.mp4"
    video.write_bytes(b"not a video")
    captured = []

    monkeypatch.setattr(media_tools, "exported_path", lambda p, name: tmp_path / name)
    monkeypatch.setattr(media_tools, "_resolve_media_binary", lambda name: "ffmpeg")
    monkeypatch.setattr(media_tools, "_ffmpeg_run", captured.append)

    result = media_tools.convert_media(str(video), "mp3")

    assert result == str(tmp_path / "a.mp3")
    args = captured[0]
    assert "-vn" in args
    assert "libmp3lame" in args
    assert args[-1] == str(tmp_path / "a.mp3")


def test_convert_media_makes_a_gif(tmp_path, monkeypatch):
    video = tmp_path / "a.webm"
    video.write_bytes(b"not a video")
    captured = []

    monkeypatch.setattr(media_tools, "exported_path", lambda p, name: tmp_path / name)
    monkeypatch.setattr(media_tools, "_resolve_media_binary", lambda name: "ffmpeg")
    monkeypatch.setattr(media_tools, "_ffmpeg_run", captured.append)

    media_tools.convert_media(str(video), "gif")

    assert "-loop" in captured[0]
    assert "fps=12,scale=720:-1:flags=lanczos" in captured[0]


def test_compress_media_raises_for_unsupported_formats(tmp_path, monkeypatch):
    archive = tmp_path / "a.zip"
    archive.write_bytes(b"not a zip")

    monkeypatch.setattr(media_tools, "exported_path", lambda p, name: tmp_path / name)

    with pytest.raises(ValueError):
        media_tools.compress_media(str(archive))
