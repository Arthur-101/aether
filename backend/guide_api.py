"""Read-only HTTP API for the bundled Aether guide.

Settings -> Guide renders the same Markdown files the assistant reads through
the guide tools. Nothing here writes to disk, and topic ids are resolved against
the public topic list, so a request cannot escape the guide folder.
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Query

from . import guide_store

router = APIRouter(prefix="/api/guide", tags=["guide"])


@router.get("/index")
def get_guide_index() -> Dict[str, Any]:
    """Returns the rendered index and the topic directory."""
    try:
        return guide_store.index_payload()
    except guide_store.GuideUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/topics/{topic_id}")
def get_guide_topic(topic_id: str) -> Dict[str, Any]:
    """Returns one topic by its stable id."""
    if not guide_store.TOPIC_ID_RE.fullmatch((topic_id or "").strip().lower()):
        raise HTTPException(status_code=404, detail="Guide topic not found.")
    try:
        topic = guide_store.read_topic(topic_id)
    except guide_store.GuideUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if topic is None:
        raise HTTPException(status_code=404, detail="Guide topic not found.")
    return topic


@router.get("/search")
def search_guide(
    q: str = Query(default="", max_length=200),
    limit: int = Query(default=5, ge=1, le=guide_store.MAX_SEARCH_RESULTS),
) -> Dict[str, Any]:
    """Returns lexical topic matches; this routes, it does not retrieve chunks."""
    try:
        results = guide_store.search_topics(q, limit=limit)
    except guide_store.GuideUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"query": q, "results": results}
