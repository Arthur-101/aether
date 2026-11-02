"""Optional component packs: manifest, install state, download and removal.

The base application ships with no inference engine and no speech packs. This
module owns the manifest that describes them and the on-disk layout they install
into, so a Settings tab (and, later, first-run onboarding) can offer a download
without the backend knowing what any individual pack contains.

Layout::

    %LOCALAPPDATA%/Aether/components/<id>/<version>/     installed payload
    %LOCALAPPDATA%/Aether/components/<id>/<version>.part in-flight download
    %LOCALAPPDATA%/Aether/components/<id>/<version>.tmp  staging for unzip

Stdlib only. Downloads resume with ``Range``, are verified by SHA-256 and are
unpacked with zip-slip protection; nothing is written outside
``get_components_dir()``.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from .config_manager import get_components_dir

logger = logging.getLogger("aether.components")

# Must track `frontend/src-tauri/tauri.conf.json` `version` and the FastAPI
# version in `main.py`.
APP_VERSION = "0.1.0"

MANIFEST_ENV = "AETHER_COMPONENTS_MANIFEST"
MANIFEST_FILENAME = "components_manifest.json"
CHUNK_SIZE = 64 * 1024
DOWNLOAD_TIMEOUT = 30
_SPACE_MARGIN = 1.15

# A pack id becomes a directory name, so it must never escape the components
# root. Same shape as a PyPI/crate name.
_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")

ProgressCallback = Callable[[Dict[str, Any]], None]


class ComponentError(Exception):
    """A pack could not be installed, verified, or removed."""


class ComponentCancelled(ComponentError):
    """The user cancelled an in-flight download."""


# ── manifest ──────────────────────────────────────────────────────────────


def _as_int(value: Any) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _manifest_candidates() -> List[Path]:
    """Resolution order: explicit override, bundled (frozen), repo root."""
    override = os.getenv(MANIFEST_ENV, "").strip()
    if override:
        return [Path(override)]
    candidates: List[Path] = []
    if hasattr(sys, "_MEIPASS"):
        candidates.append(Path(sys._MEIPASS) / MANIFEST_FILENAME)
    candidates.append(Path(__file__).resolve().parent.parent / MANIFEST_FILENAME)
    return candidates


def manifest_path() -> Optional[Path]:
    for candidate in _manifest_candidates():
        if candidate.is_file():
            return candidate
    return None


def _normalize_entry(item: Any, base_url: str) -> Optional[Dict[str, Any]]:
    if not isinstance(item, dict):
        return None
    component_id = str(item.get("id") or "").strip()
    if not _ID_RE.match(component_id):
        return None
    url = str(item.get("url") or "").strip()
    if url and not url.lower().startswith(("http://", "https://")):
        url = f"{base_url.rstrip('/')}/{url.lstrip('/')}" if base_url else ""
    return {
        "id": component_id,
        "name": str(item.get("name") or component_id).strip(),
        "kind": str(item.get("kind") or "component").strip(),
        "backend": str(item.get("backend") or "").strip(),
        "version": str(item.get("version") or "").strip(),
        "url": url,
        "sha256": str(item.get("sha256") or "").strip().lower(),
        "size": _as_int(item.get("size")),
        "installed_size": _as_int(item.get("installed_size")),
        "min_app_version": str(item.get("min_app_version") or "").strip(),
        "recommended": bool(item.get("recommended")),
        "description": str(item.get("description") or "").strip(),
    }


def load_manifest() -> Dict[str, Any]:
    """Reads and validates the component manifest.

    A missing or unreadable file is not an error: the base application simply
    has nothing to offer, which is a valid state.
    """
    path = manifest_path()
    if path is None:
        return {"schema": 1, "base_url": "", "components": []}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        logger.warning("Component manifest unreadable (%s): %s", path, exc)
        return {"schema": 1, "base_url": "", "components": []}
    if not isinstance(raw, dict):
        return {"schema": 1, "base_url": "", "components": []}
    base_url = str(raw.get("base_url") or "")
    entries: List[Dict[str, Any]] = []
    seen = set()
    for item in raw.get("components") or []:
        entry = _normalize_entry(item, base_url)
        if entry and entry["id"] not in seen:
            seen.add(entry["id"])
            entries.append(entry)
    return {"schema": _as_int(raw.get("schema")) or 1, "base_url": base_url, "components": entries}


# ── versioning ────────────────────────────────────────────────────────────


def _version_key(value: Any) -> tuple:
    return tuple(int(part) for part in re.findall(r"\d+", str(value))) or (0,)


def _is_newer(candidate: str, current: str) -> bool:
    return _version_key(candidate) > _version_key(current)


def _meets_min_version(required: str) -> bool:
    return not required or _version_key(APP_VERSION) >= _version_key(required)


def is_downloadable(entry: Dict[str, Any]) -> bool:
    """A pack is offered only when it has a URL and a SHA-256 to check it."""
    return bool(entry.get("url")) and len(str(entry.get("sha256") or "")) == 64


# ── installed state ───────────────────────────────────────────────────────


def _component_root(component_id: str) -> Path:
    if not _ID_RE.match(component_id or ""):
        raise ComponentError(f"Invalid component id: {component_id!r}")
    return get_components_dir() / component_id


def installed_versions(component_id: str) -> List[str]:
    root = _component_root(component_id)
    if not root.is_dir():
        return []
    names = [
        entry.name
        for entry in root.iterdir()
        if entry.is_dir() and not entry.name.endswith(".tmp")
    ]
    names.sort(key=_version_key)
    return names


def installed_version(component_id: str) -> str:
    versions = installed_versions(component_id)
    return versions[-1] if versions else ""


def describe(entry: Dict[str, Any]) -> Dict[str, Any]:
    """Adds install state to a manifest entry for the UI."""
    installed = installed_version(entry["id"])
    downloadable = is_downloadable(entry)
    compatible = _meets_min_version(entry["min_app_version"])
    if not downloadable:
        state = "unavailable"
    elif not compatible:
        state = "requires_newer_app"
    elif not installed:
        state = "not_installed"
    elif _is_newer(entry["version"], installed):
        state = "update_available"
    else:
        state = "installed"
    return {
        **entry,
        "installed_version": installed,
        "state": state,
        "downloadable": downloadable,
        "compatible": compatible,
    }


def list_components() -> List[Dict[str, Any]]:
    """Every known pack, plus any installed directory the manifest omits."""
    described = [describe(entry) for entry in load_manifest()["components"]]
    known = {item["id"] for item in described}
    for directory in sorted(get_components_dir().iterdir()):
        if not directory.is_dir() or directory.name in known:
            continue
        version = installed_version(directory.name)
        if not version:
            continue
        described.append(
            {
                "id": directory.name,
                "name": directory.name,
                "kind": "component",
                "backend": "",
                "version": version,
                "url": "",
                "sha256": "",
                "size": 0,
                "installed_size": 0,
                "min_app_version": "",
                "recommended": False,
                "description": "",
                "installed_version": version,
                "state": "installed",
                "downloadable": False,
                "compatible": True,
            }
        )
    return described


# ── download / verify / extract ───────────────────────────────────────────


def _progress(
    component_id: str,
    phase: str,
    received: int,
    total: int,
    message: str = "",
) -> Dict[str, Any]:
    percent = int(round(received / total * 100)) if total else 0
    return {
        "id": component_id,
        "phase": phase,
        "received": received,
        "total": total,
        "percent": max(0, min(100, percent)),
        "message": message,
    }


def _download(
    entry: Dict[str, Any],
    part: Path,
    progress: ProgressCallback,
    cancel,
) -> None:
    """Streams the archive into ``part``, resuming when a partial file exists."""
    existing = part.stat().st_size if part.is_file() else 0
    total = _as_int(entry.get("size"))
    request = urllib.request.Request(entry["url"], headers={"User-Agent": f"Aether/{APP_VERSION}"})
    if existing:
        request.add_header("Range", f"bytes={existing}-")
    try:
        response = urllib.request.urlopen(request, timeout=DOWNLOAD_TIMEOUT)
    except urllib.error.URLError as exc:
        raise ComponentError(f"Download failed: {exc}") from exc

    with response:
        status = getattr(response, "status", 200)
        resumed = existing > 0 and status == 206
        if not resumed:
            existing = 0
        length = _as_int(response.headers.get("Content-Length"))
        if length:
            total = existing + length
        part.parent.mkdir(parents=True, exist_ok=True)
        received = existing
        with open(part, "ab" if resumed else "wb") as handle:
            while True:
                if cancel.is_set():
                    raise ComponentCancelled("Download cancelled.")
                chunk = response.read(CHUNK_SIZE)
                if not chunk:
                    break
                handle.write(chunk)
                received += len(chunk)
                progress(_progress(entry["id"], "downloading", received, total))


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _ensure_space(target: Path, needed: int) -> None:
    if needed <= 0:
        return
    target.mkdir(parents=True, exist_ok=True)
    free = shutil.disk_usage(str(target)).free
    if free < needed * _SPACE_MARGIN:
        raise ComponentError(
            f"Not enough disk space: about {needed * _SPACE_MARGIN / 1e6:.0f} MB "
            f"needed, {free / 1e6:.0f} MB free."
        )


def _safe_extract(archive: Path, destination: Path) -> None:
    """Extracts a zip, refusing any member that escapes ``destination``."""
    destination = destination.resolve()
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            resolved = (destination / member.filename).resolve()
            if resolved != destination and destination not in resolved.parents:
                raise ComponentError(f"Unsafe path in archive: {member.filename}")
        bundle.extractall(destination)


# ── install / remove ──────────────────────────────────────────────────────


def install_component(
    component_id: str,
    progress: ProgressCallback,
    cancel,
) -> Dict[str, Any]:
    """Downloads, verifies and installs one pack. Returns its new state."""
    entry = next(
        (item for item in load_manifest()["components"] if item["id"] == component_id),
        None,
    )
    if entry is None:
        raise ComponentError(f"Unknown component: {component_id}")
    if not is_downloadable(entry):
        raise ComponentError("This component has not been published yet.")
    if not _meets_min_version(entry["min_app_version"]):
        raise ComponentError(f"Needs Aether {entry['min_app_version']} or newer.")

    root = _component_root(component_id)
    root.mkdir(parents=True, exist_ok=True)
    part = root / f"{entry['version']}.part"
    staging = root / f"{entry['version']}.tmp"
    target = root / entry["version"]

    # Peak usage is the archive plus the unpacked payload, so check both.
    archive_size = _as_int(entry.get("size"))
    unpacked_size = _as_int(entry.get("installed_size"))
    _ensure_space(root, archive_size + unpacked_size or archive_size)

    start = part.stat().st_size if part.is_file() else 0
    progress(_progress(component_id, "downloading", start, archive_size or start))
    _download(entry, part, progress, cancel)

    if cancel.is_set():
        raise ComponentCancelled("Download cancelled.")

    size = part.stat().st_size
    progress(_progress(component_id, "verifying", size, size))
    if _sha256(part) != entry["sha256"]:
        part.unlink(missing_ok=True)
        raise ComponentError("Downloaded file failed its SHA-256 check.")

    progress(_progress(component_id, "extracting", 1, 1))
    if staging.exists():
        shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True, exist_ok=True)
    try:
        _safe_extract(part, staging)
    except ComponentError:
        shutil.rmtree(staging, ignore_errors=True)
        part.unlink(missing_ok=True)
        raise

    part.unlink(missing_ok=True)
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)
    staging.replace(target)

    progress(_progress(component_id, "installed", 1, 1))
    logger.info("Installed component %s %s", component_id, entry["version"])
    return describe(entry)


def remove_component(component_id: str) -> Dict[str, Any]:
    """Deletes every installed version of a pack."""
    root = _component_root(component_id)
    if root.is_dir():
        shutil.rmtree(root, ignore_errors=True)
        logger.info("Removed component %s", component_id)
    return {"id": component_id, "state": "removed"}
