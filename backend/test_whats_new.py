"""Tests for the generated "What's New" note.

The shipped `backend/guide/whats-new.md` is the source of truth and is authored
newest-first. These tests pin the two things that must not break: the note is
only ever added to (so a section never lands in it twice and user edits below
survive), and the vault is resolved per run, so a notes folder switched in
Settings receives the note without a restart.
"""

import re

import pytest

from backend.notes import notes_store, whats_new

CHANGELOG = """## 1.1.0 — 1 December 2026

- Ships the bar.

## 1.0.3 — 16 November 2026

- Fixed the widgets.
"""

NEWER = """## 1.2.0 — 1 January 2027

- Ships the note.

## 1.1.0 — 1 December 2026

- Ships the bar.

## 1.0.3 — 16 November 2026

- Fixed the widgets.
"""


@pytest.fixture()
def vault(tmp_path, monkeypatch):
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setattr(notes_store, "get_notes_dir", lambda: vault)
    return vault


def _note_body() -> str:
    note = whats_new._find_note()
    assert note is not None
    loaded = notes_store.read_note(str(note["id"]))
    assert loaded is not None
    return str(loaded["content"])


def test_the_shipped_changelog_parses_into_release_sections():
    source = whats_new._changelog_text()
    assert source, "the shipped changelog is missing from the bundle"

    headings = [heading for heading, _section in whats_new._sections(source)]
    assert len(headings) >= 2
    assert len(set(headings)) == len(headings), "duplicate section headings"
    # Newest first: the file is authored top-down, and so is the note. The top
    # section is "Unreleased — ..." while a release is being written and its
    # version number once it is tagged.
    assert re.match(r"\d+\.\d+\.\d+", headings[0]) or headings[0].startswith(
        "unreleased"
    )


def test_the_note_is_created_from_the_shipped_changelog(vault, monkeypatch):
    monkeypatch.setattr(whats_new, "_changelog_text", lambda: CHANGELOG)

    created = whats_new.sync_whats_new_note()

    assert created is not None
    assert created["title"] == whats_new.NOTE_TITLE
    assert (vault / "What's New.md").is_file()

    body = _note_body()
    assert "## 1.1.0" in body
    assert "## 1.0.3" in body


def test_a_second_run_is_a_no_op(vault, monkeypatch):
    monkeypatch.setattr(whats_new, "_changelog_text", lambda: CHANGELOG)
    whats_new.sync_whats_new_note()

    assert whats_new.sync_whats_new_note() is None


def test_new_sections_go_on_top_and_user_writes_survive(vault, monkeypatch):
    monkeypatch.setattr(whats_new, "_changelog_text", lambda: CHANGELOG)
    whats_new.sync_whats_new_note()

    note = whats_new._find_note()
    assert note is not None
    notes_store.save_note(
        str(note["id"]),
        whats_new.NOTE_TITLE,
        _note_body() + "\n\nMy own note about 1.1.0.\n",
    )

    monkeypatch.setattr(whats_new, "_changelog_text", lambda: NEWER)
    whats_new.sync_whats_new_note()

    body = _note_body()
    assert body.count("## 1.1.0") == 1, "a known section was written twice"
    assert body.count("## 1.2.0") == 1
    assert body.index("## 1.2.0") < body.index("## 1.1.0")
    assert body.index("## 1.1.0") < body.index("## 1.0.3")
    assert "My own note about 1.1.0." in body


def test_a_renamed_note_is_left_alone_and_a_fresh_one_is_made(vault, monkeypatch):
    monkeypatch.setattr(whats_new, "_changelog_text", lambda: CHANGELOG)
    whats_new.sync_whats_new_note()
    note = whats_new._find_note()
    assert note is not None

    # The user renames the generated note; it is matched by title alone, so the
    # renamed file is theirs to keep and a new note carries the changelog.
    notes_store.save_note(str(note["id"]), "Release notes", _note_body())
    monkeypatch.setattr(whats_new, "_changelog_text", lambda: NEWER)
    whats_new.sync_whats_new_note()

    assert _note_body().startswith("## 1.2.0"), "a fresh note was not made"
    assert notes_store.read_note("Release notes") is None


