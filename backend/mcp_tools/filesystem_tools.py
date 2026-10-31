"""File-system tools bounded by the roots the user allows.

Every path is resolved and checked against the roots before anything is read or
written. Moves, renames, and organizes expose a read-only preview that captures
the exact operation plan; approval executes that plan and reports entries that
changed instead of silently re-planning them.
"""

from __future__ import annotations

import fnmatch
import os
import re
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from ..config_manager import config_manager
from ..filesystem_roots import allowed_root_paths, is_within
from .tool_permissions import (
    PreviewResult,
    register_approval_check,
    register_preview_builder,
)

MAX_CREATE_BYTES = 64 * 1024
DEFAULT_SEARCH_DEPTH = 6
MAX_SEARCH_DEPTH = 8
SEARCH_TIMEOUT_SECONDS = 3.0
MAX_SEARCH_RESULTS = 50
MAX_NAME_LENGTH = 255

_SKIP_DIR_NAMES = {
    "$recycle.bin",
    "system volume information",
}

_FILE_ATTRIBUTE_HIDDEN = 0x2
_FILE_ATTRIBUTE_SYSTEM = 0x4
_FILE_ATTRIBUTE_REPARSE_POINT = 0x400

_WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{index}" for index in range(1, 10)),
    *(f"LPT{index}" for index in range(1, 10)),
}
_INVALID_NAME_CHARS = set('<>:"/\\|?*')

AUTO_EXTENSIONS = frozenset({
    ".txt", ".md", ".markdown", ".json", ".yaml", ".yml", ".toml", ".csv",
    ".tsv", ".log", ".xml", ".ini", ".cfg",
})

CODE_EXTENSIONS = frozenset({
    ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".c", ".h", ".cpp", ".hpp",
    ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".sql", ".sh",
    ".html", ".htm", ".css",
})

BLOCKED_EXTENSIONS = frozenset({
    # Executables, installers, and script hosts.
    ".bat", ".cmd", ".ps1", ".vbs", ".wsf", ".hta", ".reg", ".lnk", ".url",
    ".exe", ".dll", ".msi", ".scr", ".com", ".pif", ".jar",
    # Images.
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tif", ".tiff", ".ico",
    ".heic", ".avif", ".svg",
    # Audio.
    ".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma", ".opus", ".aiff",
    # Video.
    ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".mpg",
    ".mpeg",
    # Archives.
    ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".iso", ".cab",
})

_IMAGE_EXTENSIONS = frozenset({
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tif", ".tiff", ".ico",
    ".heic", ".avif", ".svg",
})
_AUDIO_EXTENSIONS = frozenset({
    ".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma", ".opus", ".aiff",
})
_VIDEO_EXTENSIONS = frozenset({
    ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".mpg",
    ".mpeg",
})
_ARCHIVE_EXTENSIONS = frozenset({
    ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".iso", ".cab",
})
_DOCUMENT_EXTENSIONS = frozenset({
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods",
    ".odp", ".rtf", ".txt", ".md", ".markdown", ".csv", ".tsv", ".epub",
})
_CODE_EXTENSIONS = CODE_EXTENSIONS | frozenset({
    ".json", ".xml", ".yaml", ".yml", ".toml", ".ini", ".cfg",
})

CATEGORY_ORDER: Tuple[str, ...] = (
    "Images",
    "Documents",
    "Audio",
    "Video",
    "Archives",
    "Code",
    "Other",
)

_EXTENSION_CATEGORIES: Dict[str, str] = {}
for _category, _extensions in (
    ("Images", _IMAGE_EXTENSIONS),
    ("Documents", _DOCUMENT_EXTENSIONS),
    ("Audio", _AUDIO_EXTENSIONS),
    ("Video", _VIDEO_EXTENSIONS),
    ("Archives", _ARCHIVE_EXTENSIONS),
    ("Code", _CODE_EXTENSIONS),
):
    for _extension in _extensions:
        _EXTENSION_CATEGORIES[_extension] = _category


class FilesystemError(ValueError):
    """A user-facing validation failure that never changes the disk."""


@dataclass
class OrganizePlan:
    folder: Path
    entries: List[Dict[str, str]] = field(default_factory=list)
    categories: Dict[str, List[str]] = field(default_factory=dict)
    hidden: int = 0
    links: int = 0
    collisions: List[str] = field(default_factory=list)


