"""Keeps the vault's "What's New" note in step with the shipped changelog.

``backend/guide/whats-new.md`` is the single source of truth and is authored
newest-first: every release adds one ``##`` section at the top. Each shipped
section the note is missing is inserted above the note's existing text, so the
note only ever grows downwards and anything the user wrote or pasted into it
survives. A section is matched by its heading, so a heading the note already
has is never written twice.

The vault is resolved through ``notes_store.get_notes_dir()`` on every run,
which reads the configured folder — so when the notes folder is changed in
Settings, the next run writes the note into the new folder and nothing is
written back to the old one. The sync therefore runs on daemon start *and*
before every notes list, never on a timer.
"""

from __future__ import annotations

import logging
import re
import shutil
from typing import Any, Dict, List, Optional, Tuple

from ..guide_store import GuideUnavailableError, get_guide_dir
from . import notes_store

logger = logging.getLogger("aether.notes")

NOTE_TITLE = "What's New"
CHANGELOG_FILE = "whats-new.md"
IMAGES_DIR = "whats-new"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_HEADING_RE = re.compile(r"^##[ \t]+(.+?)[ \t]*$", re.MULTILINE)
# Authoring notes at the top of the changelog are for whoever edits the repo.
_LEADING_COMMENT_RE = re.compile(r"\A(?:\s*<!--.*?-->\s*)+", re.DOTALL)


def _changelog_text() -> str:
    """Reads the shipped changelog, or '' when this build does not carry it."""
    try:
        path = get_guide_dir() / CHANGELOG_FILE
    except GuideUnavailableError:
        return ""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    return _LEADING_COMMENT_RE.sub("", text).strip()


def copy_changelog_images() -> int:
    """Copies the shipped screenshots into the vault's `assets/` folder.

    Markdown in the vault can only render images served from there (see
    `notes_store.asset_path`), so the changelog references them as
    `assets/whats-new-….png`. Files are copied under their shipped name, which
    keeps `whats-new-` in the name so a user's own assets cannot collide.

    Returns the number of files written.

    shortcut: an image replaced in place with a byte-identical size is skipped;
    rename it (or bump the version in the name) when swapping a shipped shot.
    """
    try:
        source_dir = get_guide_dir() / IMAGES_DIR
    except GuideUnavailableError:
        return 0
    if not source_dir.is_dir():
        return 0
    try:
        target_dir = notes_store.get_assets_dir()
    except OSError as exc:
        logger.debug("Could not open the notes assets folder: %s", exc)
        return 0

    written = 0
    for source in sorted(source_dir.iterdir()):
        if not source.is_file() or source.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        if not source.name.startswith("whats-new-"):
            continue
        target = target_dir / source.name
        try:
            if target.is_file() and target.stat().st_size == source.stat().st_size:
                continue
            shutil.copyfile(source, target)
            written += 1
        except OSError as exc:
            logger.debug("Could not copy changelog image %s: %s", source.name, exc)
    return written


def _sections(text: str) -> List[Tuple[str, str]]:
    """Splits Markdown into (heading key, section) pairs for `##` headings."""
    headings = list(_HEADING_RE.finditer(text))
    sections: List[Tuple[str, str]] = []
    for index, heading in enumerate(headings):
        end = (
            headings[index + 1].start()
            if index + 1 < len(headings)
            else len(text)
        )
        sections.append(
            (heading.group(1).strip().lower(), text[heading.start():end].strip())
        )
    return sections


def _find_note() -> Optional[Dict[str, Any]]:
    """The generated note, matched by title so it survives a rename."""
    wanted = NOTE_TITLE.lower()
    for note in notes_store.list_notes().get("notes", []):
        if str(note.get("title") or "").strip().lower() == wanted:
            return note
    return None


def sync_whats_new_note() -> Optional[Dict[str, Any]]:
    """Creates the note, or adds the sections it is missing.

    Returns the note when it changed and None when there was nothing to do, so
    callers can stay silent on the common no-op path.
    """
    text = _changelog_text()
    if not text:
        return None
    try:
        # Runs before the note is read, so a vault that lost its `assets/`
        # folder gets the screenshots back even when no text has changed.
        copy_changelog_images()
        note = _find_note()
        if note is None:
            return notes_store.save_note(None, NOTE_TITLE, text)["note"]

        current = notes_store.read_note(str(note.get("id") or ""))
        if current is None:
            return None
        body = str(current.get("content") or "").strip()
        have = {heading for heading, _section in _sections(body)}
        missing = [
            section
            for heading, section in _sections(text)
            if heading not in have
        ]
        if not missing:
            return None
        merged = "\n\n".join(missing + ([body] if body else []))
        return notes_store.save_note(str(note.get("id") or ""), NOTE_TITLE, merged)[
            "note"
        ]
    except OSError as exc:
        # A vault that cannot be written must never break the notes list.
        logger.debug("Could not update the What's New note: %s", exc)
        return None


__all__ = [
    "NOTE_TITLE",
    "CHANGELOG_FILE",
    "IMAGES_DIR",
    "copy_changelog_images",
    "sync_whats_new_note",
]
