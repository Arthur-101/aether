"""Case sensitivity, long paths (MAX_PATH), and Unicode names.

The notes vault and the T9 file-system tools both take user paths. These tests
drive them against (a) a Unicode "username"-style root (``C:\\Users\\Jörg\\...``)
and (b) a tree deep enough to push the full path past the legacy ``MAX_PATH``
(260 character) limit. Long-path assertions skip when the host cannot create
such a tree, so the suite stays green on machines without ``LongPathsEnabled``.
"""

import base64
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from backend import filesystem_roots
from backend.mcp_tools import filesystem_tools as fs
from backend.mcp_tools.tool_permissions import build_tool_preview
from backend.notes import notes_store

MAX_PATH = 260


def _past_max_path(base: Path) -> Path:
    """Nests fixed-width segments under ``base`` until it clears MAX_PATH."""
    target = base
    index = 0
    while len(str(target)) <= MAX_PATH + 24:
        index += 1
        target = target / f"segment-{index:04d}"
    return target


@pytest.fixture()
def unicode_root(tmp_path):
    """A root shaped like a Unicode user profile (``C:\\Users\\Jörg\\...``)."""
    root = tmp_path / "Users" / "Jörg-Müller" / "Documents" / "笔记库"
    root.mkdir(parents=True, exist_ok=True)
    return root


@pytest.fixture()
def deep_root(tmp_path):
    """A root past MAX_PATH; skipped when the host cannot create it."""
    root = _past_max_path(tmp_path)
    if len(str(root)) <= MAX_PATH:
        pytest.skip("could not build a path beyond MAX_PATH")
    try:
        root.mkdir(parents=True, exist_ok=True)
    except OSError as exc:  # pragma: no cover - host without long-path support
        pytest.skip(f"host cannot create long paths: {exc}")
    return root


def test_notes_vault_supports_unicode_root_and_titles(unicode_root, monkeypatch):
    monkeypatch.setattr(notes_store, "get_notes_dir", lambda: unicode_root)
    created = notes_store.save_note(None, "Café ☕ to-dos", "- acheter du lait", "mint", False)
    note = created["note"]
    assert created["created"] is True
    assert (unicode_root / "Café ☕ to-dos.md").is_file()

    loaded = notes_store.read_note(note["id"])
    assert loaded["title"] == "Café ☕ to-dos"
    assert "lait" in loaded["content"]

    listed = notes_store.list_notes()
    assert listed["directory"] == str(unicode_root)
    assert [item["id"] for item in listed["notes"]] == [note["id"]]

    renamed = notes_store.save_note(note["id"], "Résumé 笔记", "corps", None, True)["note"]
    assert renamed["id"] == note["id"]
    assert renamed["pinned"] is True
    assert (unicode_root / "Résumé 笔记.md").is_file()
    assert not (unicode_root / "Café ☕ to-dos.md").exists()

    assert notes_store.delete_note(note["id"]) is True
    assert list(unicode_root.glob("*.md")) == []


def test_notes_assets_live_under_unicode_root(unicode_root, monkeypatch):
    monkeypatch.setattr(notes_store, "get_notes_dir", lambda: unicode_root)
    payload = base64.b64encode(b"\x89PNG\r\n\x1a\nfake").decode()
    relative = notes_store.save_image("capture.png", f"data:image/png;base64,{payload}")
    assert relative.startswith("assets/")

    name = relative.split("/", 1)[1]
    path = notes_store.asset_path(name)
    assert path.parent == unicode_root / "assets"
    assert path.read_bytes().startswith(b"\x89PNG")


def test_filesystem_tools_support_unicode_names(unicode_root, monkeypatch):
    monkeypatch.setattr(fs, "_roots", lambda: [unicode_root])

    folder = unicode_root / "Bücher"
    assert "Created folder" in fs.create_folder(str(folder))

    report = folder / "Zusammenfassung.md"
    assert "Created" in fs.create_file(str(report), "# Übersicht\n")
    assert report.read_text(encoding="utf-8") == "# Übersicht\n"
    assert "Zusammenfassung.md" in fs.find_files("*.md", root=str(folder))

    assert "Renamed" in fs.rename_file(str(report), "Zusammenfassung-überarbeitet.md")
    assert (folder / "Zusammenfassung-überarbeitet.md").is_file()

    archive = unicode_root / "Archiv"
    archive.mkdir()
    assert "Moved" in fs.move_file(
        str(folder / "Zusammenfassung-überarbeitet.md"), str(archive)
    )
    assert (archive / "Zusammenfassung-überarbeitet.md").is_file()


