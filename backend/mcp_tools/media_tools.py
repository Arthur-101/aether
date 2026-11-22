"""
Aether Media Tools
Deterministic image, video, and audio conversion, compression, and background removal.
Zero LLM latency. Uses Pillow, pillow-heif, piexif, and local bin/ffmpeg.
"""

import base64
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Sequence
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps, ImageSequence

from ..output_paths import exported_path

# Register HEIC and AVIF openers if available
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass


# The optional pack that carries ffmpeg.exe/ffprobe.exe. Media tools work
# without it when a system FFmpeg is on PATH, but a clean install should point
# the user at Settings -> Components instead of failing with a raw OSError.
MEDIA_COMPONENT_ID = "ffmpeg"

IMAGE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".heic", ".avif", ".bmp", ".tif", ".tiff", ".gif",
}
VIDEO_EXTENSIONS = {
    ".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".wmv", ".flv",
}
AUDIO_EXTENSIONS = {
    ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".opus", ".flac", ".wma",
}


def _version_key(name: str) -> tuple:
    """Natural sort key so 0.10.0 sorts after 0.9.0."""
    return tuple(
        (0, int(part)) if part.isdigit() else (1, part.lower())
        for part in re.split(r"(\d+)", name)
        if part
    )


def _component_binary(
    binary_name: str, component_ids: Sequence[str], version: str
) -> Optional[Path]:
    """Returns a binary inside an installed pack, honouring id/version order."""
    if not component_ids:
        return None
    try:
        from ..config_manager import get_components_dir

        root = get_components_dir()
    except Exception:
        return None
    if not root.is_dir():
        return None

    for component_id in component_ids:
        component = root / component_id
        if not component.is_dir():
            continue
        if version:
            candidate = component / version / "bin" / f"{binary_name}.exe"
            if candidate.is_file():
                return candidate
            continue
        versions = [
            entry
            for entry in component.iterdir()
            if entry.is_dir() and (entry / "bin" / f"{binary_name}.exe").is_file()
        ]
        if versions:
            versions.sort(key=lambda entry: _version_key(entry.name))
            return versions[-1] / "bin" / f"{binary_name}.exe"
    return None


def get_binary_path(
    binary_name: str,
    component_ids: Sequence[str] = (),
    component_version: str = "",
) -> str:
    """Resolves a binary from a bundle, an installed pack, bin/, or PATH.

    Optional packs win over the developer checkout so a downloaded engine is
    used without moving files around. Rule 1: no absolute paths.
    """
    # Check if bundled in sys._MEIPASS (PyInstaller)
    if hasattr(sys, "_MEIPASS"):
        bundled = Path(sys._MEIPASS) / "bin" / f"{binary_name}.exe"
        if bundled.exists():
            return str(bundled)

    # Optional packs installed under %LOCALAPPDATA%/Aether/components
    packed = _component_binary(binary_name, component_ids, component_version)
    if packed is not None:
        return str(packed)

    # Check project bin/ directory relative to this file
    local_bin = Path(__file__).resolve().parent.parent.parent / "bin" / f"{binary_name}.exe"
    if local_bin.exists():
        return str(local_bin)

    # Fallback to system PATH
    sys_path = shutil.which(binary_name)
    if sys_path:
        return sys_path

    return binary_name


def _resolve_media_binary(binary_name: str) -> str:
    """Resolves ffmpeg/ffprobe from the media pack, dev bin/, or PATH.

    Raises a message that names the component pack when nothing is found, so a
    clean install tells the user what to do instead of surfacing a raw
    ``FileNotFoundError`` from ``subprocess``.
    """
    resolved = get_binary_path(binary_name, (MEDIA_COMPONENT_ID,))
    if Path(resolved).is_file():
        return resolved
    raise FileNotFoundError(
        f"{binary_name} was not found. Install the 'Media · FFmpeg' component in "
        "Settings -> Components, or put ffmpeg.exe on PATH."
    )


