"""Native picker tests.

The dialog helpers are replaced so these tests never open a window. They pin
the response shape and the Win32 filter encoding that replaced Tk.
"""

from backend import system_api


def test_guid_uses_com_memory_layout():
    guid = system_api._guid(system_api._CLSID_FILE_OPEN_DIALOG)

    assert (guid.Data1, guid.Data2, guid.Data3) == (0xDC1C5A9C, 0xE88A, 0x4DDE)
    assert len(bytes(guid)) == 16


def test_filter_string_is_double_null_terminated():
    value = system_api._filter_string("onnx")

    assert value.endswith("\0\0")
    assert "ONNX models\0*.onnx" in value


def test_unknown_filter_falls_back_to_all_files():
    value = system_api._filter_string("not-a-filter")

    assert "All files\0*.*" in value


def test_multi_pattern_filters_use_semicolons():
    # Win32 OPENFILENAME requires ';' between patterns inside one display name.
    # Spaces make the pattern match nothing, so the dialog only lists folders.
    assert "*.exe;*.lnk" in system_api._filter_string("app")
    assert "*.wav;*.mp3;*.flac" in system_api._filter_string("audio")
    assert "*.png;*.jpg;*.jpeg;*.webp" in system_api._filter_string("image")
    assert "*.pdf;*.docx;*.md" in system_api._filter_string("document")


def test_pick_file_returns_the_selected_path(monkeypatch):
    monkeypatch.setattr(
        system_api,
        "_show_open_file",
        lambda title, filter_key: r"C:\Models\models\onnx\paradee.onnx",
    )

    assert system_api.pick_file(kind="file", filter="onnx") == {
        "path": r"C:\Models\models\onnx\paradee.onnx"
    }


def test_pick_file_cancel_returns_none(monkeypatch):
    monkeypatch.setattr(system_api, "_show_open_file", lambda title, filter_key: None)

    assert system_api.pick_file(kind="file", filter="onnx") == {"path": None}


def test_pick_folder_returns_the_selected_path(monkeypatch):
    monkeypatch.setattr(system_api, "_show_folder", lambda title: r"C:\Models")

    assert system_api.pick_file(kind="directory") == {"path": r"C:\Models"}


def test_pick_folder_cancel_returns_none(monkeypatch):
    monkeypatch.setattr(system_api, "_show_folder", lambda title: None)

    assert system_api.pick_file(kind="directory") == {"path": None}
