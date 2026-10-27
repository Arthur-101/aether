"""
Aether Notes Tools
Deterministic note-vault tools for the LLM: list, search, read, create, append,
pin, replace, and delete.

Delete and whole-body replace can lose user data, so both are registered as
`destructive` in the F1 permission table. The router pauses for explicit user
approval before either function runs.

Every function returns a human-readable string because the result is fed back to
the model as a tool message.
"""

from typing import Any, Dict, List, Optional, Tuple

from ..notes import notes_store

DEFAULT_READ_CHARS = 6000
DEFAULT_SEARCH_LIMIT = 5
SNIPPET_RADIUS = 90
MAX_CANDIDATES = 10

# Every notes tool takes a note reference as either a stable id or a fuzzy title.
_NOTE_REF_DESC = "Note id or title. A partial title works if it is unambiguous."


def _describe(meta: Dict[str, Any]) -> str:
    """Formats one note's metadata as a single list line."""
    pinned = " · pinned" if meta.get("pinned") else ""
    return f"- {meta.get('id')} · {meta.get('title')}{pinned} · updated {meta.get('updated', '')}"


def _resolve(ref: str) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    """Resolves `ref` to one note by exact id, exact title, then unique substring.

    Returns `(note, candidates)`. When the reference is ambiguous or unknown the
    note is None and `candidates` holds the metadata rows that nearly matched, so
    the caller can ask the user which one they meant.
    """
    available = notes_store.list_notes().get("notes", [])

    exact_id = next((meta for meta in available if meta.get("id") == ref), None)
    if exact_id is not None:
        return notes_store.read_note(str(exact_id["id"])), []

    lowered = ref.lower()
    exact_title = [meta for meta in available if str(meta.get("title", "")).lower() == lowered]
    if len(exact_title) == 1:
        return notes_store.read_note(str(exact_title[0]["id"])), []

    partial = [meta for meta in available if lowered in str(meta.get("title", "")).lower()]
    if len(partial) == 1:
        return notes_store.read_note(str(partial[0]["id"])), []

    return None, partial or exact_title


