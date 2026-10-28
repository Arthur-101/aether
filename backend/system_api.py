"""
Aether Native File Picker API
Provides Windows-native open-file / open-folder dialogs for the Settings modal.

Tk is deliberately not used here. FastAPI runs sync endpoints in worker
threads, and creating/destroying a Tcl interpreter on one of those threads can
abort the whole daemon with ``Tcl_AsyncDelete: async handler deleted by the
wrong thread`` after the dialog closes. The Win32 common dialogs below are
safe to call from the request worker and cannot take the daemon down.
"""

import ctypes
import os
import sys
import threading
import time
import uuid
from ctypes import wintypes
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

# Common file dialog flags (commdlg.h).
_OFN_FILEMUSTEXIST = 0x00001000
_OFN_PATHMUSTEXIST = 0x00000800
_OFN_NOCHANGEDIR = 0x00000008
_OFN_EXPLORER = 0x00080000

# Modern folder dialog (IFileOpenDialog) constants.
_CLSID_FILE_OPEN_DIALOG = "DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7"
_IID_IFILE_OPEN_DIALOG = "D57C7288-D4AD-4768-BE02-9D969532D960"
_CLSCTX_INPROC_SERVER = 0x00000001
_FOS_PICKFOLDERS = 0x00000020
_FOS_FORCEFILESYSTEM = 0x00000040
_FOS_PATHMUSTEXIST = 0x00000800
_SIGDN_FILESYSPATH = 0x80058000
_ERROR_CANCELLED = 0x800704C7
_HRESULT = ctypes.c_long


class _OPENFILENAMEW(ctypes.Structure):
    """Win32 OPENFILENAMEW; kept local so no extra dependency is required."""

    _fields_ = [
        ("lStructSize", wintypes.DWORD),
        ("hwndOwner", wintypes.HWND),
        ("hInstance", wintypes.HINSTANCE),
        ("lpstrFilter", wintypes.LPCWSTR),
        ("lpstrCustomFilter", wintypes.LPWSTR),
        ("nMaxCustFilter", wintypes.DWORD),
        ("nFilterIndex", wintypes.DWORD),
        ("lpstrFile", wintypes.LPWSTR),
        ("nMaxFile", wintypes.DWORD),
        ("lpstrFileTitle", wintypes.LPWSTR),
        ("nMaxFileTitle", wintypes.DWORD),
        ("lpstrInitialDir", wintypes.LPCWSTR),
        ("lpstrTitle", wintypes.LPCWSTR),
        ("Flags", wintypes.DWORD),
        ("nFileOffset", wintypes.WORD),
        ("nFileExtension", wintypes.WORD),
        ("lpstrDefExt", wintypes.LPCWSTR),
        ("lCustData", wintypes.LPARAM),
        ("lpfnHook", ctypes.c_void_p),
        ("lpTemplateName", wintypes.LPCWSTR),
        ("pvReserved", ctypes.c_void_p),
        ("dwReserved", wintypes.DWORD),
        ("FlagsEx", wintypes.DWORD),
    ]


class _GUID(ctypes.Structure):
    """COM GUID in the in-memory layout CoCreateInstance expects."""

    _fields_ = [
        ("Data1", wintypes.DWORD),
        ("Data2", wintypes.WORD),
        ("Data3", wintypes.WORD),
        ("Data4", ctypes.c_ubyte * 8),
    ]


def _guid(text: str) -> _GUID:
    return _GUID.from_buffer_copy(uuid.UUID(text).bytes_le)


def _com_call(
    obj: ctypes.c_void_p,
    index: int,
    restype: type,
    argtypes: List[type],
    *args,
):
    """Calls one COM vtable slot on an interface pointer."""
    vtable = ctypes.cast(
        obj, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))
    ).contents
    prototype = ctypes.WINFUNCTYPE(restype, ctypes.c_void_p, *argtypes)
    return prototype(vtable[index])(obj, *args)


def _place_native_dialog(placement: Optional[Dict[str, int]]) -> None:
    """Move a native dialog to the free side of Settings once it exists."""
    if not placement or not sys.platform.startswith("win"):
        return

    def worker() -> None:
        user32 = ctypes.windll.user32
        user32.EnumWindows.argtypes = [ctypes.c_void_p, wintypes.LPARAM]
        user32.GetWindowThreadProcessId.argtypes = [
            wintypes.HWND,
            ctypes.POINTER(wintypes.DWORD),
        ]
        user32.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
        user32.IsWindowVisible.argtypes = [wintypes.HWND]
        user32.IsWindowVisible.restype = wintypes.BOOL
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
        pid = os.getpid()
        hwnd = None
        for _ in range(100):
            matches = []

            @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
            def collect(candidate, _lparam):
                owner = wintypes.DWORD()
                user32.GetWindowThreadProcessId(candidate, ctypes.byref(owner))
                if owner.value != pid or not user32.IsWindowVisible(candidate):
                    return True
                class_name = ctypes.create_unicode_buffer(64)
                user32.GetClassNameW(candidate, class_name, 64)
                if class_name.value == "#32770":
                    matches.append(candidate)
                return True

            user32.EnumWindows(collect, 0)
            if matches:
                hwnd = matches[0]
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


def _owner_hwnd() -> Optional[int]:
    """Returns the foreground window so the dialog opens above the app."""
    try:
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        return int(hwnd) or None
    except Exception:
        return None


def _filter_string(filter_key: str) -> str:
    """Builds the double-null-terminated filter block OPENFILENAME expects."""
    pairs = _FILE_FILTERS.get(filter_key, _FILE_FILTERS["all"])
    return "\0".join(f"{label}\0{pattern}" for label, pattern in pairs) + "\0\0"


