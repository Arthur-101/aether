"""
Best-effort sweep of the user's temp folder.

Windows temp is a shared dumping ground. Files still open by a running
installer, editor, or the assistant itself are locked, and a locked file simply
fails to delete: that is normal here and is reported as "skipped" rather than
raised as an error, because the user asked for a cleanup, not a guarantee.
Entries written in the last few minutes are left alone, since a process that
just created one may not have taken its lock yet.
"""

import logging
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger("aether.tempclean")

# A freshly written temp file may belong to an installer or a download still in
# progress and not locked yet, so anything this new waits for the next sweep.
MIN_AGE_SECONDS = 10 * 60


def _scan(path: Path) -> Tuple[int, float]:
    """Returns (bytes, newest write time) without following links.

    A folder is judged by its contents, not its own timestamp: Windows touches a
    directory whenever its entries change, so a folder created moments ago can
    still hold nothing worth keeping. An unreadable entry reports an infinite
    age, which keeps it out of the sweep.
    """
    if path.is_symlink():
        return 0, float("inf")
    try:
        if path.is_dir():
            total = 0
            newest: Optional[float] = None
            for child in path.rglob("*"):
                if child.is_symlink():
                    continue
                try:
                    info = child.stat()
                except OSError:
                    return 0, float("inf")
                if child.is_file():
                    total += info.st_size
                    newest = (
                        info.st_mtime if newest is None else max(newest, info.st_mtime)
                    )
            if newest is None:
                newest = path.stat().st_mtime
            return total, newest
        info = path.stat()
        return info.st_size, info.st_mtime
    except OSError:
        return 0, float("inf")


def clean_temp(min_age_seconds: int = MIN_AGE_SECONDS) -> Dict[str, Any]:
    """Deletes unlocked temp entries older than the guard and reports the totals.

    Returns the freed bytes plus how many entries were deleted and skipped, so
    the UI can say "412 MB freed, 37 skipped" instead of implying a clean sweep.
    """
    root = Path(tempfile.gettempdir()).resolve()
    # A resolved temp path is never a drive root or a filesystem root; refusing
    # those keeps a bad environment variable from turning this into an rm -rf.
    if not root.is_dir() or root.parent == root:
        raise RuntimeError("The temp folder could not be resolved.")

    cutoff = time.time() - max(0, int(min_age_seconds))
    freed = 0
    deleted = 0
    skipped = 0

    for entry in list(root.iterdir()):
        try:
            if entry.is_symlink():
                skipped += 1
                continue
            size, newest = _scan(entry)
            if newest > cutoff:
                skipped += 1
                continue
            if entry.is_dir():
                shutil.rmtree(entry)
            else:
                entry.unlink()
            freed += size
            deleted += 1
        except OSError:
            # In use, owned by another user, or protected: leave it alone.
            skipped += 1

    logger.info(
        "Temp sweep freed %d bytes (%d deleted, %d skipped)", freed, deleted, skipped
    )
    return {
        "path": str(root),
        "freed_bytes": freed,
        "deleted": deleted,
        "skipped": skipped,
    }
