"""
Aether Native File Picker API
Provides Windows-native open-file / open-folder dialogs for the Settings modal.
Runs Tk's dialog in a worker thread so the FastAPI event loop is never blocked.
"""

import threading
from typing import Dict, List, Tuple

from fastapi import APIRouter

router = APIRouter(prefix="/api/system", tags=["system"])
_dialog_lock = threading.Lock()

_FILE_FILTERS: Dict[str, List[Tuple[str, str]]] = {
    "gguf": [("GGUF models", "*.gguf"), ("All files", "*.*")],
    "onnx": [("ONNX models", "*.onnx"), ("All files", "*.*")],
    "audio": [("Audio files", "*.wav *.mp3 *.flac"), ("All files", "*.*")],
    "image": [("Images", "*.png *.jpg *.jpeg *.webp"), ("All files", "*.*")],
    "document": [("Documents", "*.pdf *.docx *.md"), ("All files", "*.*")],
    "all": [("All files", "*.*")],
}


@router.get("/pick-file")
def pick_file(kind: str = "file", filter: str = "gguf") -> dict:
    """
    Opens a native Windows file/folder dialog and returns the chosen path.

    kind:   "file" or "directory"
    filter: gguf | onnx | audio | image | document | all
    """
    with _dialog_lock:
        try:
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            root.update()

            if kind == "directory":
                path = filedialog.askdirectory(
                    title="Select Aether folder", mustexist=True
                )
            else:
                filetypes = _FILE_FILTERS.get(filter, _FILE_FILTERS["all"])
                path = filedialog.askopenfilename(
                    title="Select Aether file",
                    filetypes=[(label, pattern) for label, pattern in filetypes],
                )
            root.destroy()
            return {"path": path or None}
        except Exception as exc:
            return {"path": None, "error": str(exc)}
