"""
Aether Notes HTTP API
Serves vault image assets and exposes small OS filesystem shortcuts.
WebSocket handlers live in `backend/note_events.py`.
"""

import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .notes_store import asset_path, get_notes_dir, save_image

router = APIRouter(prefix="/notes", tags=["notes"])


class NoteImageUpload(BaseModel):
    file_name: str = ""
    data_url: str


@router.get("/assets/{name}")
def get_note_asset(name: str) -> FileResponse:
    """Returns a note image, restricted to the vault's assets folder."""
    try:
        path = asset_path(name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Asset not found.") from exc
    return FileResponse(path)


@router.post("/assets")
def upload_note_asset(payload: NoteImageUpload) -> dict:
    """Accepts a data-URL image from paste/drop and stores it in the vault."""
    try:
        relative = save_image(payload.file_name, payload.data_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"path": relative}


@router.get("/open-folder")
def open_notes_folder() -> dict:
    """Opens the configured notes vault in Explorer."""
    directory = get_notes_dir()
    try:
        os.startfile(str(directory))  # type: ignore[attr-defined]
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"directory": str(directory)}