def _as_bool(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _normalized_path(value: Any) -> str:
    text = str(value or "").strip().strip('"').strip("'")
    if not text:
        raise FilesystemError("A path is required.")
    if "\x00" in text:
        raise FilesystemError("Paths cannot contain null bytes.")
    return os.path.expandvars(os.path.expanduser(text))


def _roots() -> List[Path]:
    extra = config_manager.get("filesystem", "allowed_roots", []) or []
    roots = allowed_root_paths(extra)
    if not roots:
        raise FilesystemError(
            "No allowed folders are available. Add one in "
            "Settings -> Tools -> File System."
        )
    return roots


def _ensure_within_roots(path: Path) -> Path:
    if not any(is_within(root, path) for root in _roots()):
        raise FilesystemError(
            f"{path} is outside Aether's allowed folders. "
            "Add it in Settings -> Tools -> File System."
        )
    return path


def _absolute(value: Any) -> Path:
    candidate = Path(_normalized_path(value))
    if not candidate.is_absolute():
        raise FilesystemError("Use an absolute path.")
    return candidate


def _existing_path(value: Any, *, directory: bool) -> Path:
    candidate = _absolute(value)
    try:
        resolved = candidate.resolve(strict=True)
    except FileNotFoundError as exc:
        raise FilesystemError(f"Path not found: {candidate}") from exc
    except OSError as exc:
        raise FilesystemError(f"Cannot resolve path: {candidate}") from exc
    _ensure_within_roots(resolved)
    if directory and not resolved.is_dir():
        raise FilesystemError(f"Not a folder: {resolved}")
    if not directory and not resolved.is_file():
        raise FilesystemError(f"Not a file: {resolved}")
    return resolved


def _existing_dir(value: Any) -> Path:
    return _existing_path(value, directory=True)


def _existing_file(value: Any) -> Path:
    return _existing_path(value, directory=False)


def _planned_path(value: Any) -> Path:
    """Resolves a plan entry path that may have changed since the preview."""
    candidate = _absolute(value)
    try:
        resolved = candidate.resolve(strict=False)
    except OSError as exc:
        raise FilesystemError(f"Cannot resolve path: {candidate}") from exc
    return _ensure_within_roots(resolved)


def _validate_name(name: Any, *, label: str = "name") -> str:
    text = str(name or "").strip()
    if not text:
        raise FilesystemError(f"A {label} is required.")
    if text in {".", ".."}:
        raise FilesystemError(f"Invalid {label}: {text}")
    if any(char in _INVALID_NAME_CHARS or ord(char) < 32 for char in text):
        raise FilesystemError(
            f"The {label} cannot contain any of: < > : \" / \\ | ? *"
        )
    if text[-1] in {".", " "}:
        raise FilesystemError(f"The {label} cannot end with a dot or space.")
    if len(text) > MAX_NAME_LENGTH:
        raise FilesystemError(
            f"The {label} must be {MAX_NAME_LENGTH} characters or fewer."
        )
    stem = text.split(".", 1)[0].upper()
    if stem in _WINDOWS_RESERVED_NAMES:
        raise FilesystemError(
            f"'{stem}' is a reserved Windows name. Choose another {label}."
        )
    return text


def _write_target(value: Any) -> Path:
    candidate = _absolute(value)
    _validate_name(candidate.name)
    try:
        resolved = candidate.resolve(strict=False)
    except OSError as exc:
        raise FilesystemError(f"Cannot resolve path: {candidate}") from exc
    return _ensure_within_roots(resolved)


def _human_size(size: int) -> str:
    value = float(max(0, size))
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            return f"{value:.0f} {unit}" if unit == "B" else f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} GB"


def _attributes(entry: os.DirEntry) -> int:
    try:
        return int(entry.stat(follow_symlinks=False).st_file_attributes)
    except (AttributeError, OSError):
        return 0


def _is_hidden_or_system(entry: os.DirEntry) -> bool:
    attrs = _attributes(entry)
    if attrs:
        return bool(attrs & (_FILE_ATTRIBUTE_HIDDEN | _FILE_ATTRIBUTE_SYSTEM))
    return entry.name.startswith(".")


def _is_link(entry: os.DirEntry) -> bool:
    attrs = _attributes(entry)
    if attrs:
        return bool(attrs & _FILE_ATTRIBUTE_REPARSE_POINT)
    try:
        return entry.is_symlink()
    except OSError:
        return True


