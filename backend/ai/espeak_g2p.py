"""
espeak-ng grapheme-to-phoneme bridge for Kokoro-family TTS.

espeak-ng is GPL-3.0, so it never loads inside this process: the engine ships as
an optional voice component and is driven through its command-line tool. This
module owns only the subprocess contract — locating the tool, splitting text
into clauses, and putting the punctuation back — and stays Apache-2.0 with the
rest of the backend.

Clause splitting matters for two reasons. ``espeak-ng --ipa`` exposes no
equivalent of espeak's ``PUNCT_SOME`` mode, so the CLI drops the punctuation
phonemizer used to keep; and espeak only assigns sentence-level stress when it
sees a whole clause. Feeding one clause per line (``-l``) preserves its prosody,
then the original punctuation is re-interleaved for Kokoro's prosody tokens.
"""

import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from ..config_manager import get_components_dir

logger = logging.getLogger("aether.g2p")

VOICE = "en-us"
TIMEOUT_S = 60.0
# A line shorter than this counts as a complete clause. It is larger than any
# reply chunk, so the output stays one line per input clause.
LINE_LENGTH = 1_000_000
EXECUTABLE_NAME = "espeak-ng.exe" if os.name == "nt" else "espeak-ng"
DATA_DIR_NAME = "espeak-ng-data"
DATA_MARKER = "phontab"

# Characters espeak treats as a clause end, plus the ones Kokoro can voice.
CLAUSE_BREAK = frozenset(".,;:!?") | {"\u2014", "\u2013", "\u2026"}
INLINE_PUNCT = frozenset('"()') | {"\u201c", "\u201d", "\u2018", "\u2019"}
CURLY_APOSTROPHE = frozenset("\u2018\u2019")
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# ("text" | "punct", content, preceded_by_space)
Segment = Tuple[str, str, bool]


class G2PUnavailable(RuntimeError):
    """Raised when the optional espeak-ng voice component is not installed."""


_lock = threading.Lock()
_cached_location: Optional[Tuple[Path, Path]] = None
_probed = False


def resolve() -> Tuple[Path, Path]:
    """Returns ``(executable, directory)`` for the installed espeak-ng tool.

    The directory always contains ``espeak-ng-data``; espeak segfaults instead
    of reporting a missing data path, so the check happens before the call.
    """
    global _cached_location, _probed
    with _lock:
        if not _probed:
            _cached_location = _locate()
            _probed = True
        if _cached_location is None:
            raise G2PUnavailable(
                "Local text-to-speech needs the espeak-ng voice component, "
                "which is not installed. Add it from Settings > Components."
            )
        return _cached_location


def reset_cache() -> None:
    """Forgets a previous lookup so the next call re-probes the filesystem."""
    global _cached_location, _probed
    with _lock:
        _cached_location = None
        _probed = False


def available() -> bool:
    """Returns True when the voice component can be found right now."""
    try:
        resolve()
    except G2PUnavailable:
        return False
    return True


def _candidate_directories() -> List[Path]:
    """Collects every place the voice component may live, best first.

    Rule 1: no hardcoded user paths. The order mirrors how the pack system will
    install components, then falls back to a developer checkout and PATH.
    """
    candidates: List[Path] = []

    override = os.getenv("AETHER_ESPEAK_DIR", "").strip()
    if override:
        candidates.append(Path(override))

    component_root = None
    try:
        component_root = get_components_dir() / "espeak-ng"
        if component_root.is_dir():
            # Newest version first; a flat install (no version folder) is the
            # directory itself because the executable's parent is resolved.
            for entry in sorted(component_root.iterdir(), reverse=True):
                candidates.append(entry if entry.is_dir() else entry.parent)
    except OSError as exc:
        logger.debug("Could not scan %s: %s", component_root, exc)

    candidates.append(Path(__file__).resolve().parents[2] / "bin" / "espeak-ng")

    bundle = getattr(sys, "_MEIPASS", None)
    if bundle:
        candidates.append(Path(bundle) / "bin" / "espeak-ng")

    on_path = shutil.which("espeak-ng")
    if on_path:
        candidates.append(Path(on_path).parent)

    return candidates


