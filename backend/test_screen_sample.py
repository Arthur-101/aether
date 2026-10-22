"""Tests for the color picker's screen sampling helper."""

from PIL import Image

from backend.os_hooks import screen_sample


class FakeShot:
    def __init__(self, image):
        self.size = image.size
        self.rgb = image.tobytes("raw", "RGB")


class FakeCapture:
    def __init__(self, image=None):
        self.monitors = [{"left": 0, "top": 0, "width": 1920, "height": 1080}]
        self.image = image or Image.new("RGB", (21, 21), (20, 40, 60))

    def grab(self, region):
        if self.image is None:
            raise RuntimeError("desktop unavailable")
        return FakeShot(self.image)


def test_build_sample_reports_center_color_and_png():
    image = Image.new("RGB", (21, 21), (10, 20, 30))
    image.putpixel((10, 10), (255, 0, 128))

    sample = screen_sample._build_sample(
        image,
        screen_x=500,
        screen_y=400,
        cursor_x=10,
        cursor_y=10,
        request_id="req-1",
        screen_width=1920,
        screen_height=1080,
    )

    assert sample["available"] is True
    assert sample["request_id"] == "req-1"
    assert sample["hex"] == "#FF0080"
    assert sample["rgb"] == [255, 0, 128]
    assert sample["x"] == 500 and sample["y"] == 400
    assert sample["patch"].startswith("data:image/png;base64,")
    assert sample["patch_width"] == 21
    assert sample["patch_height"] == 21


def test_sample_at_keeps_the_cursor_at_its_patch_pixel():
    sample = screen_sample.sample_at(
        500, 400, radius=10, capture=FakeCapture(), request_id="center"
    )

    assert sample["available"] is True
    assert sample["cursor_x"] == 10
    assert sample["cursor_y"] == 10
    assert sample["screen_width"] == 1920
    assert sample["screen_height"] == 1080


def test_sample_at_clamps_patches_at_the_screen_edge():
    image = Image.new("RGB", (13, 14), (1, 2, 3))
    image.putpixel((2, 3), (9, 8, 7))

    sample = screen_sample.sample_at(2, 3, radius=10, capture=FakeCapture(image))

    assert sample["available"] is True
    assert sample["hex"] == "#090807"
    assert sample["cursor_x"] == 2
    assert sample["cursor_y"] == 3
    assert sample["patch_width"] == 13
    assert sample["patch_height"] == 14


def test_sample_at_returns_an_error_instead_of_raising():
    capture = FakeCapture()
    capture.image = None

    sample = screen_sample.sample_at(10, 10, capture=capture)

    assert sample["available"] is False
    assert sample["patch"] == ""
    assert "screen pixels" in sample["message"]
