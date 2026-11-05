"""Radial Wheel selection lookup: folders must never be returned."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.os_hooks import explorer_selection as es


class FakeItem:
    def __init__(self, path, is_folder=False):
        self.Path = path
        self.IsFolder = is_folder


class FakeItems:
    def __init__(self, items):
        self._items = list(items)
        self.Count = len(self._items)

    def Item(self, index):
        return self._items[index]


class FakeDocument:
    def __init__(self, selected=(), focused=None):
        self._selected = FakeItems(selected)
        self.FocusedItem = focused

    def SelectedItems(self):
        return self._selected


class FakeWindow:
    def __init__(self, selected=(), focused=None):
        self.Document = FakeDocument(selected, focused)


def test_is_file_path_rejects_folders_and_missing(tmp_path):
    folder = tmp_path / "dir"
    folder.mkdir()
    file = tmp_path / "a.txt"
    file.write_text("hi", encoding="utf-8")

    assert es._is_file_path(str(file)) is True
    assert es._is_file_path(str(folder)) is False
    assert es._is_file_path(str(tmp_path / "missing.txt")) is False
    assert es._is_file_path("") is False


def test_selected_folder_is_skipped_for_a_file(tmp_path):
    folder = tmp_path / "dir"
    folder.mkdir()
    file = tmp_path / "a.txt"
    file.write_text("hi", encoding="utf-8")

    window = FakeWindow(selected=[FakeItem(str(folder), is_folder=True)])
    assert es._window_selected_path(window) is None

    window = FakeWindow(selected=[FakeItem(str(file))])
    assert es._window_selected_path(window) == str(file)


def test_focused_file_is_used_when_nothing_is_selected(tmp_path):
    file = tmp_path / "a.txt"
    file.write_text("hi", encoding="utf-8")

    window = FakeWindow(selected=[], focused=FakeItem(str(file)))
    assert es._window_selected_path(window) == str(file)


def test_focused_folder_is_ignored(tmp_path):
    folder = tmp_path / "dir"
    folder.mkdir()

    window = FakeWindow(selected=[], focused=FakeItem(str(folder), is_folder=True))
    assert es._window_selected_path(window) is None


class FakeShell:
    def __init__(self, windows):
        self._windows = list(windows)

    def Windows(self):
        return self._windows


class FakeTab:
    def __init__(self, hwnd, location_name, selected=()):
        self.HWND = hwnd
        self.LocationName = location_name
        self.Document = FakeDocument(selected)


def test_windows_for_hwnd_returns_every_tab():
    a = FakeTab(919816, "Sample")
    b = FakeTab(919816, "RealClips")
    c = FakeTab(197580, "brag-output")

    matches = es._windows_for_hwnd(FakeShell([a, b, c]), 919816)

    assert matches == [a, b]


def test_active_tab_follows_the_title_prefix(monkeypatch):
    sample = FakeTab(919816, "Sample")
    real = FakeTab(919816, "RealClips")
    snipping = FakeTab(919816, "Snipping")
    monkeypatch.setattr(
        es.win32gui,
        "GetWindowText",
        lambda hwnd: "RealClips and 2 more tabs - File Explorer",
    )

    assert es._active_tab([sample, real, snipping], 919816) is real


def test_active_tab_prefers_the_longest_folder_name(monkeypatch):
    short = FakeTab(1, "Real")
    long = FakeTab(1, "RealClips")
    monkeypatch.setattr(
        es.win32gui,
        "GetWindowText",
        lambda hwnd: "RealClips and 1 more tab - File Explorer",
    )

    assert es._active_tab([short, long], 1) is long


def test_active_tab_falls_back_to_a_selection(monkeypatch):
    monkeypatch.setattr(es.win32gui, "GetWindowText", lambda hwnd: "")
    empty = FakeTab(1, "A")
    selected = FakeTab(1, "B", selected=[FakeItem("C:/x.jpg")])

    assert es._active_tab([empty, selected], 1) is selected


def test_active_tab_returns_none_when_ambiguous(monkeypatch):
    monkeypatch.setattr(es.win32gui, "GetWindowText", lambda hwnd: "")
    windows = [FakeTab(1, "A"), FakeTab(1, "B")]

    assert es._active_tab(windows, 1) is None

