"""Notes vault tests: frontmatter, rename, pinning, deletion, and assets."""

import base64

import pytest

from backend.notes import notes_store


@pytest.fixture()
def vault(tmp_path, monkeypatch):
    monkeypatch.setattr(notes_store, "get_notes_dir", lambda: tmp_path)
    return tmp_path


def test_create_and_read(vault):
    result = notes_store.save_note(None, "Grocery list", "- milk\n- eggs", "mint", False)
    note = result["note"]
    assert result["created"] is True
    assert (vault / "Grocery list.md").exists()
    assert note["theme"] == "mint"
    loaded = notes_store.read_note(note["id"])
    assert loaded["title"] == "Grocery list"
    assert "milk" in loaded["content"]
    raw = (vault / "Grocery list.md").read_text(encoding="utf-8")
    assert raw.startswith("---")
    assert f"id: {note['id']}" in raw


def test_rename_keeps_id_and_theme(vault):
    created = notes_store.save_note(None, "Draft", "hello", "paper", False)["note"]
    updated = notes_store.save_note(
        created["id"], "Final", "hello world", None, True
    )["note"]
    assert updated["id"] == created["id"]
    assert updated["pinned"] is True
    assert updated["theme"] == "paper"
    assert (vault / "Final.md").exists()
    assert not (vault / "Draft.md").exists()


def test_pinned_sorts_first(vault):
    first = notes_store.save_note(None, "First", "", None, False)["note"]
    second = notes_store.save_note(None, "Second", "", None, True)["note"]
    listed = notes_store.list_notes()["notes"]
    assert [note["id"] for note in listed] == [second["id"], first["id"]]


def test_delete(vault):
    note = notes_store.save_note(None, "Temp", "", None, False)["note"]
    assert notes_store.delete_note(note["id"]) is True
    assert notes_store.read_note(note["id"]) is None
    assert list(vault.glob("*.md")) == []


def test_external_markdown_is_listed(vault):
    (vault / "external.md").write_text("# Hello\n\nBody", encoding="utf-8")
    listed = notes_store.list_notes()["notes"]
    assert len(listed) == 1
    assert listed[0]["id"].startswith("ext-")
    loaded = notes_store.read_note(listed[0]["id"])
    assert loaded["title"] == "external"
    assert "Body" in loaded["content"]


def test_images_are_saved_inside_assets(vault):
    payload = base64.b64encode(b"\x89PNG\r\n\x1a\nfake").decode()
    relative = notes_store.save_image("shot.png", f"data:image/png;base64,{payload}")
    assert relative.startswith("assets/")
    name = relative.split("/", 1)[1]
    path = notes_store.asset_path(name)
    assert path.read_bytes().startswith(b"\x89PNG")

    with pytest.raises(FileNotFoundError):
        notes_store.asset_path("../escape.png")
    with pytest.raises(ValueError):
        notes_store.save_image("x.txt", "data:text/plain;base64,aGk=")
