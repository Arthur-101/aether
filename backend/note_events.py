"""
Aether Notes WebSocket Handlers
Bridges the Markdown vault to the overlay: list/read/save/delete and attaching
a note to the active chat session.
"""

import asyncio
from typing import Any, Callable, Dict

from .event_router import register_handler
from .notes import notes_store
from .ws_manager import ws_manager


async def _run(fn: Callable[..., Any], *args: Any) -> Any:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: fn(*args))


async def _broadcast_list() -> None:
    payload = await _run(notes_store.list_notes)
    await ws_manager.broadcast("NOTES_LIST", payload)


async def _handle_list_notes(_payload: Dict[str, Any]) -> None:
    await _broadcast_list()


async def _handle_read_note(payload: Dict[str, Any]) -> None:
    note_id = str(payload.get("note_id", ""))
    note = await _run(notes_store.read_note, note_id)
    if note is None:
        await ws_manager.broadcast("ERROR", {"message": "Note was not found."})
        return
    await ws_manager.broadcast("NOTE_CONTENT", {"note": note})


async def _handle_save_note(payload: Dict[str, Any]) -> None:
    note_id = str(payload.get("note_id") or "") or None
    title = str(payload.get("title") or "Untitled note")
    content = str(payload.get("content") or "")
    theme = payload.get("theme")
    pinned = payload.get("pinned")
    result = await _run(
        notes_store.save_note,
        note_id,
        title,
        content,
        str(theme) if theme is not None else None,
        bool(pinned) if pinned is not None else None,
    )
    await ws_manager.broadcast("NOTE_SAVED", result)
    await _broadcast_list()


async def _handle_delete_note(payload: Dict[str, Any]) -> None:
    note_id = str(payload.get("note_id", ""))
    deleted = await _run(notes_store.delete_note, note_id)
    # Refresh first: the UI drops the active note, then picks the next one.
    await _broadcast_list()
    await ws_manager.broadcast(
        "NOTE_DELETED", {"note_id": note_id, "deleted": deleted}
    )


async def _handle_attach_note(payload: Dict[str, Any]) -> None:
    note_id = str(payload.get("note_id", ""))
    path = await _run(notes_store.note_file, note_id)
    if path is None:
        await ws_manager.broadcast("ERROR", {"message": "Note was not found."})
        return
    from .tool_events import attach_file

    await attach_file(str(path))


def register_note_events() -> None:
    """Registers notes vault handlers."""
    register_handler("LIST_NOTES", _handle_list_notes)
    register_handler("READ_NOTE", _handle_read_note)
    register_handler("SAVE_NOTE", _handle_save_note)
    register_handler("DELETE_NOTE", _handle_delete_note)
    register_handler("ATTACH_NOTE", _handle_attach_note)
