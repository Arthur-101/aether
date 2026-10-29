"""Media editor tests: previews, exact crop rectangles, and gradient stops."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from backend import media_api
from backend.mcp_tools import media_tools
from backend.mcp_tools.media_tools import (
    _build_background,
    add_background,
    black_and_white,
    crop_image,
    image_preview,
)

# Import the router first so tool_events' built-in registration avoids a cycle.
import backend.event_router  # noqa: F401  # isort: skip
from backend.tool_events import _parse_crop_options


@pytest.fixture()
def client() -> TestClient:
    app = FastAPI()
    app.include_router(media_api.router)
    return TestClient(app)


def _sample(path: Path, size=(1200, 800), color=(20, 30, 40)) -> Path:
    Image.new("RGB", size, color).save(path)
    return path


def test_preview_reports_original_size_and_bounded_thumbnail(tmp_path):
    source = _sample(tmp_path / "wide.png", (1200, 800))

    payload = image_preview(str(source))

    assert payload["width"] == 1200
    assert payload["height"] == 800
    assert payload["preview_width"] <= 720
    assert payload["preview_height"] <= 720
    assert payload["data_url"].startswith("data:image/")


def test_preview_endpoint_and_error_statuses(client, tmp_path):
    source = _sample(tmp_path / "photo.png", (90, 60))
    response = client.get("/api/media/preview", params={"path": str(source)})

    assert response.status_code == 200
    body = response.json()
    assert body["width"] == 90
    assert body["height"] == 60
    assert body["data_url"].startswith("data:image/")

    missing = client.get(
        "/api/media/preview", params={"path": str(tmp_path / "missing.png")}
    )
    assert missing.status_code == 404

    text_file = tmp_path / "notes.txt"
    text_file.write_text("not an image", encoding="utf-8")
    unsupported = client.get(
        "/api/media/preview", params={"path": str(text_file)}
    )
    assert unsupported.status_code == 415


def test_main_registers_the_media_api():
    from backend.main import app

    paths = set(app.openapi().get("paths", {}))
    assert "/api/media/preview" in paths


def test_crop_uses_the_exact_requested_rectangle(tmp_path, monkeypatch):
    source = tmp_path / "quadrants.png"
    image = Image.new("RGB", (10, 10), (0, 0, 0))
    image.putpixel((4, 5), (0, 255, 0))
    image.save(source)
    output_dir = tmp_path / "out"
    output_dir.mkdir()
    monkeypatch.setattr(
        media_tools,
        "exported_path",
        lambda _source, name: output_dir / name,
    )

    output = crop_image(str(source), 2, 2, x=3, y=4)

    with Image.open(output) as cropped:
        assert cropped.size == (2, 2)
        assert cropped.getpixel((1, 1)) == (0, 255, 0)


def test_crop_without_coordinates_stays_centered(tmp_path, monkeypatch):
    source = _sample(tmp_path / "centered.png", (10, 10), (255, 255, 255))
    output_dir = tmp_path / "out"
    output_dir.mkdir()
    monkeypatch.setattr(
        media_tools,
        "exported_path",
        lambda _source, name: output_dir / name,
    )

    output = crop_image(str(source), 4, 4)

    with Image.open(output) as cropped:
        assert cropped.size == (4, 4)


def test_three_color_gradient_uses_the_middle_stop():
    image = _build_background(
        5,
        1,
        "linear-gradient(135deg, #000000 0%, #ff0000 50%, #ffffff 100%)",
    )

    assert image.getpixel((0, 0)) == (0, 0, 0)
    assert image.getpixel((4, 0)) == (255, 0, 0)


def test_preview_keeps_palette_transparency(tmp_path):
    source = tmp_path / "transparent.png"
    image = Image.new("P", (20, 20), 0)
    palette = []
    for value in range(256):
        palette.extend((value, value, value))
    image.putpalette(palette)
    image.info["transparency"] = 0
    image.save(source, transparency=0)

    payload = image_preview(str(source))

    assert payload["data_url"].startswith("data:image/png")


def test_preview_and_background_follow_exif_orientation(tmp_path, monkeypatch):
    import piexif

    source = tmp_path / "portrait.jpg"
    Image.new("RGB", (90, 60), (10, 20, 30)).save(
        source,
        exif=piexif.dump({"0th": {piexif.ImageIFD.Orientation: 6}}),
    )

    payload = image_preview(str(source))
    assert (payload["width"], payload["height"]) == (60, 90)

    output_dir = tmp_path / "out"
    output_dir.mkdir()
    monkeypatch.setattr(
        media_tools,
        "exported_path",
        lambda _source, name: output_dir / name,
    )
    output = add_background(str(source), "#000000", padding=0, corners=0, shadow=0)

    with Image.open(output) as result:
        assert result.size == (60, 90)


def test_black_and_white_preserves_size_and_alpha(tmp_path, monkeypatch):
    source = tmp_path / "colour.png"
    image = Image.new("RGBA", (40, 30), (200, 40, 60, 255))
    image.putpixel((0, 0), (200, 40, 60, 0))
    image.save(source)
    output_dir = tmp_path / "out"
    output_dir.mkdir()
    monkeypatch.setattr(
        media_tools,
        "exported_path",
        lambda _source, name: output_dir / name,
    )

    output = black_and_white(str(source))

    assert Path(output).name == "colour_bw.png"
    with Image.open(output) as result:
        assert result.size == (40, 30)
        assert result.mode == "RGBA"
        r, g, b, a = result.getpixel((20, 15))
        assert r == g == b
        assert a == 255
        assert result.getpixel((0, 0))[3] == 0


def test_crop_options_accept_json_and_legacy_targets():
    assert _parse_crop_options('{"x": 4, "y": 5, "w": 6, "h": 7}') == {
        "file_path": "",
        "width": 6,
        "height": 7,
        "x": 4,
        "y": 5,
    }
    assert _parse_crop_options("82x64") == {
        "file_path": "",
        "width": 82,
        "height": 64,
    }