def _search_roots(value: Any = None) -> List[Path]:
    roots = _roots()
    text = str(value or "").strip()
    if not text:
        return roots
    lowered = text.lower()
    for root in roots:
        if root.name.lower() == lowered:
            return [root]
    path = _existing_dir(text)
    return [path]


def _extensions(value: Any) -> Optional[set[str]]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    parts = [part.strip().lower() for part in re.split(r"[,;\s]+", text) if part.strip()]
    return {(part if part.startswith(".") else f".{part}") for part in parts}


def _matches(name: str, query: str) -> bool:
    lowered = name.lower()
    if not query:
        return True
    if "*" in query or "?" in query:
        return fnmatch.fnmatch(lowered, query)
    return query in lowered


def find_files(
    query: str,
    root: Optional[str] = None,
    ext: Optional[str] = None,
    depth: int = DEFAULT_SEARCH_DEPTH,
    limit: int = MAX_SEARCH_RESULTS,
) -> str:
    """Searches file names under one root or every allowed root."""
    try:
        max_depth = max(0, min(MAX_SEARCH_DEPTH, int(depth)))
    except (TypeError, ValueError):
        max_depth = DEFAULT_SEARCH_DEPTH
    try:
        max_results = max(1, min(MAX_SEARCH_RESULTS, int(limit)))
    except (TypeError, ValueError):
        max_results = MAX_SEARCH_RESULTS
    wanted = _extensions(ext)
    needle = str(query or "").strip().lower()
    roots = _search_roots(root)
    started = time.monotonic()
    timed_out = False
    candidates: List[Tuple[bool, float, str, int]] = []

    for base in roots:
        stack: List[Tuple[Path, int]] = [(base, 0)]
        full = False
        while stack:
            folder, level = stack.pop()
            try:
                with os.scandir(folder) as entries:
                    for entry in entries:
                        if time.monotonic() - started > SEARCH_TIMEOUT_SECONDS:
                            timed_out = True
                            break
                        if _is_link(entry):
                            continue
                        if entry.is_dir(follow_symlinks=False):
                            if (
                                level < max_depth
                                and entry.name.lower() not in _SKIP_DIR_NAMES
                                and not _is_hidden_or_system(entry)
                            ):
                                stack.append((Path(entry.path), level + 1))
                            continue
                        if not entry.is_file(follow_symlinks=False):
                            continue
                        if _is_hidden_or_system(entry):
                            continue
                        if not _matches(entry.name, needle):
                            continue
                        if wanted is not None and Path(entry.name).suffix.lower() not in wanted:
                            continue
                        try:
                            stat = entry.stat(follow_symlinks=False)
                        except OSError:
                            continue
                        candidates.append((
                            entry.name.lower() == needle,
                            stat.st_mtime,
                            entry.path,
                            stat.st_size,
                        ))
                        if len(candidates) >= max_results * 4:
                            full = True
                            break
                if timed_out or full:
                    break
            except OSError:
                continue
        if timed_out or full:
            break

    unique: Dict[str, Tuple[bool, float, str, int]] = {}
    for candidate in candidates:
        unique.setdefault(os.path.normcase(candidate[2]), candidate)
    ranked = sorted(
        unique.values(),
        key=lambda item: (0 if item[0] else 1, -item[1], item[2].lower()),
    )[:max_results]

    if not ranked:
        where = ", ".join(str(path) for path in roots)
        suffix = " (search timed out after 3 seconds)" if timed_out else ""
        return f"No files matched '{query or '*'}' under {where}{suffix}."

    lines = [
        f"Found {len(ranked)} file(s) under "
        f"{', '.join(str(path) for path in roots)}:"
    ]
    for _exact, mtime, path, size in ranked:
        stamp = time.strftime("%Y-%m-%d", time.localtime(mtime))
        lines.append(f"{path}  ({stamp}, {_human_size(size)})")
    if timed_out:
        lines.append(
            "Search stopped after 3 seconds; results are partial. "
            "Narrow the root or query to see more."
        )
    elif len(ranked) >= max_results:
        lines.append(
            f"Showing the first {max_results} matches. Narrow the search "
            "or raise the root depth for more."
        )
    return "\n".join(lines)