def _media_duration(path: Path) -> float:
    """Reads a media file's duration in seconds via ffprobe."""
    ffprobe = _resolve_media_binary("ffprobe")
    probe = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    try:
        return max(float(probe.stdout.strip()), 1.0)
    except ValueError:
        return 1.0


class MediaCancelled(RuntimeError):
    """Raised when the user stops a media job mid-encode."""


def _ffmpeg_run(args: list[str]) -> None:
    """Runs FFmpeg silently and raises its last stderr line on failure."""
    no_win = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    result = subprocess.run(
        args, capture_output=True, text=True, creationflags=no_win
    )
    if result.returncode != 0:
        lines = (result.stderr or "").strip().splitlines()
        raise RuntimeError(
            lines[-1] if lines else f"FFmpeg failed ({result.returncode})."
        )


def _progress_fraction(line: str, duration: float) -> Optional[float]:
    """Reads a ``-progress`` line into 0..1, or None for other keys.

    Both ``out_time_us`` and ``out_time_ms`` are microseconds in practice
    (FFmpeg's well-known misnomer), so both are divided by a million.
    """
    for key in ("out_time_us=", "out_time_ms="):
        if line.startswith(key):
            try:
                seconds = int(line[len(key):].strip()) / 1_000_000
            except ValueError:
                return None
            return max(0.0, min(1.0, seconds / duration)) if duration else None
    return None


def _run_with_progress(
    args: list[str],
    duration: float,
    progress: Optional[Callable[[float], None]],
    cancel: Optional[threading.Event],
) -> None:
    """Streams ``-progress`` and honours cancel; the caller clears the partial file."""
    tail = ["-progress", "pipe:1", "-nostats", "-loglevel", "error"]
    streamed = args[:-1] + tail + args[-1:]
    no_win = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    with tempfile.TemporaryFile(mode="w+", encoding="utf-8", errors="replace") as err:
        proc = subprocess.Popen(
            streamed,
            stdout=subprocess.PIPE,
            stderr=err,
            text=True,
            creationflags=no_win,
        )
        try:
            assert proc.stdout is not None
            for line in proc.stdout:
                if cancel is not None and cancel.is_set():
                    raise MediaCancelled("Stopped.")
                if progress is not None and duration:
                    fraction = _progress_fraction(line, duration)
                    if fraction is not None:
                        progress(fraction)
            code = proc.wait()
            if code != 0:
                err.seek(0)
                lines = err.read().strip().splitlines()
                raise RuntimeError(
                    lines[-1] if lines else f"FFmpeg failed ({code})."
                )
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()


def _run_ffmpeg(
    args: list[str],
    duration: float = 0.0,
    progress: Optional[Callable[[float], None]] = None,
    cancel: Optional[threading.Event] = None,
    threads: int = 0,
) -> None:
    """Runs FFmpeg, reporting progress and honouring cancel when asked.

    Without a progress callback or cancel event this stays the plain blocking
    call, so the tool path keeps its old behavior.
    """
    if threads > 0:
        args = args[:-1] + ["-threads", str(threads)] + args[-1:]
    if progress is None and cancel is None:
        _ffmpeg_run(args)
        return
    _run_with_progress(args, duration, progress, cancel)


def quality_settings(quality: int) -> Dict[str, Any]:
    """Maps the sheet's 1-100 quality onto each encoder's own knob.

    Video passes the value straight to the encoder's quality scale (see
    ``_video_encode_args``); audio spends it on bitrate, which is the knob
    every audio codec here understands.
    """
    q = max(1, min(100, int(quality)))
    return {
        "quality": q,
        "audio_kbps": max(32, min(320, round(64 + (q - 30) * 256 / 70))),
    }


def quality_label(quality: int) -> str:
    """Plain-word name for a quality value, shown next to the settings."""
    q = max(1, min(100, int(quality)))
    if q >= 100:
        return "Maximum"
    if q >= 90:
        return "Very high"
    if q >= 75:
        return "High"
    if q >= 55:
        return "Medium"
    if q >= 35:
        return "Reduced"
    return "Low"


