"""Notes tool tests: resolution, read/search, append, pin, and schema wiring."""

import pytest

from backend.mcp_tools import note_tools
from backend.notes import notes_store


@pytest.fixture()
def vault(tmp_path, monkeypatch):
    monkeypatch.setattr(notes_store, "get_notes_dir", lambda: tmp_path)
    return tmp_path


def test_list_notes_empty_then_filled(vault):
    assert "empty" in note_tools.list_notes()
    note_tools.create_note("Grocery list", "- milk")
    listing = note_tools.list_notes()
    assert "Grocery list" in listing
    assert "1 note(s)" in listing


def test_create_note_then_read_by_title_and_id(vault):
    created = note_tools.create_note("Ideas", "first thought")
    note_id = created.split("id ")[1].rstrip(").")

    by_id = note_tools.read_note(note_id)
    assert "first thought" in by_id
    assert "Ideas" in by_id

    by_title = note_tools.read_note("ideas")  # case-insensitive
    assert "first thought" in by_title


def test_read_note_truncates_long_bodies(vault):
    note_tools.create_note("Long", "x" * 500)
    out = note_tools.read_note("Long", max_chars=200)
    assert "Truncated" in out
    assert len(out) < 500


def test_search_matches_title_and_body(vault):
    note_tools.create_note("Trip plan", "pack the tent and the map")
    note_tools.create_note("Other", "nothing relevant")

    title_hit = note_tools.search_notes("trip")
    assert "Trip plan" in title_hit

    body_hit = note_tools.search_notes("tent")
    assert "Trip plan" in body_hit
    assert "tent" in body_hit

    assert "No notes match" in note_tools.search_notes("zzzz")


def test_append_keeps_existing_body(vault):
    created = note_tools.create_note("Log", "line one")
    note_id = created.split("id ")[1].rstrip(").")

    note_tools.append_to_note(note_id, "line two")
    content = notes_store.read_note(note_id)["content"]
    assert "line one" in content
    assert "line two" in content


def test_append_to_blank_note_has_no_leading_break(vault):
    created = note_tools.create_note("Blank")
    note_id = created.split("id ")[1].rstrip(").")
    note_tools.append_to_note(note_id, "only line")
    assert notes_store.read_note(note_id)["content"].strip() == "only line"


def test_pin_and_unpin(vault):
    created = note_tools.create_note("Pin me")
    note_id = created.split("id ")[1].rstrip(").")

    assert "Pinned" in note_tools.set_note_pinned(note_id, True)
    assert notes_store.read_note(note_id)["pinned"] is True

    assert "Unpinned" in note_tools.set_note_pinned("Pin me", False)
    assert notes_store.read_note(note_id)["pinned"] is False


def test_ambiguous_and_missing_references(vault):
    note_tools.create_note("Report alpha")
    note_tools.create_note("Report beta")

    ambiguous = note_tools.read_note("report")
    assert "matches 2 notes" in ambiguous

    assert "No note matches" in note_tools.read_note("does not exist")
    assert "Which note" in note_tools.read_note("")


def test_note_tool_schemas_are_registered():
    from backend.mcp_tools.server import TOOL_DISPATCH, get_openai_tool_schemas

    schema_names = {item["function"]["name"] for item in get_openai_tool_schemas()}
    expected = {
        "list_notes",
        "search_notes",
        "read_note",
        "create_note",
        "append_to_note",
        "set_note_pinned",
    }
    assert expected <= schema_names
    assert expected <= set(TOOL_DISPATCH)
    # Delete and whole-body replace are gated behind the permission layer (F1).
    assert "delete_note" not in schema_names
    assert "update_note" not in schema_names