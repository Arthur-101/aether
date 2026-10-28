"""HTTP preview endpoints for the Radial Wheel image editors."""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from .mcp_tools.media_tools import image_preview

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