def _locate() -> Optional[Tuple[Path, Path]]:
    """Returns the first candidate that has both the tool and its data."""
    searched: List[str] = []
    for directory in _candidate_directories():
        searched.append(str(directory))
        executable = directory / EXECUTABLE_NAME
        if not executable.is_file():
            continue
        if not (directory / DATA_DIR_NAME / DATA_MARKER).is_file():
            logger.debug("Skipping %s: no %s", directory, DATA_DIR_NAME)
            continue
        logger.debug("Using espeak-ng from %s", directory)
        return executable, directory
    logger.debug("espeak-ng not found; searched: %s", ", ".join(searched) or "nothing")
    return None


def _tokenize(text: str) -> List[Segment]:
    """Splits text into clause and punctuation segments.

    Each segment records whether whitespace preceded it, so the rebuilt string
    keeps the original spacing around quotes and brackets.
    """
    segments: List[Segment] = []
    buffer: List[str] = []
    gap = False

    def flush() -> None:
        nonlocal gap
        raw = "".join(buffer)
        clause = raw.strip()
        trailing = bool(raw) and raw[-1].isspace()
        if clause:
            segments.append(("text", clause, gap))
            gap = trailing
        buffer.clear()

    index = 0
    length = len(text)
    while index < length:
        char = text[index]
        if char in CLAUSE_BREAK:
            flush()
            segments.append(("punct", char, gap))
            gap = False
        elif char in INLINE_PUNCT:
            # A quote between letters belongs to the word (isn't, don't).
            if (
                char in CURLY_APOSTROPHE
                and 0 < index < length - 1
                and text[index - 1].isalnum()
                and text[index + 1].isalnum()
            ):
                buffer.append(char)
            else:
                flush()
                segments.append(("punct", char, gap))
                gap = False
        elif char.isspace():
            if buffer:
                if buffer[-1] != " ":
                    buffer.append(" ")
            else:
                gap = True
        else:
            buffer.append(char)
        index += 1
    flush()
    return segments


def _run_espeak(
    clauses: Sequence[str], executable: Path, directory: Path
) -> List[str]:
    """Phonemizes one clause per line and returns the matching output lines."""
    handle, path = tempfile.mkstemp(prefix="aether-g2p-", suffix=".txt")
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            stream.write("\n".join(clauses))
        command = [
            str(executable),
            "-q",
            "--ipa",
            "-v",
            VOICE,
            "-l",
            str(LINE_LENGTH),
            "--path",
            str(directory),
            "-f",
            path,
        ]
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=TIMEOUT_S,
            creationflags=flags,
        )
        if completed.returncode != 0:
            detail = completed.stderr.strip() or "no diagnostics"
            raise RuntimeError(f"espeak-ng exited with {completed.returncode}: {detail}")
        output = completed.stdout.rstrip("\n")
        return output.split("\n") if output else []
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def _interleave(segments: Sequence[Segment], phonemes: Sequence[str]) -> str:
    """Rebuilds one phoneme string, restoring punctuation and spacing."""
    pieces: List[str] = []
    index = 0
    pending_space = False
    for kind, content, gap in segments:
        if gap:
            pending_space = True
        if kind == "text":
            piece = phonemes[index]
            index += 1
        else:
            piece = content
        if not piece:
            continue
        if pending_space and pieces and not pieces[-1].endswith(" "):
            pieces.append(" ")
        pending_space = False
        pieces.append(piece)
    return "".join(pieces).strip()


def phonemize(text: str) -> str:
    """Converts English text to IPA phonemes for Kokoro-family models."""
    cleaned = _CONTROL_CHARS.sub(" ", text or "")
    segments = _tokenize(cleaned)
    clauses = [content for kind, content, _ in segments if kind == "text"]
    if not clauses:
        return ""

    executable, directory = resolve()
    lines = _run_espeak(clauses, executable, directory)
    if len(lines) != len(clauses):
        # A clause longer than LINE_LENGTH merges lines; drop punctuation and
        # speak the whole thing rather than failing the reply.
        logger.warning(
            "espeak-ng returned %d lines for %d clauses; flattening",
            len(lines),
            len(clauses),
        )
        lines = _run_espeak([" ".join(clauses)], executable, directory)
        return lines[0].strip() if lines else ""

    return _interleave(segments, lines)