_SAVE_FORMATS = {"jpg": "JPEG", "jpeg": "JPEG", "heic": "HEIF"}
# Image formats a quality value actually changes; the rest are lossless.
_LOSSY_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".webp", ".heic", ".avif"}


def _save_format(ext: str) -> str:
    """Pillow format name for a file extension such as ``.jpg``."""
    bare = ext.lower().lstrip(".")
    return _SAVE_FORMATS.get(bare, bare.upper())


def _image_save_options(ext: str, quality: int) -> Dict[str, Any]:
    """Pillow options for one extension; only lossy formats take a quality."""
    options: Dict[str, Any] = {"optimize": True}
    if ext in (".jpg", ".jpeg", ".webp", ".heic", ".avif"):
        options["quality"] = max(1, min(100, int(quality)))
    return options


def _video_encode_args(
    ext: str, duration: float, settings: Dict[str, Any],
    target_mb: Optional[float],
) -> list[str]:
    """Encoder arguments for a video, from a size cap or the slider.

    Quality is the encoder's own quality scale. OpenH264 is not used: in the
    shipped FFmpeg it ignores every knob (quality mode gave the same 100 kbps
    at every value, bitrate mode flattened out too), so the slider moved no
    numbers. Windows' MediaFoundation H.264 encoder is part of the OS and
    follows the quality scale smoothly.

    shortcut: h264_mf needs the Media Foundation encoder, which Windows N
    editions ship without; fall back to OpenH264 if that is ever reported.
    """
    seconds = max(duration, 1.0)
    if ext == ".webm":
        args = ["-c:v", "libvpx-vp9", "-c:a", "libopus"]
        if target_mb:
            kbps = max(int((target_mb * 8192) / seconds) - 128, 150)
            return args + ["-b:v", f"{kbps}k", "-b:a", "128k"]
        # VP9's CRF is its quality scale: 16 is the best, 50 is small.
        crf = round(50 - (settings["quality"] - 1) * 34 / 99)
        return args + ["-crf", str(crf), "-b:v", "0", "-b:a", f"{settings['audio_kbps']}k"]

    args = ["-c:v", "h264_mf", "-c:a", "aac"]
    if target_mb:
        # MediaFoundation needs the cap spelled out: -b:v alone is treated as a
        # hint and lands wherever the content wants, maxrate is what binds.
        kbps = max(int((target_mb * 8192) / seconds) - 128, 150)
        return args + [
            "-rate_control", "pc_vbr",
            "-b:v", f"{kbps}k",
            "-maxrate", f"{kbps}k",
            "-bufsize", f"{kbps * 2}k",
            "-b:a", "128k",
        ]
    return args + [
        "-rate_control", "quality",
        "-quality", str(settings["quality"]),
        "-b:a", f"{settings['audio_kbps']}k",
    ]


def _target_audio_kbps(duration: float, target_mb: float) -> int:
    """Audio bitrate that fits a size cap; the job and the preview share it."""
    return max(64, min(int((target_mb * 8192) / max(duration, 1)), 320))


def _audio_encode_args(ext: str, settings: Dict[str, Any]) -> tuple[list[str], str]:
    """Codec, bitrate, and output extension for an audio target."""
    # Lossless containers become MP3; lossy ones keep their extension.
    out_ext = ext if ext in (".mp3", ".m4a", ".aac", ".ogg", ".opus") else ".mp3"
    codec = {
        ".mp3": "libmp3lame",
        ".m4a": "aac",
        ".aac": "aac",
        ".ogg": "libvorbis",
        ".opus": "libopus",
    }[out_ext]
    return ["-vn", "-c:a", codec, "-b:a", f"{settings['audio_kbps']}k"], out_ext



