"""
Aether Configuration REST API
Provides POST /api/config for external clients while sharing the same
persistence and hotkey-reload path as the WebSocket Settings modal.
"""

from typing import Any, Dict

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api", tags=["config"])


@router.post("/config")
async def save_config(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Saves a complete or partial configuration object."""
    updates = payload.get("config", payload)
    if not isinstance(updates, dict):
        raise HTTPException(status_code=400, detail="Config payload must be an object.")
    from .config_events import apply_config_update

    return await apply_config_update(updates)