def test_organize_unicode_folder(unicode_root, monkeypatch):
    monkeypatch.setattr(fs, "_roots", lambda: [unicode_root])
    work = unicode_root / "Fotos 照片"
    work.mkdir()
    for name in ("Straße.jpg", "Urlaub 2024.png", "Notizen.md"):
        (work / name).write_text("data", encoding="utf-8")

    preview = build_tool_preview("organize_folder", {"path": str(work)})
    assert "Images (2)" in preview.text

    result = fs.organize_folder(str(work), "type", preview.args["_plan"])
    assert "Organized 3 file(s)" in result
    assert (work / "Images" / "Straße.jpg").is_file()
    assert (work / "Documents" / "Notizen.md").is_file()


def test_case_only_rename_preserves_capitalization(unicode_root, monkeypatch):
    monkeypatch.setattr(fs, "_roots", lambda: [unicode_root])
    source = unicode_root / "report.md"
    source.write_text("x", encoding="utf-8")

    result = fs.rename_file(str(source), "Report.md")
    assert "capitalization only" in result
    # The on-disk capitalization changed and the temp swap left nothing behind.
    stored = [path.name for path in unicode_root.iterdir()]
    assert stored == ["Report.md"]
    assert not any(name.startswith(".aether-rename") for name in stored)


def test_is_within_is_case_insensitive(tmp_path):
    root = tmp_path / "Root"
    root.mkdir()
    assert filesystem_roots.is_within(root, tmp_path / "root" / "child") is True
    assert filesystem_roots.is_within(root, tmp_path / "other") is False


def test_filesystem_roots_accept_unicode_roots(unicode_root, monkeypatch):
    monkeypatch.setattr(filesystem_roots, "default_roots", lambda: [])
    monkeypatch.setattr(filesystem_roots, "is_hard_denied", lambda _path: False)

    accepted = filesystem_roots.normalize_allowed_roots([str(unicode_root)])
    assert accepted == [str(unicode_root.resolve())]
    assert filesystem_roots.is_within(unicode_root, unicode_root / "child") is True


def test_notes_vault_beyond_max_path(deep_root, monkeypatch):
    assert len(str(deep_root)) > MAX_PATH
    monkeypatch.setattr(notes_store, "get_notes_dir", lambda: deep_root)

    created = notes_store.save_note(None, "Deep note", "buried", None, False)["note"]
    path = deep_root / "Deep note.md"
    assert len(str(path)) > MAX_PATH
    assert path.is_file()

    assert notes_store.read_note(created["id"])["content"].rstrip() == "buried"
    assert notes_store.delete_note(created["id"]) is True


def test_filesystem_tools_beyond_max_path(deep_root, monkeypatch):
    monkeypatch.setattr(fs, "_roots", lambda: [deep_root])

    folder = deep_root / "archive"
    assert "Created folder" in fs.create_folder(str(folder))

    target = folder / "data.md"
    assert "Created" in fs.create_file(str(target), "hello\n")
    assert len(str(target)) > MAX_PATH
    assert target.read_text(encoding="utf-8") == "hello\n"
    assert str(target) in fs.find_files("data.md", depth=1)

    assert "Renamed" in fs.rename_file(str(target), "renamed.md")
    renamed = folder / "renamed.md"
    assert renamed.is_file()

    preview = build_tool_preview(
        "move_file", {"source": str(renamed), "destination": str(deep_root)}
    )
    assert preview.args["_exact_target"] is True
    assert "Moved" in fs.move_file(
        preview.args["source"], preview.args["destination"], preview.args["_exact_target"]
    )
    assert (deep_root / "renamed.md").is_file()