def convert_image_format(file_path: str, target_format: str) -> str:
    """
    Converts an image to target format (png, jpg, webp, heic, tiff, avif, bmp, pdf).
    Saves to the configured export directory or alongside the source.
    """
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"Source file not found: {file_path}")

    fmt = target_format.lower().strip(".")
    out_path = exported_path(p, f"{p.stem}.{fmt}")

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

        save_fmt = {
            "jpg": "JPEG",
            "jpeg": "JPEG",
            # pillow_heif registers the save handler as "HEIF", not "HEIC".
            "heic": "HEIF",
        }.get(fmt, fmt.upper())
        img.save(out_path, format=save_fmt)

    return str(out_path)


def convert_media(file_path: str, target_format: str) -> str:
    """Converts a video or audio file with FFmpeg.

    Video targets: mp4, webm, gif, mp3, wav, m4a, ogg.
    Audio targets: mp3, wav, m4a, ogg.
    """
    return _convert_media_run(file_path, target_format)


def _convert_media_run(
    file_path: str,
    target_format: str,
    progress: Optional[Callable[[float], None]] = None,
    cancel: Optional[threading.Event] = None,
    threads: int = 0,
) -> str:
    """Conversion body shared by the tool path and the background job queue."""
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"Source file not found: {file_path}")

    source = p.suffix.lower()
    fmt = target_format.lower().strip(".")
    is_video = source in VIDEO_EXTENSIONS
    if is_video:
        allowed = {"mp4", "webm", "gif", "mp3", "wav", "m4a", "ogg"}
    elif source in AUDIO_EXTENSIONS:
        allowed = {"mp3", "wav", "m4a", "ogg"}
    else:
        raise ValueError(f"Not a video or audio file: {p.name}")
    if fmt not in allowed:
        raise ValueError(f"Cannot convert {source or p.name} to .{fmt}.")
    if fmt == source.lstrip("."):
        raise ValueError(f"{p.name} is already .{fmt}.")

    ffmpeg = _resolve_media_binary("ffmpeg")
    out_path = exported_path(p, f"{p.stem}.{fmt}")
    args = [ffmpeg, "-y", "-i", str(p)]
    if fmt == "gif":
        args += ["-vf", "fps=12,scale=720:-1:flags=lanczos", "-loop", "0"]
    elif is_video and fmt == "mp4":
        # Same encoder as compression: OpenH264's default crushed conversions
        # to a fraction of the source, so this keeps the quality high.
        args += [
            "-c:v", "h264_mf", "-rate_control", "quality", "-quality", "90",
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        ]
    elif is_video and fmt == "webm":
        args += ["-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-c:a", "libopus"]
    elif fmt == "mp3":
        args += ["-vn", "-c:a", "libmp3lame", "-b:a", "192k"]
    elif fmt == "wav":
        args += ["-vn", "-c:a", "pcm_s16le"]
    elif fmt == "m4a":
        args += ["-vn", "-c:a", "aac", "-b:a", "192k"]
    else:  # ogg
        args += ["-vn", "-c:a", "libvorbis", "-b:a", "192k"]

    duration = _media_duration(p) if (progress or cancel) else 0.0
    try:
        _run_ffmpeg(args + [str(out_path)], duration, progress, cancel, threads)
    except MediaCancelled:
        out_path.unlink(missing_ok=True)
        raise
    return str(out_path)


def strip_image_metadata(file_path: str) -> str:
    """Removes all EXIF, GPS, and camera metadata from an image."""
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"Source file not found: {file_path}")

    out_path = exported_path(p, f"{p.stem}_clean{p.suffix}")
    with Image.open(p) as img:
        data = list(img.getdata())
        clean_img = Image.new(img.mode, img.size)
        clean_img.putdata(data)
        clean_img.save(out_path)

    return str(out_path)