def _show_open_file(title: str, filter_key: str) -> Optional[str]:
    """Shows the Win32 open-file dialog and returns the chosen path."""
    if not sys.platform.startswith("win"):
        raise RuntimeError("native file dialogs are only available on Windows")

    comdlg32 = ctypes.windll.comdlg32
    comdlg32.GetOpenFileNameW.argtypes = [ctypes.POINTER(_OPENFILENAMEW)]
    comdlg32.GetOpenFileNameW.restype = wintypes.BOOL
    comdlg32.CommDlgExtendedError.restype = wintypes.DWORD

    file_buffer = ctypes.create_unicode_buffer(32768)
    filter_text = _filter_string(filter_key)
    dialog = _OPENFILENAMEW()
    dialog.lStructSize = ctypes.sizeof(_OPENFILENAMEW)
    dialog.hwndOwner = _owner_hwnd()
    dialog.lpstrFilter = filter_text
    dialog.nFilterIndex = 1
    dialog.lpstrFile = ctypes.cast(file_buffer, wintypes.LPWSTR)
    dialog.nMaxFile = len(file_buffer)
    dialog.lpstrTitle = title
    dialog.Flags = (
        _OFN_FILEMUSTEXIST
        | _OFN_PATHMUSTEXIST
        | _OFN_NOCHANGEDIR
        | _OFN_EXPLORER
    )

    if not comdlg32.GetOpenFileNameW(ctypes.byref(dialog)):
        error = comdlg32.CommDlgExtendedError()
        if error:
            raise RuntimeError(f"file dialog failed (0x{error:08x})")
        return None
    return file_buffer.value or None


def _show_folder(title: str) -> Optional[str]:
    """Shows the modern Explorer-style folder picker and returns its path.

    ``SHBrowseForFolderW`` renders the legacy tree dialog. ``IFileOpenDialog``
    with ``FOS_PICKFOLDERS`` is the same Vista+ dialog family the file picker
    uses, so both Browse buttons share one look and one navigation model.
    """
    if not sys.platform.startswith("win"):
        raise RuntimeError("native folder dialogs are only available on Windows")

    ole32 = ctypes.OleDLL("ole32")
    ole32.CoCreateInstance.argtypes = [
        ctypes.POINTER(_GUID),
        ctypes.c_void_p,
        wintypes.DWORD,
        ctypes.POINTER(_GUID),
        ctypes.POINTER(ctypes.c_void_p),
    ]
    ole32.CoCreateInstance.restype = _HRESULT
    ole32.CoTaskMemFree.argtypes = [ctypes.c_void_p]
    ole32.CoTaskMemFree.restype = None

    clsid = _guid(_CLSID_FILE_OPEN_DIALOG)
    iid = _guid(_IID_IFILE_OPEN_DIALOG)
    dialog = ctypes.c_void_p()
    hr = ole32.CoCreateInstance(
        ctypes.byref(clsid),
        None,
        _CLSCTX_INPROC_SERVER,
        ctypes.byref(iid),
        ctypes.byref(dialog),
    )
    if hr != 0 or not dialog.value:
        raise RuntimeError(f"folder dialog unavailable (0x{hr & 0xFFFFFFFF:08x})")

    try:
        options = _FOS_PICKFOLDERS | _FOS_FORCEFILESYSTEM | _FOS_PATHMUSTEXIST
        hr = _com_call(dialog, 9, _HRESULT, [wintypes.DWORD], options)
        if hr != 0:
            raise RuntimeError(
                f"folder dialog options failed (0x{hr & 0xFFFFFFFF:08x})"
            )
        _com_call(dialog, 17, _HRESULT, [wintypes.LPCWSTR], title)
        _com_call(dialog, 18, _HRESULT, [wintypes.LPCWSTR], "Select Folder")

        hr = _com_call(dialog, 3, _HRESULT, [wintypes.HWND], _owner_hwnd())
        if hr != 0:
            if (hr & 0xFFFFFFFF) == _ERROR_CANCELLED:
                return None
            raise RuntimeError(f"folder dialog failed (0x{hr & 0xFFFFFFFF:08x})")

        item = ctypes.c_void_p()
        hr = _com_call(
            dialog, 20, _HRESULT, [ctypes.POINTER(ctypes.c_void_p)],
            ctypes.byref(item),
        )
        if hr != 0 or not item.value:
            return None
        try:
            path_ptr = ctypes.c_void_p()
            hr = _com_call(
                item, 5, _HRESULT,
                [ctypes.c_int, ctypes.POINTER(ctypes.c_void_p)],
                _SIGDN_FILESYSPATH, ctypes.byref(path_ptr),
            )
            if hr != 0 or not path_ptr.value:
                return None
            try:
                return ctypes.wstring_at(path_ptr.value) or None
            finally:
                ole32.CoTaskMemFree(path_ptr)
        finally:
            _com_call(item, 2, ctypes.c_ulong, [])
    finally:
        _com_call(dialog, 2, ctypes.c_ulong, [])


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
        com_initialized = False
        try:
            if sys.platform.startswith("win") and kind == "directory":
                import pythoncom

                try:
                    pythoncom.CoInitialize()
                    com_initialized = True
                except Exception:
                    # The thread may already be in a different COM apartment;
                    # the shell picker still works with the existing apartment.
                    pass

            title = "Select Aether folder" if kind == "directory" else "Select Aether file"
            _place_native_dialog(placement)
            if kind == "directory":
                path = _show_folder(title)
            else:
                path = _show_open_file(title, filter)
            return {"path": path or None}
        except Exception as exc:
            return {"path": None, "error": str(exc)}
        finally:
            if com_initialized:
                try:
                    import pythoncom

                    pythoncom.CoUninitialize()
                except Exception:
                    pass
