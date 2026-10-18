"""
Aether Media Tools
Deterministic image, video, and audio conversion, compression, and background removal.
Zero LLM latency. Uses Pillow, pillow-heif, piexif, rembg, and local bin/ffmpeg.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional
from PIL import Image

# Register HEIC and AVIF openers if available
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass


def get_binary_path(binary_name: str) -> str:
    """Resolves binary from bin/ directory or system PATH (Rule 1: Portability)."""
    # Check if bundled in sys._MEIPASS (PyInstaller)
    if hasattr(sys, "_MEIPASS"):
        bundled = Path(sys._MEIPASS) / "bin" / f"{binary_name}.exe"
        if bundled.exists():
            return str(bundled)

    # Check project bin/ directory relative to this file
    local_bin = Path(__file__).resolve().parent.parent.parent / "bin" / f"{binary_name}.exe"
    if local_bin.exists():
        return str(local_bin)

    # Fallback to system PATH
    sys_path = shutil.which(binary_name)
    if sys_path:
        return sys_path

    return binary_name


def convert_image_format(file_path: str, target_format: str) -> str:
    """
    Converts an image to target format (png, jpg, webp, heic, tiff, avif, bmp, pdf).
    Saves the output file in the same directory as the source.
    """
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"Source file not found: {file_path}")

    fmt = target_format.lower().strip(".")
    out_path = p.with_name(f"{p.stem}.{fmt}")

    with Image.open(p) as img:
        # Convert transparent formats to RGB if destination doesn't support alpha
        if fmt in ("jpg", "jpeg", "bmp", "pdf") and img.mode in ("RGBA", "P", "LA"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
            img = background
        elif img.mode != "RGB" and fmt in ("jpg", "jpeg"):
            img = img.convert("RGB")

        save_fmt = "JPEG" if fmt in ("jpg", "jpeg") else fmt.upper()
        img.save(out_path, format=save_fmt)

    return str(out_path)


def strip_image_metadata(file_path: str) -> str:
    """Removes all EXIF, GPS, and camera metadata from an image."""
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"Source file not found: {file_path}")

    out_path = p.with_name(f"{p.stem}_clean{p.suffix}")
    with Image.open(p) as img:
        data = list(img.getdata())
        clean_img = Image.new(img.mode, img.size)
        clean_img.putdata(data)
        clean_img.save(out_path)

    return str(out_path)


def remove_image_background(file_path: str) -> str:
    """Removes background from an image using rembg and saves as a transparent PNG."""
    from rembg import remove
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"Source file not found: {file_path}")

    out_path = p.with_name(f"{p.stem}_nobg.png")
    with open(p, "rb") as f_in:
        input_bytes = f_in.read()

    output_bytes = remove(input_bytes)
    with open(out_path, "wb") as f_out:
        f_out.write(output_bytes)

    return str(out_path)


def compress_media(file_path: str, target_mb: float = 5.0) -> str:
    """
    Compresses an image, video, or PDF to reduce disk size.
    Uses Pillow for images, FFmpeg for videos, and PyMuPDF for PDFs.
    """
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"Source file not found: {file_path}")

    ext = p.suffix.lower()
    out_path = p.with_name(f"{p.stem}_compressed{ext}")

    if ext in (".jpg", ".jpeg", ".png", ".webp"):
        with Image.open(p) as img:
            if img.mode in ("RGBA", "P") and ext in (".jpg", ".jpeg"):
                img = img.convert("RGB")
            img.save(out_path, optimize=True, quality=65)
        return str(out_path)

    elif ext in (".mp4", ".mov", ".mkv", ".avi", ".webm"):
        ffprobe = get_binary_path("ffprobe")
        ffmpeg = get_binary_path("ffmpeg")

        # Get video duration
        probe = subprocess.run(
            [ffprobe, "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(p)],
            capture_output=True, text=True, check=True
        )
        duration = float(probe.stdout.strip())
        target_kbps = int((target_mb * 8192) / max(duration, 1.0))
        video_kbps = max(target_kbps - 128, 200)

        no_win = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        subprocess.run([
            ffmpeg, "-y", "-i", str(p),
            "-b:v", f"{video_kbps}k", "-b:a", "128k", str(out_path)
        ], check=True, creationflags=no_win)
        return str(out_path)

    elif ext == ".pdf":
        import fitz
        doc = fitz.open(str(p))
        doc.save(str(out_path), garbage=4, deflate=True, clean=True)
        doc.close()
        return str(out_path)

    return f"Unsupported format for compression: {ext}"