def black_and_white(file_path: str) -> str:
    """Converts an image to black and white (grayscale).

    Transparency and animated frames survive the conversion so the output
    keeps the source's alpha channel and any motion.
    """
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"Source file not found: {file_path}")

    fmt = p.suffix.lower().lstrip(".")
    # JPEG and BMP have no alpha channel, so those stay single-channel grey.
    keep_alpha = fmt not in ("jpg", "jpeg", "bmp")
    out_path = exported_path(p, f"{p.stem}_bw{p.suffix}")
    save_fmt = {"jpg": "JPEG", "jpeg": "JPEG", "heic": "HEIF"}.get(fmt, fmt.upper())

    def to_gray(frame: Image.Image) -> Image.Image:
        rgba = frame.convert("RGBA")
        gray = ImageOps.grayscale(rgba.convert("RGB"))
        alpha = rgba.getchannel("A")
        if keep_alpha and alpha.getextrema()[0] < 255:
            return Image.merge("RGBA", (gray, gray, gray, alpha))
        return gray

    with Image.open(p) as img:
        if getattr(img, "is_animated", False) and getattr(img, "n_frames", 1) > 1:
            frames = []
            durations = []
            for frame in ImageSequence.Iterator(img):
                frames.append(to_gray(frame))
                durations.append(frame.info.get("duration", 100))
            frames[0].save(
                out_path,
                format=save_fmt,
                save_all=True,
                append_images=frames[1:],
                duration=durations,
                loop=img.info.get("loop", 0),
                disposal=2,
            )
        else:
            to_gray(img).save(out_path, format=save_fmt)

    return str(out_path)


def compress_media(
    file_path: str, target_mb: Optional[float] = None, quality: int = 65
) -> str:
    """
    Compresses an image, video, audio, or PDF to reduce disk size.
    Uses Pillow for images, FFmpeg for video/audio, and pypdf for PDFs.

    ``quality`` (1-100) drives every encoder; ``target_mb`` instead pins a
    video or audio output to that size, which wins when both are given.
    """
    return _compress_media_run(file_path, target_mb, quality)


def _compress_media_run(
    file_path: str,
    target_mb: Optional[float] = None,
    quality: int = 65,
    progress: Optional[Callable[[float], None]] = None,
    cancel: Optional[threading.Event] = None,
    threads: int = 0,
) -> str:
    """Compression body shared by the tool path and the background job queue."""
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"Source file not found: {file_path}")

    ext = p.suffix.lower()
    out_path = exported_path(p, f"{p.stem}_compressed{ext}")
    settings = quality_settings(quality)

    if ext in IMAGE_EXTENSIONS and ext != ".gif":
        with Image.open(p) as img:
            if img.mode in ("RGBA", "P") and ext in (".jpg", ".jpeg", ".bmp"):
                img = img.convert("RGB")
            img.save(out_path, **_image_save_options(ext, settings["quality"]))
        return str(out_path)

    elif ext in VIDEO_EXTENSIONS:
        ffmpeg = _resolve_media_binary("ffmpeg")
        duration = _media_duration(p)
        args = [ffmpeg, "-y", "-i", str(p)] + _video_encode_args(
            ext, duration, settings, target_mb
        )
        try:
            _run_ffmpeg(args + [str(out_path)], duration, progress, cancel, threads)
        except MediaCancelled:
            out_path.unlink(missing_ok=True)
            raise
        return str(out_path)

    elif ext in AUDIO_EXTENSIONS:
        ffmpeg = _resolve_media_binary("ffmpeg")
        duration = _media_duration(p)
        bitrate = settings["audio_kbps"]
        if target_mb:
            bitrate = _target_audio_kbps(duration, target_mb)
        audio_args, out_ext = _audio_encode_args(ext, {**settings, "audio_kbps": bitrate})
        out_path = exported_path(p, f"{p.stem}_compressed{out_ext}")
        try:
            _run_ffmpeg(
                [ffmpeg, "-y", "-i", str(p)] + audio_args + [str(out_path)],
                duration,
                progress,
                cancel,
                threads,
            )
        except MediaCancelled:
            out_path.unlink(missing_ok=True)
            raise
        return str(out_path)

    elif ext == ".pdf":
        from pypdf import PdfReader, PdfWriter

        reader = PdfReader(str(p))
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        for page in writer.pages:
            page.compress_content_streams()
        with open(out_path, "wb") as handle:
            writer.write(handle)
        return str(out_path)

    raise ValueError(f"Unsupported format for compression: {ext or p.name}")


