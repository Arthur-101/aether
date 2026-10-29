"""Tests for Region to Ask's desktop capture helper."""

import os
import time

from PIL import Image
import pytest

from backend.os_hooks import region_capture


class FakeShot:
    def __init__(self, size):
        self.size = size
        self.rgb = bytes((30, 60, 90)) * (size[0] * size[1])


class FakeCapture:
    def __init__(self, monitors=None):
        self.monitors = monitors or [
            {"left": 0, "top": 0, "width": 1920, "height": 1080}
        ]
        self.boxes = []

    def grab(self, region):
        self.boxes.append(dict(region))
        return FakeShot((region["width"], region["height"]))


def test_capture_region_saves_a_png_of_the_selected_pixels(tmp_path, monkeypatch):
    monkeypatch.setattr(region_capture, "get_captures_dir", lambda: tmp_path)
    capture = FakeCapture()

    result = region_capture.capture_region(
        120, 80, 200, 150, capture=capture
    )

    assert capture.boxes == [
        {"left": 120, "top": 80, "width": 200, "height": 150}
    ]
    assert result["width"] == 200
    assert result["height"] == 150
    assert result["x"] == 120
    assert result["y"] == 80
    assert result["file_name"].startswith("region-")
    assert result["file_name"].endswith(".png")

    with Image.open(result["file_path"]) as image:
        assert image.format == "PNG"
        assert image.size == (200, 150)
        assert image.getpixel((0, 0)) == (30, 60, 90)


def test_capture_region_clamps_to_the_virtual_desktop(tmp_path, monkeypatch):
    monkeypatch.setattr(region_capture, "get_captures_dir", lambda: tmp_path)
    capture = FakeCapture(
        [{"left": -1920, "top": 0, "width": 3840, "height": 1080}]
    )

    result = region_capture.capture_region(
        -2000, -10, 200, 120, capture=capture
    )

    assert result["x"] == -1920
    assert result["y"] == 0
    assert result["width"] == 120
    assert result["height"] == 110
    assert capture.boxes[0] == {
        "left": -1920,
        "top": 0,
        "width": 120,
        "height": 110,
    }


def test_capture_region_rejects_tiny_selections(tmp_path, monkeypatch):
    monkeypatch.setattr(region_capture, "get_captures_dir", lambda: tmp_path)

    with pytest.raises(ValueError, match="larger area"):
        region_capture.capture_region(10, 10, 4, 100, capture=FakeCapture())


def test_capture_region_rejects_selections_outside_the_desktop(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(region_capture, "get_captures_dir", lambda: tmp_path)

    with pytest.raises(ValueError, match="outside the desktop"):
        region_capture.capture_region(
            4000, 4000, 100, 100, capture=FakeCapture()
        )


def test_is_capture_path_recognizes_only_region_pngs_in_captures(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(region_capture, "get_captures_dir", lambda: tmp_path)
    capture = tmp_path / "region-20261029-120000-abc123.png"
    capture.write_bytes(b"x")
    note = tmp_path / "note.png"
    note.write_bytes(b"x")
    wrong_ext = tmp_path / "region-20261029-120000-abc123.jpg"
    wrong_ext.write_bytes(b"x")
    outside = tmp_path.parent / "region-outside.png"
    outside.write_bytes(b"x")

    assert region_capture.is_capture_path(capture)
    assert not region_capture.is_capture_path(note)
    assert not region_capture.is_capture_path(wrong_ext)
    assert not region_capture.is_capture_path(outside)
    assert not region_capture.is_capture_path("")


def test_discard_capture_deletes_only_unreferenced_captures(tmp_path, monkeypatch):
    monkeypatch.setattr(region_capture, "get_captures_dir", lambda: tmp_path)
    keep = tmp_path / "region-20261029-120000-aaaaaa.png"
    drop = tmp_path / "region-20261029-120001-bbbbbb.png"
    keep.write_bytes(b"x")
    drop.write_bytes(b"x")

    referenced = [str(keep)]
    assert region_capture.discard_capture(drop, referenced_paths=referenced) is True
    assert not drop.exists()
    assert region_capture.discard_capture(keep, referenced_paths=referenced) is False
    assert keep.exists()


def test_discard_capture_ignores_non_capture_files(tmp_path, monkeypatch):
    monkeypatch.setattr(region_capture, "get_captures_dir", lambda: tmp_path)
    dropped = tmp_path / "user-photo.png"
    dropped.write_bytes(b"x")

    assert region_capture.discard_capture(dropped, referenced_paths=[]) is False
    assert dropped.exists()


def test_sweep_orphan_captures_removes_only_stale_unreferenced(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(region_capture, "get_captures_dir", lambda: tmp_path)
    stale = tmp_path / "region-20261001-000000-aaaaaa.png"
    fresh = tmp_path / "region-20261029-000000-bbbbbb.png"
    referenced = tmp_path / "region-20261001-000001-cccccc.png"
    for path in (stale, fresh, referenced):
        path.write_bytes(b"x")

    old = time.time() - 48 * 3600
    os.utime(stale, (old, old))
    os.utime(referenced, (old, old))

    removed = region_capture.sweep_orphan_captures(
        max_age_hours=24, referenced_paths=[str(referenced)]
    )

    assert removed == 1
    assert not stale.exists()
    assert fresh.exists()
    assert referenced.exists()
