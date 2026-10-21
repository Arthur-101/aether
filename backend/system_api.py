"""
Aether Native File Picker API
Provides Windows-native open-file / open-folder dialogs for the Settings modal.
Runs Tk's dialog in a worker thread so the FastAPI event loop is never blocked.
"""

import sys
import threading
import time
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter

router = APIRouter(prefix="/api/system", tags=["system"])
_dialog_lock = threading.Lock()

_FILE_FILTERS: Dict[str, List[Tuple[str, str]]] = {
    "gguf": [("GGUF models", "*.gguf"), ("All files", "*.*")],
    "onnx": [("ONNX models", "*.onnx"), ("All files", "*.*")],
    "audio": [("Audio files", "*.wav *.mp3 *.flac"), ("All files", "*.*")],
    "image": [("Images", "*.png *.jpg *.jpeg *.webp"), ("All files", "*.*")],
    "document": [("Documents", "*.pdf *.docx *.md"), ("All files", "*.*")],
    "app": [("Apps and shortcuts", "*.exe *.lnk"), ("All files", "*.*")],
    "all": [("All files", "*.*")],
}


def _place_native_dialog(
    title: str, placement: Optional[Dict[str, int]]
) -> None:
    """Move a native Tk dialog to the free side of Settings once it exists."""
    if not placement or not sys.platform.startswith("win"):
        return

    def worker() -> None:
        import ctypes

        user32 = ctypes.windll.user32
        user32.FindWindowW.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p]
        user32.FindWindowW.restype = ctypes.c_void_p
        user32.SetWindowPos.argtypes = [
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_uint,
        ]
        user32.SetWindowPos.restype = ctypes.c_bool

        # SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW
        flags = 0x0004 | 0x0010 | 0x0040
        hwnd = None
        for _ in range(100):
            hwnd = user32.FindWindowW("#32770", title)
            if hwnd:
                break
            time.sleep(0.05)
        if not hwnd:
            return

        # Windows applies the dialog's default size shortly after creation, so
        # reapply the target rect a few times until the dialog has settled.
        for _ in range(6):
            user32.SetWindowPos(
                hwnd,
                None,
                placement["x"],
                placement["y"],
                placement["width"],
                placement["height"],
                flags,
            )
            time.sleep(0.2)

    threading.Thread(
        target=worker, daemon=True, name="aether-dialog-placement"
    ).start()


@router.get("/pick-file")
def pick_file(
    kind: str = "file",
    filter: str = "gguf",
    x: Optional[int] = None,
    y: Optional[int] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
) -> dict:
    """
    Opens a native Windows file/folder dialog and returns the chosen path.

    kind:   "file" or "directory"
    filter: gguf | onnx | audio | image | document | all
    x/y/width/height: optional physical screen placement for the dialog.
    """
    placement = None
    if (
        x is not None
        and y is not None
        and width is not None
        and height is not None
        and width > 0
        and height > 0
    ):
        placement = {"x": x, "y": y, "width": width, "height": height}

    with _dialog_lock:
        try:
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            root.update()

            title = "Select Aether folder" if kind == "directory" else "Select Aether file"
            _place_native_dialog(title, placement)
            if kind == "directory":
                path = filedialog.askdirectory(title=title, mustexist=True)
            else:
                filetypes = _FILE_FILTERS.get(filter, _FILE_FILTERS["all"])
                path = filedialog.askopenfilename(
                    title=title,
                    filetypes=[(label, pattern) for label, pattern in filetypes],
                )
            root.destroy()
            return {"path": path or None}
        except Exception as exc:
            return {"path": None, "error": str(exc)}