def _ssim(reference: Image.Image, test: Image.Image) -> float:
    """Global SSIM of two same-size images; a whole-frame quality proxy."""
    x = np.asarray(reference.convert("L"), dtype=np.float64)
    y = np.asarray(test.convert("L"), dtype=np.float64)
    if x.shape != y.shape or x.size == 0:
        return 0.0
    c1 = (0.01 * 255) ** 2
    c2 = (0.03 * 255) ** 2
    mean_x, mean_y = x.mean(), y.mean()
    var_x, var_y = x.var(), y.var()
    covariance = ((x - mean_x) * (y - mean_y)).mean()
    denominator = (mean_x**2 + mean_y**2 + c1) * (var_x + var_y + c2)
    if denominator == 0:
        return 1.0
    return float(
        ((2 * mean_x * mean_y + c1) * (2 * covariance + c2)) / denominator
    )


def _encode_image_sample(p: Path, ext: str, settings: Dict[str, Any]) -> tuple[int, float]:
    """Encodes a bounded copy and scales its bytes by the area ratio.

    A downscale keeps the estimate instant and, because JPEG/WebP size tracks
    pixel area closely, accurate enough for a slider preview.
    """
    with Image.open(p) as source:
        img = ImageOps.exif_transpose(source).copy()
    original_pixels = max(img.width * img.height, 1)
    sample = img.copy()
    sample.thumbnail((512, 512), Image.Resampling.LANCZOS)
    if ext in (".jpg", ".jpeg", ".bmp") and sample.mode in ("RGBA", "P", "LA"):
        sample = sample.convert("RGB")
    buffer = io.BytesIO()
    sample.save(buffer, format=_save_format(ext), **_image_save_options(ext, settings["quality"]))
    buffer.seek(0)
    with Image.open(buffer) as redecoded:
        score = _ssim(sample, redecoded)
    scale = original_pixels / max(sample.width * sample.height, 1)
    return int(len(buffer.getvalue()) * scale), score


def _encode_av_sample(
    p: Path, ext: str, duration: float, settings: Dict[str, Any], target_mb: Optional[float]
) -> int:
    """Encodes a slice of the middle and scales the result by duration.

    shortcut: a slice is only an average — a recording that gets busy later
    under-reports and one that calms down over-reports. A third of the file
    (3-8 s) keeps it close and fast enough for a live slider; sample the whole
    file if accuracy matters more than the preview.
    """
    ffmpeg = _resolve_media_binary("ffmpeg")
    seconds = max(0.5, min(8.0, max(3.0, duration / 3), duration))
    start = max(0.0, (duration - seconds) / 2)
    with tempfile.TemporaryDirectory() as folder:
        out = Path(folder) / f"sample{ext}"
        args = [ffmpeg, "-y", "-ss", f"{start:.3f}", "-i", str(p), "-t", f"{seconds:.3f}"]
        if ext in VIDEO_EXTENSIONS:
            args += _video_encode_args(ext, duration, settings, target_mb)
        else:
            audio_settings = settings
            if target_mb:
                audio_settings = {
                    **settings,
                    "audio_kbps": _target_audio_kbps(duration, target_mb),
                }
            audio_args, _ = _audio_encode_args(ext, audio_settings)
            args += audio_args
        _ffmpeg_run(args + [str(out)])
        sample_bytes = out.stat().st_size
    return int(sample_bytes * (duration / seconds))