def _locate(ref: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Returns `(note, error)`. Exactly one of the pair is set."""
    clean = (ref or "").strip()
    if not clean:
        return None, "Which note? Pass a title or a note id."
    note, candidates = _resolve(clean)
    if note is not None:
        return note, None
    if candidates:
        lines = [f"'{clean}' matches {len(candidates)} notes — which one did you mean?"]
        lines += [_describe(meta) for meta in candidates[:MAX_CANDIDATES]]
        return None, "\n".join(lines)
    available = notes_store.list_notes().get("notes", [])
    if not available:
        return None, f"No note matches '{clean}'. The vault is empty."
    titles = ", ".join(str(meta.get("title", "")) for meta in available[:MAX_CANDIDATES])
    return None, f"No note matches '{clean}'. Existing notes: {titles}."


def _snippet(body: str, position: int) -> str:
    """Returns a one-line context window around a body match."""
    start = max(0, position - SNIPPET_RADIUS)
    end = min(len(body), position + SNIPPET_RADIUS)
    text = " ".join(body[start:end].split())
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(body) else ""
    return f"{prefix}{text}{suffix}"


def list_notes() -> str:
    """Lists every note in the vault, pinned first (titles only, no bodies)."""
    listing = notes_store.list_notes()
    notes = listing.get("notes", [])
    if not notes:
        return "The notes vault is empty. Create one with create_note."
    lines = [f"{len(notes)} note(s) in {listing.get('directory', '')}:"]
    lines += [_describe(meta) for meta in notes]
    return "\n".join(lines)


def search_notes(query: str, limit: int = DEFAULT_SEARCH_LIMIT) -> str:
    """Searches note titles and bodies for a keyword or phrase."""
    needle = (query or "").strip().lower()
    if not needle:
        return "Provide a search query."
    try:
        max_hits = max(1, int(limit))
    except (TypeError, ValueError):
        max_hits = DEFAULT_SEARCH_LIMIT

    title_hits: List[str] = []
    body_hits: List[str] = []
    for meta in notes_store.list_notes().get("notes", []):
        title = str(meta.get("title", ""))
        note = notes_store.read_note(str(meta.get("id"))) or {}
        body = str(note.get("content", "") or "")
        if needle in title.lower():
            title_hits.append(f"- {meta.get('id')} · {title}")
            continue
        position = body.lower().find(needle)
        if position >= 0:
            body_hits.append(f"- {meta.get('id')} · {title}\n    {_snippet(body, position)}")

    matches = (title_hits + body_hits)[:max_hits]
    if not matches:
        return f"No notes match '{query}'."
    return f"{len(matches)} match(es) for '{query}':\n" + "\n".join(matches)


def read_note(note: str, max_chars: int = DEFAULT_READ_CHARS) -> str:
    """Returns the body of one note, resolved by id or title."""
    found, error = _locate(note)
    if error:
        return error
    assert found is not None
    content = str(found.get("content", "") or "")
    try:
        cap = max(200, int(max_chars))
    except (TypeError, ValueError):
        cap = DEFAULT_READ_CHARS

    header = f"# {found.get('title')} (id {found.get('id')})"
    if len(content) > cap:
        header += f"\n[Truncated: {cap} of {len(content)} characters shown. Use search_notes for the rest.]"
        content = content[:cap]
    return f"{header}\n\n{content}".rstrip()


def create_note(title: str, content: str = "") -> str:
    """Creates a new note and returns its id so it can be edited later."""
    clean = (title or "").strip()
    if not clean:
        return "A note needs a title."
    result = notes_store.save_note(None, clean, content or "")
    created = result["note"]
    return f"Created '{created['title']}' (id {created['id']})."


def append_to_note(note: str, text: str) -> str:
    """Appends text to a note, keeping the existing body."""
    found, error = _locate(note)
    if error:
        return error
    assert found is not None
    addition = str(text or "").strip()
    if not addition:
        return "Nothing to append."

    body = str(found.get("content", "") or "").rstrip()
    merged = f"{body}\n\n{addition}" if body else addition
    result = notes_store.save_note(
        str(found.get("id")),
        str(found.get("title") or "Untitled note"),
        merged,
        found.get("theme"),
        found.get("pinned"),
    )
    return f"Appended to '{result['note']['title']}' ({len(merged)} characters)."


def set_note_pinned(note: str, pinned: bool = True) -> str:
    """Pins or unpins a note so it sorts to the top of the list."""
    found, error = _locate(note)
    if error:
        return error
    assert found is not None
    result = notes_store.set_note_pinned(str(found.get("id")), bool(pinned))
    if result is None:
        return f"Note '{note}' was not found."
    state = "Pinned" if pinned else "Unpinned"
    return f"{state} '{result['note']['title']}'."


def update_note(note: str, content: str) -> str:
    """Replaces an existing note's entire body, keeping its title and metadata.

    Destructive: the router requires explicit approval before calling this.
    """
    found, error = _locate(note)
    if error:
        return error
    assert found is not None

    body = content or ""
    old_length = len(str(found.get("content", "") or ""))
    result = notes_store.save_note(
        str(found.get("id")),
        str(found.get("title") or "Untitled note"),
        body,
        found.get("theme"),
        found.get("pinned"),
    )
    return (
        f"Replaced the body of '{result['note']['title']}' "
        f"({old_length} → {len(body)} characters)."
    )


def delete_note(note: str) -> str:
    """Permanently deletes an existing note.

    Destructive: the router requires explicit approval before calling this.
    """
    found, error = _locate(note)
    if error:
        return error
    assert found is not None

    if not notes_store.delete_note(str(found.get("id"))):
        return (
            f"Could not delete '{found.get('title')}'. "
            "The file may be open or read-only."
        )
    return f"Deleted '{found.get('title')}' (id {found.get('id')})."


def get_note_tool_schemas() -> List[Dict[str, Any]]:
    """OpenAI/GGUF function schemas for the notes tool group."""
    return [
        {
            "type": "function",
            "function": {
                "name": "list_notes",
                "description": "List every note in the user's vault (titles only).",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "search_notes",
                "description": "Search the user's notes by keyword or phrase, in titles and bodies.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Keyword or phrase to find."},
                        "limit": {"type": "integer", "description": f"Max matches (default {DEFAULT_SEARCH_LIMIT})."},
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "read_note",
                "description": "Read the full body of one note.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "note": {"type": "string", "description": _NOTE_REF_DESC},
                        "max_chars": {"type": "integer", "description": f"Character cap (default {DEFAULT_READ_CHARS})."},
                    },
                    "required": ["note"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "create_note",
                "description": "Create a new note in the user's vault.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Note title."},
                        "content": {"type": "string", "description": "Markdown body (optional)."},
                    },
                    "required": ["title"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "append_to_note",
                "description": "Append text to the end of an existing note, keeping the current body.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "note": {"type": "string", "description": _NOTE_REF_DESC},
                        "text": {"type": "string", "description": "Text or markdown to append."},
                    },
                    "required": ["note", "text"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "set_note_pinned",
                "description": "Pin or unpin a note so it sorts to the top of the list.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "note": {"type": "string", "description": _NOTE_REF_DESC},
                        "pinned": {"type": "boolean", "description": "True to pin, false to unpin."},
                    },
                    "required": ["note"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "update_note",
                "description": (
                    "Replace the entire body of an existing note, keeping its title. "
                    "This cannot be undone; the user must approve it first."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "note": {"type": "string", "description": _NOTE_REF_DESC},
                        "content": {
                            "type": "string",
                            "description": "New Markdown body. Replaces the old body completely.",
                        },
                    },
                    "required": ["note", "content"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "delete_note",
                "description": (
                    "Permanently delete an existing note. "
                    "This cannot be undone; the user must approve it first."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "note": {"type": "string", "description": _NOTE_REF_DESC},
                    },
                    "required": ["note"],
                },
            },
        },
    ]