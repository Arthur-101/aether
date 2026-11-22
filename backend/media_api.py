"""HTTP preview and estimate endpoints for the Radial Wheel media popups."""

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from .mcp_tools.media_tools import estimate_media_size, image_preview

router = APIRouter(prefix="/api/media", tags=["media"])

_IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".bmp",
    ".gif",
    ".tif",
    ".tiff",
    ".heic",
    ".heif",
    ".avif",
}


@router.get("/preview")
def preview_image(
    path: str = Query(..., min_length=1, description="Absolute image path"),
) -> dict:
    """Returns the oriented pixel size and a bounded thumbnail for a local image."""
    source = Path(path)
    if not source.exists() or not source.is_file():
        raise HTTPException(status_code=404, detail="Image not found.")
    if source.suffix.lower() not in _IMAGE_EXTENSIONS:
        raise HTTPException(status_code=415, detail="This file is not a supported image.")

    try:
        return {"path": str(source), **image_preview(str(source))}
    except Exception as exc:
        raise HTTPException(
            status_code=422, detail=f"Could not read this image: {exc}"
        ) from exc


@router.get("/estimate")
def estimate_media(
    path: str = Query(..., min_length=1, description="Absolute media path"),
    quality: int = Query(65, ge=1, le=100, description="Quality 1-100"),
    target_mb: Optional[float] = Query(None, gt=0, description="Optional size cap"),
) -> dict:
    """Approximate compressed size for the chosen settings, from a real sample."""
    source = Path(path)
    if not source.exists() or not source.is_file():
        raise HTTPException(status_code=404, detail="File not found.")

    try:
        return {
            "path": str(source),
            **estimate_media_size(str(source), quality, target_mb),
        }
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=422, detail=f"Could not estimate this file: {exc}"
        ) from exc