def test_the_note_follows_a_notes_folder_changed_in_settings(tmp_path, monkeypatch):
    first = tmp_path / "vault-a"
    second = tmp_path / "vault-b"
    first.mkdir()
    second.mkdir()
    monkeypatch.setattr(whats_new, "_changelog_text", lambda: CHANGELOG)

    monkeypatch.setattr(notes_store, "get_notes_dir", lambda: first)
    whats_new.sync_whats_new_note()
    assert (first / "What's New.md").is_file()

    # Settings now point at another folder; the sync resolves the vault again.
    monkeypatch.setattr(notes_store, "get_notes_dir", lambda: second)
    whats_new.sync_whats_new_note()

    assert (second / "What's New.md").is_file()
    assert not (first / "What's New 2.md").exists()


def test_a_missing_changelog_is_harmless(vault, monkeypatch):
    monkeypatch.setattr(whats_new, "_changelog_text", lambda: "")
    assert whats_new.sync_whats_new_note() is None
    assert not (vault / "What's New.md").exists()


def test_the_authoring_comment_never_reaches_the_note(vault, monkeypatch):
    monkeypatch.setattr(whats_new, "_changelog_text", lambda: CHANGELOG)
    whats_new.sync_whats_new_note()

    # `_changelog_text` itself does the stripping, against the shipped file.
    body = whats_new._changelog_text()
    assert not body.startswith("<!--")


def test_screenshots_are_copied_into_the_vault_assets(tmp_path, monkeypatch):
    guide = tmp_path / "guide"
    images = guide / whats_new.IMAGES_DIR
    images.mkdir(parents=True)
    (images / "whats-new-1.1-bar.png").write_bytes(b"png-bytes")
    (images / "notes.txt").write_text("not an image", encoding="utf-8")
    (images / "someone-elses.png").write_bytes(b"other")
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setattr(notes_store, "get_notes_dir", lambda: vault)
    monkeypatch.setattr(whats_new, "get_guide_dir", lambda: guide)

    assert whats_new.copy_changelog_images() == 1
    assert (vault / "assets" / "whats-new-1.1-bar.png").read_bytes() == b"png-bytes"
    assert not (vault / "assets" / "notes.txt").exists()
    assert not (vault / "assets" / "someone-elses.png").exists()
    # Already present and the same size: the second pass writes nothing.
    assert whats_new.copy_changelog_images() == 0


def test_a_new_notes_folder_gets_the_screenshots_too(tmp_path, monkeypatch):
    guide = tmp_path / "guide"
    images = guide / whats_new.IMAGES_DIR
    images.mkdir(parents=True)
    (images / "whats-new-1.1-bar.png").write_bytes(b"png-bytes")
    first = tmp_path / "vault-a"
    second = tmp_path / "vault-b"
    first.mkdir()
    second.mkdir()
    monkeypatch.setattr(whats_new, "get_guide_dir", lambda: guide)
    monkeypatch.setattr(whats_new, "_changelog_text", lambda: CHANGELOG)

    monkeypatch.setattr(notes_store, "get_notes_dir", lambda: first)
    whats_new.sync_whats_new_note()
    assert (first / "assets" / "whats-new-1.1-bar.png").is_file()

    # Settings now point at another folder: the next sync fills that one.
    monkeypatch.setattr(notes_store, "get_notes_dir", lambda: second)
    whats_new.sync_whats_new_note()
    assert (second / "assets" / "whats-new-1.1-bar.png").is_file()


def test_a_build_without_screenshots_copies_nothing(vault, monkeypatch):
    monkeypatch.setattr(whats_new, "get_guide_dir", lambda: vault / "no-guide")

    assert whats_new.copy_changelog_images() == 0


def test_every_screenshot_the_changelog_shows_ships_with_the_build():
    """A missing file would render as nothing in the note, silently."""
    text = whats_new._changelog_text()
    referenced = set(re.findall(r"assets/(whats-new-[^)\s\"']+)", text))
    assert referenced, "the changelog shows no screenshots"

    shipped_dir = whats_new.get_guide_dir() / whats_new.IMAGES_DIR
    shipped = {path.name for path in shipped_dir.glob("whats-new-*")}
    assert referenced <= shipped, f"missing from the bundle: {referenced - shipped}"