def create_folder(path: str, parents: bool = False) -> str:
    """Creates one empty folder; existing folders are reported, not replaced."""
    target = _write_target(path)
    if target.exists():
        if target.is_dir():
            return f"Folder already exists: {target}"
        raise FilesystemError(f"A file already exists at {target}.")
    if not _as_bool(parents) and not target.parent.is_dir():
        raise FilesystemError(
            f"Parent folder does not exist: {target.parent}. "
            "Create it first or pass parents=true."
        )
    try:
        target.mkdir(parents=bool(_as_bool(parents)), exist_ok=False)
    except FileExistsError:
        return f"Folder already exists: {target}"
    except OSError as exc:
        raise FilesystemError(f"Cannot create folder: {exc}") from exc
    return f"Created folder {target}"


def _create_extension(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in BLOCKED_EXTENSIONS:
        raise FilesystemError(
            f"Aether will not create {suffix or 'that'} files. "
            "Create text, data, or source files instead."
        )
    if suffix not in AUTO_EXTENSIONS and suffix not in CODE_EXTENSIONS:
        raise FilesystemError(
            f"Unsupported file type: {suffix or '(no extension)'}. "
            "Allowed: text, markdown, data files, and common source files."
        )
    return suffix


def create_file(path: str, content: str) -> str:
    """Writes a new UTF-8 file; never overwrites and never creates parents."""
    if not isinstance(content, str):
        raise FilesystemError("content must be a string.")
    if "\x00" in content:
        raise FilesystemError("File content cannot contain null bytes.")
    target = _write_target(path)
    _create_extension(target)
    text = content.replace("\r\n", "\n").replace("\r", "\n")
    data = text.encode("utf-8")
    if len(data) > MAX_CREATE_BYTES:
        raise FilesystemError(
            f"Content is {len(data)} bytes; the limit is "
            f"{MAX_CREATE_BYTES} bytes."
        )
    if target.exists():
        raise FilesystemError(
            f"{target} already exists. Aether never overwrites files."
        )
    if not target.parent.is_dir():
        raise FilesystemError(
            f"Parent folder does not exist: {target.parent}. "
            "Create it with create_folder first."
        )
    try:
        with open(target, "x", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
    except FileExistsError as exc:
        raise FilesystemError(
            f"{target} already exists. Aether never overwrites files."
        ) from exc
    except OSError as exc:
        raise FilesystemError(f"Cannot create file: {exc}") from exc
    return f"Created {target} ({len(data)} bytes)."


def _move_target(source: Path, destination: Any) -> Path:
    raw = _absolute(destination)
    if raw.exists() and raw.is_dir():
        raw = raw / source.name
    return _write_target(raw)


def move_file(source: str, destination: str, _exact_target: bool = False) -> str:
    """Moves one file; the target must not exist."""
    src = _existing_file(source)
    target = (
        _write_target(destination)
        if _as_bool(_exact_target)
        else _move_target(src, destination)
    )
    if os.path.normcase(str(src)) == os.path.normcase(str(target)):
        return f"Nothing to move: {src} is already at the destination."
    if target.exists():
        raise FilesystemError(
            f"Target already exists: {target}. Nothing was moved."
        )
    if not target.parent.is_dir():
        raise FilesystemError(f"Target folder does not exist: {target.parent}")
    try:
        shutil.move(str(src), str(target))
    except OSError as exc:
        raise FilesystemError(f"Cannot move file: {exc}") from exc
    return f"Moved {src} -> {target}"


def _rename_target(source: Path, new_name: Any) -> Tuple[Path, bool]:
    name = _validate_name(new_name, label="file name")
    # Keep the requested capitalization: resolving an existing target on
    # Windows returns the on-disk case, which would hide a case-only rename.
    target = source.with_name(name)
    case_only = (
        os.path.normcase(str(source)) == os.path.normcase(str(target))
        and source.name != target.name
    )
    if os.path.normcase(str(source)) == os.path.normcase(str(target)):
        return target, case_only
    if target.exists():
        raise FilesystemError(
            f"A file named {target.name} already exists in that folder. "
            "Nothing was renamed."
        )
    return target, case_only


def rename_file(path: str, new_name: str) -> str:
    """Renames one file in place without overwriting anything."""
    src = _existing_file(path)
    target, case_only = _rename_target(src, new_name)
    if case_only:
        temp = src.with_name(f".aether-rename-{os.getpid()}-{time.time_ns()}")
        try:
            os.rename(src, temp)
            os.rename(temp, target)
        except OSError as exc:
            if temp.exists() and not src.exists():
                try:
                    os.rename(temp, src)
                except OSError:
                    pass
            raise FilesystemError(f"Cannot rename file: {exc}") from exc
        return f"Renamed {src} -> {target} (capitalization only)"
    if os.path.normcase(str(src)) == os.path.normcase(str(target)):
        return f"File is already named {target.name}."
    try:
        os.rename(src, target)
    except OSError as exc:
        raise FilesystemError(f"Cannot rename file: {exc}") from exc
    return f"Renamed {src} -> {target}"


def _category_for(name: str) -> str:
    return _EXTENSION_CATEGORIES.get(Path(name).suffix.lower(), "Other")


def _unique_target(folder: Path, name: str, taken: set[str]) -> Path:
    target = folder / name
    key = os.path.normcase(str(target))
    if not target.exists() and key not in taken:
        taken.add(key)
        return target
    stem, suffix = os.path.splitext(name)
    index = 2
    while True:
        candidate = folder / f"{stem} ({index}){suffix}"
        key = os.path.normcase(str(candidate))
        if not candidate.exists() and key not in taken:
            taken.add(key)
            return candidate
        index += 1


def _build_organize_plan(folder: Path) -> OrganizePlan:
    plan = OrganizePlan(folder=folder)
    taken: set[str] = set()
    entries: List[os.DirEntry] = []
    try:
        with os.scandir(folder) as scan:
            for entry in scan:
                try:
                    if entry.is_dir(follow_symlinks=False):
                        continue
                    if _is_link(entry):
                        plan.links += 1
                        continue
                    if not entry.is_file(follow_symlinks=False):
                        continue
                    if _is_hidden_or_system(entry):
                        plan.hidden += 1
                        continue
                except OSError:
                    continue
                entries.append(entry)
    except OSError as exc:
        raise FilesystemError(f"Cannot read folder: {exc}") from exc

    for entry in sorted(entries, key=lambda item: item.name.lower()):
        category = _category_for(entry.name)
        target = _unique_target(folder / category, entry.name, taken)
        plan.entries.append({"source": entry.path, "target": str(target)})
        plan.categories.setdefault(category, []).append(entry.name)
        if target.name != entry.name:
            plan.collisions.append(f'"{entry.name}" -> "{target.name}"')
    return plan


def _sample_names(names: Sequence[str], count: int = 3) -> str:
    shown = ", ".join(names[:count])
    remaining = len(names) - count
    return f"{shown}, … +{remaining}" if remaining > 0 else shown


def _organize_preview(plan: OrganizePlan) -> str:
    if not plan.entries:
        return (
            f"Organize {plan.folder} (by type)\n"
            "No files to organize. Subfolders are left untouched."
        )
    folders = sum(1 for names in plan.categories.values() if names)
    lines = [
        f"Organize {plan.folder} (by type)",
        f"{len(plan.entries)} files -> {folders} folders",
    ]
    for category in CATEGORY_ORDER:
        names = plan.categories.get(category)
        if names:
            lines.append(f"  {category} ({len(names)}): {_sample_names(names)}")
    if plan.hidden:
        lines.append(f"Skipped: {plan.hidden} hidden or system file(s).")
    if plan.links:
        lines.append(f"Skipped: {plan.links} link(s).")
    for collision in plan.collisions[:5]:
        lines.append(f"Name collision: {collision}")
    if len(plan.collisions) > 5:
        lines.append(f"… and {len(plan.collisions) - 5} more collisions.")
    lines.append("Subfolders are left untouched. No files will be overwritten.")
    return "\n".join(lines)


def organize_folder(
    path: str,
    by: str = "type",
    _plan: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """Sorts direct files into category folders; never recurses."""
    if str(by or "type").strip().lower() != "type":
        raise FilesystemError("Only organizing by type is supported.")
    folder = _existing_dir(path)

    if _plan is None:
        built = _build_organize_plan(folder)
        if not built.entries:
            return f"No files to organize in {folder}."
        items = [(Path(item["source"]), Path(item["target"])) for item in built.entries]
    else:
        if not isinstance(_plan, list) or not _plan:
            return f"No files to organize in {folder}."
        items = []
        for raw in _plan:
            if not isinstance(raw, dict):
                raise FilesystemError("The organize plan is invalid.")
            src = _planned_path(raw.get("source"))
            target = _write_target(raw.get("target"))
            if src.parent != folder:
                raise FilesystemError(
                    "The organize plan no longer matches that folder. "
                    "Run organize_folder again."
                )
            if target.parent.parent != folder or target.parent.name not in CATEGORY_ORDER:
                raise FilesystemError("The organize plan contains an invalid destination.")
            items.append((src, target))

    moved = 0
    failures: List[str] = []
    for src, target in items:
        if not src.is_file():
            failures.append(f"{src.name}: source no longer exists")
            continue
        if target.exists():
            failures.append(f"{src.name}: target already exists")
            continue
        try:
            target.parent.mkdir(exist_ok=True)
            shutil.move(str(src), str(target))
            moved += 1
        except OSError as exc:
            failures.append(f"{src.name}: {exc}")

    if moved == 0:
        result = f"No files were moved in {folder}."
    else:
        result = f"Organized {moved} file(s) into folders under {folder}."
    if failures:
        shown = "; ".join(failures[:10])
        extra = f" (+{len(failures) - 10} more)" if len(failures) > 10 else ""
        result += f"\nSkipped {len(failures)}: {shown}{extra}"
    return result


# ── Preview builders (read-only; capture the exact plan) ───────────────

def _truncate(text: str, max_lines: int = 30, max_chars: int = 1500) -> str:
    lines = text.splitlines()
    selected = lines[:max_lines]
    output = "\n".join(selected)
    if len(output) > max_chars:
        output = output[: max_chars - 1].rstrip() + "…"
    if len(lines) > max_lines:
        output += f"\n… {len(lines) - max_lines} more line(s)"
    return output


def _preview_move(args: Dict[str, Any]) -> PreviewResult:
    src = _existing_file(args.get("source"))
    target = _move_target(src, args.get("destination"))
    if target.exists():
        raise FilesystemError(
            f"Target already exists: {target}. Nothing will be moved."
        )
    if not target.parent.is_dir():
        raise FilesystemError(f"Target folder does not exist: {target.parent}")
    text = (
        "Move 1 file\n"
        f"  {src}\n"
        f"  -> {target}\n"
        "No files will be overwritten."
    )
    return PreviewResult(
        text=text,
        args={
            "source": str(src),
            "destination": str(target),
            "_exact_target": True,
        },
        risk="destructive",
    )


def _preview_rename(args: Dict[str, Any]) -> PreviewResult:
    src = _existing_file(args.get("path"))
    target, case_only = _rename_target(src, args.get("new_name"))
    if case_only:
        text = (
            "Rename 1 file (capitalization only)\n"
            f"  {src}\n"
            f"  -> {target}\n"
            "No files will be overwritten."
        )
    else:
        text = (
            "Rename 1 file\n"
            f"  {src}\n"
            f"  -> {target}\n"
            "No files will be overwritten."
        )
    return PreviewResult(
        text=text,
        args={"path": str(src), "new_name": target.name},
        risk="destructive",
    )


def _is_code_file(args: Dict[str, Any]) -> bool:
    try:
        return Path(str(args.get("path") or "")).suffix.lower() in CODE_EXTENSIONS
    except (TypeError, ValueError):
        return False


def _preview_create_file(args: Dict[str, Any]) -> PreviewResult:
    if not isinstance(args.get("content"), str):
        raise FilesystemError("content must be a string.")
    target = _write_target(args.get("path"))
    suffix = _create_extension(target)
    content = args["content"].replace("\r\n", "\n").replace("\r", "\n")
    data = content.encode("utf-8")
    if len(data) > MAX_CREATE_BYTES:
        raise FilesystemError(
            f"Content is {len(data)} bytes; the limit is {MAX_CREATE_BYTES} bytes."
        )
    if target.exists():
        raise FilesystemError(
            f"{target} already exists. Aether never overwrites files."
        )
    if not target.parent.is_dir():
        raise FilesystemError(
            f"Parent folder does not exist: {target.parent}. "
            "Create it with create_folder first."
        )
    content_lines = content.splitlines()
    shown = content_lines[:12]
    if len(content_lines) > len(shown):
        shown.append(f"… +{len(content_lines) - len(shown)} more line(s)")
    body = "\n".join(f"  {line}" for line in shown) if shown else "  (empty file)"
    text = (
        f"Create file {target}\n"
        f"  {suffix} · {len(data)} bytes\n"
        "First lines:\n"
        f"{body}\n"
        "No existing file will be overwritten."
    )
    return PreviewResult(
        text=_truncate(text, max_lines=24),
        args={"path": str(target), "content": args["content"]},
        risk="destructive",
    )


def _preview_organize(args: Dict[str, Any]) -> PreviewResult:
    folder = _existing_dir(args.get("path"))
    by = str(args.get("by") or "type").strip().lower()
    if by != "type":
        raise FilesystemError("Only organizing by type is supported.")
    plan = _build_organize_plan(folder)
    if not plan.entries:
        raise FilesystemError(f"No files to organize in {folder}.")
    return PreviewResult(
        text=_truncate(_organize_preview(plan)),
        args={"path": str(folder), "by": "type", "_plan": plan.entries},
        risk="destructive",
    )


register_approval_check("create_file", _is_code_file)
register_preview_builder("create_file", _preview_create_file)
register_preview_builder("move_file", _preview_move)
register_preview_builder("rename_file", _preview_rename)
register_preview_builder("organize_folder", _preview_organize)


def get_filesystem_tool_schemas() -> List[Dict[str, Any]]:
    """Returns OpenAI/GGUF function schemas for the file-system tools."""
    return [
        {
            "type": "function",
            "function": {
                "name": "find_files",
                "description": (
                    "Find files by name inside Aether's allowed folders. "
                    "Searches recursively, skips hidden/system folders, and "
                    "returns absolute paths. Add a root in Settings -> Tools "
                    "-> File System to search elsewhere."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": (
                                "Case-insensitive file-name text or a glob "
                                "such as *.pdf."
                            ),
                        },
                        "root": {
                            "type": "string",
                            "description": (
                                "Optional absolute folder or default name "
                                "(Desktop, Downloads, Documents)."
                            ),
                        },
                        "ext": {
                            "type": "string",
                            "description": "Optional extension filter, e.g. pdf or .docx.",
                        },
                        "depth": {
                            "type": "integer",
                            "description": "Recursion depth, 0-8 (default 6).",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum results, 1-50 (default 50).",
                        },
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "create_folder",
                "description": (
                    "Create one empty folder inside an allowed root. Never "
                    "overwrites. The parent folder must exist unless parents "
                    "is true."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Absolute path for the new folder.",
                        },
                        "parents": {
                            "type": "boolean",
                            "description": "Create missing parent folders (default false).",
                        },
                    },
                    "required": ["path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "create_file",
                "description": (
                    "Create a new UTF-8 text, data, or source file inside an "
                    "allowed root. Never overwrites and never creates parent "
                    "folders. Code files require approval."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Absolute path for the new file.",
                        },
                        "content": {
                            "type": "string",
                            "description": "File contents, at most 64 KB.",
                        },
                    },
                    "required": ["path", "content"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "move_file",
                "description": (
                    "Move one file to another folder or path inside Aether's "
                    "allowed folders. Never overwrites; the target must not "
                    "exist. The user approves the exact move first."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "source": {
                            "type": "string",
                            "description": "Absolute path of the file to move.",
                        },
                        "destination": {
                            "type": "string",
                            "description": (
                                "Absolute target path, or an existing folder "
                                "to move the file into."
                            ),
                        },
                    },
                    "required": ["source", "destination"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "rename_file",
                "description": (
                    "Rename one file in its current folder. new_name is a bare "
                    "file name and must not already exist. The user approves "
                    "the exact rename first."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Absolute path of the file to rename.",
                        },
                        "new_name": {
                            "type": "string",
                            "description": "New file name, without a folder path.",
                        },
                    },
                    "required": ["path", "new_name"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "organize_folder",
                "description": (
                    "Sort the files directly inside one allowed folder into "
                    "Images, Documents, Audio, Video, Archives, Code, and Other "
                    "folders. Never recurses, never overwrites, and never moves "
                    "subfolders. The user approves the exact plan first."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Absolute path of the folder to organize.",
                        },
                        "by": {
                            "type": "string",
                            "enum": ["type"],
                            "description": "Grouping mode (only 'type' in v1).",
                        },
                    },
                    "required": ["path"],
                },
            },
        },
    ]