def estimate_media_size(
    file_path: str, quality: int = 65, target_mb: Optional[float] = None
) -> Dict[str, Any]:
    """Returns an approximate compressed size plus how much quality it costs.

    The number comes from really encoding a sample at the chosen settings, so
    the sheet's preview matches what the job will produce. PDFs only report the
    original size: their saving is stream recompression, which is lossless and
    not something a sample can predict.
    """
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"Source file not found: {file_path}")

    ext = p.suffix.lower()
    settings = quality_settings(quality)
    original = p.stat().st_size
    payload: Dict[str, Any] = {
        "kind": "unknown",
        "original_bytes": original,
        "estimated_bytes": None,
        "quality_label": quality_label(quality),
        "lossless": False,
        "ssim": None,
        "detail": "",
    }

    if ext in IMAGE_EXTENSIONS and ext != ".gif":
        size, score = _encode_image_sample(p, ext, settings)
        lossless = ext not in _LOSSY_IMAGE_EXTENSIONS
        payload.update(
            kind="image",
            estimated_bytes=size,
            lossless=lossless,
            # PNG and BMP have no quality knob, so a score would be meaningless.
            ssim=None if lossless else round(score, 4),
            quality_label="Lossless" if lossless else quality_label(quality),
            detail=(
                f"{_save_format(ext)} lossless re-encode"
                if lossless
                else f"{_save_format(ext)} quality {settings['quality']}"
            ),
        )
    elif ext in VIDEO_EXTENSIONS:
        duration = _media_duration(p)
        if target_mb:
            # A cap can only shrink below what top quality gives, and a short
            # sample's rate control does not settle on a tight cap (measured
            # 2.2x high), so measure the ceiling and aim at the cap.
            ceiling = _encode_av_sample(p, ext, duration, quality_settings(100), None)
            size = min(int(target_mb * 1024 * 1024), ceiling, original)
        else:
            size = _encode_av_sample(p, ext, duration, settings, None)
        kbps = int((size * 8) / max(duration, 1) / 1000)
        payload.update(
            kind="video",
            estimated_bytes=size,
            detail=f"≈{kbps} kbps, {max(duration, 1):.0f} s",
        )
    elif ext in AUDIO_EXTENSIONS:
        duration = _media_duration(p)
        size = _encode_av_sample(p, ext, duration, settings, target_mb)
        payload.update(
            kind="audio",
            estimated_bytes=size,
            detail=f"{settings['audio_kbps']} kbps audio",
        )
    elif ext == ".pdf":
        payload.update(
            kind="pdf",
            estimated_bytes=original,
            lossless=True,
            quality_label="Lossless",
            detail="Lossless stream recompression",
        )
    else:
        raise ValueError(f"Unsupported format for compression: {ext or p.name}")

    if payload["estimated_bytes"] is not None:
        payload["ratio"] = payload["estimated_bytes"] / max(original, 1)
    return payload



def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    """Parses #RGB or #RRGGBB into an RGB tuple."""
    value = value.strip().lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def _build_background(width: int, height: int, spec: str) -> Image.Image:
    """Builds a solid or 135° linear-gradient background.

    Every hex colour in a ``linear-gradient`` becomes an evenly spaced stop, so
    the custom 2- and 3-colour gradients match their CSS preview.
    """
    colors = re.findall(r"#[0-9a-fA-F]{3,8}", spec or "")
    if spec and spec.startswith("linear-gradient") and len(colors) >= 2:
        stops = np.linspace(0.0, 1.0, len(colors), dtype=np.float32)
        rgb = np.array([_hex_to_rgb(color) for color in colors], dtype=np.float32)
        yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
        t = np.clip(
            (xx / max(width - 1, 1) + yy / max(height - 1, 1)) / 2.0,
            0.0,
            1.0,
        )
        arr = np.empty((height, width, 3), dtype=np.float32)
        for channel in range(3):
            arr[:, :, channel] = np.interp(t, stops, rgb[:, channel])
        return Image.fromarray(arr.astype(np.uint8), mode="RGB")
    solid = _hex_to_rgb(colors[0]) if colors else (15, 23, 42)
    return Image.new("RGB", (width, height), solid)


