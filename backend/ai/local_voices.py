"""Voice discovery and tokenization helpers for local ONNX TTS models.

Nothing here knows a model or voice name. A local model advertises its voices
through a sidecar next to the ``.onnx`` file:

* a ``voices*.bin`` / ``voices*.npz`` archive (Kokoro style), where each key is
  a voice id and each value is a style matrix, or
* a ``voices/`` folder of per-voice ``.pt`` / ``.pth`` / ``.npy`` files whose
  file stems are the voice ids.

Models without a sidecar expose no selectable voices; the engine then uses the
model's built-in default voice.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

logger = logging.getLogger("aether.tts.voices")

VOICE_ARCHIVE_PATTERNS = ("voices*.bin", "voices*.npz", "*voices*.bin", "*voices*.npz")
VOICE_DIR_NAME = "voices"
VOICE_FILE_SUFFIXES = (".pt", ".pth", ".npy")


def _as_dir(model_path: Optional[Any]) -> Optional[Path]:
    if not model_path:
        return None
    path = Path(str(model_path))
    return path.parent if path.suffix else path


def find_voice_archive(model_path: Optional[Any]) -> Optional[Path]:
    """Returns the first voice archive beside the model, if one exists."""
    directory = _as_dir(model_path)
    if directory is None or not directory.is_dir():
        return None
    for pattern in VOICE_ARCHIVE_PATTERNS:
        matches = sorted(p for p in directory.glob(pattern) if p.is_file())
        if matches:
            return matches[0]
    return None


def _archive_voice_ids(path: Path) -> List[str]:
    """Reads voice ids from an npz-style archive without loading the arrays."""
    import numpy as np

    try:
        with np.load(path, allow_pickle=False) as data:
            return [str(name) for name in data.files]
    except Exception as exc:
        logger.debug("Could not read voice archive %s: %s", path, exc)
        return []


def _folder_voice_ids(directory: Path) -> List[str]:
    if not directory.is_dir():
        return []
    return sorted(
        path.stem
        for path in directory.iterdir()
        if path.is_file() and path.suffix.lower() in VOICE_FILE_SUFFIXES
    )


def discover_voice_ids(model_path: Optional[Any]) -> List[str]:
    """Returns the voice ids bundled with a local model, in discovery order."""
    archive = find_voice_archive(model_path)
    if archive is not None:
        ids = _archive_voice_ids(archive)
        if ids:
            return _dedupe(ids)

    directory = _as_dir(model_path)
    if directory is not None:
        ids = _folder_voice_ids(directory / VOICE_DIR_NAME)
        if ids:
            return _dedupe(ids)
    return []


def discover_voices(model_path: Optional[Any]) -> List[Dict[str, str]]:
    """Returns ``{"id", "label"}`` entries for the local model's voices."""
    return [
        {"id": voice_id, "label": voice_id}
        for voice_id in discover_voice_ids(model_path)
    ]


def _dedupe(values: Iterable[str]) -> List[str]:
    seen = set()
    ordered: List[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            ordered.append(value)
    return ordered


def detect_family(input_names: Sequence[str]) -> str:
    """Returns ``"kokoro"`` for style-driven models, else ``"paradee"``.

    Kokoro-family ONNX graphs take ``input_ids`` + a ``style`` vector; the older
    single-voice graphs only take tokens and speed. Detection is by graph shape
    so no model file name is hardcoded.
    """
    return "kokoro" if "style" in set(input_names) else "paradee"


def tokenize_with_vocab(
    text: str,
    vocab: Dict[str, int],
    keys: Optional[Sequence[str]] = None,
) -> List[int]:
    """Greedily maps phoneme text to vocab ids using the longest matches."""
    if not vocab or not text:
        return []
    ordered = list(keys) if keys is not None else sorted(
        (key for key in vocab if key), key=len, reverse=True
    )
    tokens: List[int] = []
    index = 0
    while index < len(text):
        for key in ordered:
            if key and text.startswith(key, index):
                tokens.append(vocab[key])
                index += len(key)
                break
        else:
            # Unknown symbol: skip it rather than emitting garbage.
            index += 1
    return tokens