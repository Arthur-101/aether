"""
Aether Notes Store
Owns the on-disk Markdown vault: YAML frontmatter, atomic saves, and assets.

Every note is a real `.md` file inside the configured vault folder, so notes
survive outside Aether and can be edited with any text editor. The frontmatter
`id` is the stable key used by the UI; files created externally get a
deterministic `ext-…` id until they are saved through Aether.
"""

import base64
import hashlib
import os
import re
import secrets
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml

from ..config_manager import config_manager, get_app_dir

DEFAULT_THEME = "default"
MAX_IMAGE_BYTES = 12 * 1024 * 1024
ALLOWED_IMAGE_MIME = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
_RESERVED_STEMS = {
    "con", "prn", "aux", "nul",
    *(f"com{i}" for i in range(1, 10)),
    *(f"lpt{i}" for i in range(1, 10)),
}
_ILLEGAL_FILENAME = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_write_lock = threading.Lock()


def get_notes_dir() -> Path:
    """Returns the configured vault folder, defaulting to %APPDATA%/Aether/notes."""
    configured = str(config_manager.get("storage", "notes_directory", "") or "").strip()
    if configured:
        root = Path(os.path.expandvars(os.path.expanduser(configured)))
    else:
        root = get_app_dir() / "notes"
    try:
        root.mkdir(parents=True, exist_ok=True)
    except OSError:
        root = get_app_dir() / "notes"
        root.mkdir(parents=True, exist_ok=True)
    return root


def get_assets_dir() -> Path:
    assets = get_notes_dir() / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    return assets


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _mtime_iso(path: Path) -> str:
    try:
        return datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds")
    except OSError:
        return _now()


def _external_id(path: Path) -> str:
    digest = hashlib.sha1(path.name.lower().encode("utf-8")).hexdigest()[:12]
    return f"ext-{digest}"


def _split_frontmatter(text: str) -> Tuple[Dict[str, Any], str]:
    """Splits `---` YAML frontmatter from the Markdown body."""
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        return {}, text
    end = None
    for index in range(1, len(lines)):
        if lines[index].strip() in ("---", "..."):
            end = index
            break
    if end is None:
        return {}, text
    try:
        parsed = yaml.safe_load("".join(lines[1:end])) or {}
    except yaml.YAMLError:
        parsed = {}
    if not isinstance(parsed, dict):
        parsed = {}
    return parsed, "".join(lines[end + 1:]).lstrip("\n")


def _compose(meta: Dict[str, Any], body: str) -> str:
    front = yaml.safe_dump(
        meta,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    ).strip()
    return f"---\n{front}\n---\n\n{body.rstrip()}\n"


def _normalize_meta(raw: Dict[str, Any], path: Path) -> Dict[str, Any]:
    title = str(raw.get("title") or path.stem).strip() or path.stem
    return {
        "id": str(raw.get("id") or _external_id(path)),
        "title": title,
        "theme": str(raw.get("theme") or DEFAULT_THEME),
        "created": str(raw.get("created") or _mtime_iso(path)),
        "updated": str(raw.get("updated") or _mtime_iso(path)),
        "pinned": bool(raw.get("pinned", False)),
    }


def _read_markdown(path: Path) -> Tuple[Dict[str, Any], str]:
    text = path.read_text(encoding="utf-8", errors="replace")
    return _split_frontmatter(text)


def _sanitize_stem(title: str) -> str:
    clean = _ILLEGAL_FILENAME.sub("", str(title or ""))
    clean = re.sub(r"\s+", " ", clean).strip(" .")
    if not clean:
        clean = "Untitled note"
    if clean.split(".")[0].lower() in _RESERVED_STEMS:
        clean = f"note-{clean}"
    return clean[:80].rstrip(" .") or "Untitled note"


def _target_path(root: Path, title: str, current: Optional[Path]) -> Path:
    stem = _sanitize_stem(title)
    candidate = root / f"{stem}.md"
    if current is not None and current.name.lower() == candidate.name.lower():
        return candidate
    counter = 2
    while candidate.exists():
        candidate = root / f"{stem} {counter}.md"
        counter += 1
    return candidate