def image_preview(file_path: str, max_size: int = 720) -> Dict[str, Any]:
    """Returns the oriented image size plus a data-URL thumbnail for editors."""
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"Source file not found: {file_path}")

    with Image.open(p) as source:
        oriented = ImageOps.exif_transpose(source).copy()
        width, height = oriented.size
        thumb = oriented.copy()
        thumb.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        if thumb.mode not in ("RGB", "RGBA"):
            has_alpha = "A" in thumb.getbands() or (
                thumb.mode == "P" and "transparency" in thumb.info
            )
            thumb = thumb.convert("RGBA" if has_alpha else "RGB")

        buffer = io.BytesIO()
        if thumb.mode == "RGBA":
            thumb.save(buffer, format="PNG", optimize=True)
            mime = "image/png"
        else:
            thumb.save(buffer, format="JPEG", quality=85, optimize=True)
            mime = "image/jpeg"
        encoded = base64.b64encode(buffer.getvalue()).decode("ascii")

    return {
        "width": width,
        "height": height,
        "preview_width": thumb.width,
        "preview_height": thumb.height,
        "data_url": f"data:{mime};base64,{encoded}",
    }


def crop_image(
    file_path: str,
    width: int,
    height: int,
    x: Optional[int] = None,
    y: Optional[int] = None,
) -> str:
    """Crops an image to a rectangle, centered when x/y are omitted."""
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"Source file not found: {file_path}")
    with Image.open(p) as source:
        img = ImageOps.exif_transpose(source).copy()
        w = max(1, min(int(width), img.width))
        h = max(1, min(int(height), img.height))
        if x is None:
            left = (img.width - w) // 2
        else:
            left = max(0, min(int(x), img.width - w))
        if y is None:
            top = (img.height - h) // 2
        else:
            top = max(0, min(int(y), img.height - h))
        cropped = img.crop((left, top, left + w, top + h))
        out_path = exported_path(p, f"{p.stem} Cropped{p.suffix}")
        if p.suffix.lower() in (".jpg", ".jpeg") and cropped.mode in ("RGBA", "P", "LA"):
            background = Image.new("RGB", cropped.size, (255, 255, 255))
            cropped = cropped.convert("RGBA")
            background.paste(cropped, mask=cropped.getchannel("A"))
            cropped = background
        cropped.save(out_path)
    return str(out_path)


def add_background(
    file_path: str,
    background: str,
    padding: int = 32,
    corners: int = 16,
    shadow: int = 24,
) -> str:
    """Places an image on a gradient/solid canvas with rounded corners + shadow."""
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"Source file not found: {file_path}")

    pad = max(0, int(padding))
    radius = max(0, int(corners))
    shadow = max(0, int(shadow))

    with Image.open(p) as source:
        img = ImageOps.exif_transpose(source).convert("RGBA")
        mask = Image.new("L", img.size, 0)
        draw = ImageDraw.Draw(mask)
        draw.rounded_rectangle(
            [(0, 0), (img.width - 1, img.height - 1)],
            radius=min(radius, min(img.width, img.height) // 2),
            fill=255,
        )
        if "A" in img.getbands():
            img.putalpha(Image.composite(img.getchannel("A"), mask, mask))
        else:
            img.putalpha(mask)

    canvas_w = img.width + pad * 2
    canvas_h = img.height + pad * 2
    background_img = _build_background(canvas_w, canvas_h, background).convert("RGBA")

    if shadow > 0:
        silhouette = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        black = Image.new("RGBA", img.size, (0, 0, 0, 150))
        silhouette.paste(black, (pad, pad + max(2, shadow // 3)), img)
        silhouette = silhouette.filter(ImageFilter.GaussianBlur(max(1, shadow / 2)))
        background_img = Image.alpha_composite(background_img, silhouette)

    background_img.paste(img, (pad, pad), img)
    out_path = exported_path(p, f"{p.stem} with Background.png")
    background_img.convert("RGB").save(out_path)
    return str(out_path)

