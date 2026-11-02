"""
Aether Logging Setup
Routes daemon logs to the console and to a rotating file under
``%LOCALAPPDATA%/Aether/Logs`` so packaged (windowed) builds keep diagnostics
that a discarded stderr would otherwise lose.
"""

import logging
import logging.handlers
from pathlib import Path
from typing import Optional

from .config_manager import get_logs_dir

LOG_FORMAT = "%(asctime)s [%(name)s] %(message)s"
LOG_FILE_NAME = "aether-backend.log"
MAX_BYTES = 2 * 1024 * 1024
BACKUP_COUNT = 3


def configure_logging(level: int = logging.INFO) -> Optional[Path]:
    """Installs console and rotating-file handlers once.

    Safe to call more than once: existing handlers are left in place. Returns
    the log file path, or ``None`` if the file could not be opened (read-only
    disk, permissions); console logging still works in that case.
    """
    root = logging.getLogger()
    root.setLevel(level)
    formatter = logging.Formatter(LOG_FORMAT)

    has_stream = any(
        isinstance(handler, logging.StreamHandler)
        and not isinstance(handler, logging.FileHandler)
        for handler in root.handlers
    )
    if not has_stream:
        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(formatter)
        root.addHandler(stream_handler)

    has_file = any(
        isinstance(handler, logging.handlers.RotatingFileHandler)
        for handler in root.handlers
    )
    if has_file:
        return None

    try:
        log_file = get_logs_dir() / LOG_FILE_NAME
        file_handler = logging.handlers.RotatingFileHandler(
            log_file,
            maxBytes=MAX_BYTES,
            backupCount=BACKUP_COUNT,
            encoding="utf-8",
        )
    except OSError as exc:
        root.warning("Could not open the Aether log file: %s", exc)
        return None

    file_handler.setFormatter(formatter)
    root.addHandler(file_handler)
    return log_file