def _find_path(note_id: str) -> Optional[Path]:
    if not note_id:
        return None
    for path in get_notes_dir().glob("*.md"):
        try:
            meta, _body = _read_markdown(path)
        except OSError:
            continue
        if _normalize_meta(meta, path)["id"] == note_id:
            return path
    return None


def list_notes() -> Dict[str, Any]:
    """Lists note metadata (no bodies), pinned first then most recently updated."""
    root = get_notes_dir()
    notes: List[Dict[str, Any]] = []
    for path in root.glob("*.md"):
        try:
            meta, _body = _read_markdown(path)
        except OSError:
            continue
        notes.append(_normalize_meta(meta, path))
    notes.sort(key=lambda note: (note["pinned"], note["updated"]), reverse=True)
    return {"notes": notes, "directory": str(root)}


def read_note(note_id: str) -> Optional[Dict[str, Any]]:
    path = _find_path(note_id)
    if path is None:
        return None
    meta, body = _read_markdown(path)
    note = _normalize_meta(meta, path)
    note.update({"content": body, "file_name": path.name})
    return note


def save_note(
    note_id: Optional[str],
    title: str,
    content: str,
    theme: Optional[str] = None,
    pinned: Optional[bool] = None,
) -> Dict[str, Any]:
    """Creates or updates a note, renaming the file when the title changes."""
    root = get_notes_dir()
    with _write_lock:
        current = _find_path(note_id) if note_id else None
        created = current is None
        if current is not None:
            existing, _body = _read_markdown(current)
        else:
            existing = {}

        now = _now()
        meta = {
            "id": str(existing.get("id") or note_id or uuid.uuid4().hex),
            "title": str(title or "").strip() or "Untitled note",
            "theme": str(theme or existing.get("theme") or DEFAULT_THEME),
            "created": str(existing.get("created") or now),
            "updated": now,
            "pinned": bool(pinned if pinned is not None else existing.get("pinned", False)),
        }
        target = _target_path(root, meta["title"], current)
        payload = _compose(meta, content or "")
        temp = target.with_suffix(".md.tmp")
        temp.write_text(payload, encoding="utf-8")
        os.replace(temp, target)

        if current is not None and os.path.normcase(str(current.resolve())) != os.path.normcase(str(target.resolve())):
            try:
                current.unlink(missing_ok=True)
            except OSError:
                pass

        note = dict(meta)
        note.update({"content": content or "", "file_name": target.name})
        return {"note": note, "created": created}


def delete_note(note_id: str) -> bool:
    with _write_lock:
        path = _find_path(note_id)
        if path is None:
            return False
        try:
            path.unlink()
            return True
        except OSError:
            return False


def note_file(note_id: str) -> Optional[Path]:
    """Returns the Markdown file for a note (used by chat attachment)."""
    return _find_path(note_id)


def save_image(file_name: str, data_url: str) -> str:
    """Persists a data-URL image in `assets/` and returns its vault-relative path."""
    match = re.match(r"^data:([\w/+.-]+);base64,(.+)$", data_url or "", re.DOTALL)
    if not match:
        raise ValueError("Invalid image payload.")
    mime, encoded = match.group(1).lower(), match.group(2)
    extension = ALLOWED_IMAGE_MIME.get(mime)
    if extension is None:
        raise ValueError("Unsupported image type.")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise ValueError("Invalid image data.") from exc
    if not raw:
        raise ValueError("Image is empty.")
    if len(raw) > MAX_IMAGE_BYTES:
        raise ValueError("Image is too large (max 12 MB).")

    tag = re.sub(r"[^a-zA-Z0-9._-]", "", Path(file_name or "image").stem)[:32] or "image"
    name = f"{datetime.now():%Y%m%d-%H%M%S}-{tag}-{secrets.token_hex(3)}{extension}"
    target = get_assets_dir() / name
    temp = target.with_suffix(f"{extension}.part")
    temp.write_bytes(raw)
    os.replace(temp, target)
    return f"assets/{name}"


def asset_path(name: str) -> Path:
    """Resolves an asset filename safely inside the vault's assets folder."""
    if not name or Path(name).name != name:
        raise FileNotFoundError(name)
    if Path(name).suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        raise FileNotFoundError(name)
    path = get_assets_dir() / name
    if not path.is_file():
        raise FileNotFoundError(name)
    return path
