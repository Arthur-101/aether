"""T9 file-system tests: roots, validation, previews, search, and organize."""

import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from backend import filesystem_roots
from backend.mcp_tools import filesystem_tools as fs
from backend.mcp_tools.tool_permissions import (
    build_tool_preview,
    requires_approval,
)


@pytest.fixture()
def root(tmp_path, monkeypatch):
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    monkeypatch.setattr(fs, "_roots", lambda: [allowed])
    return allowed


def test_profile_and_system_paths_are_hard_denied():
    home = Path.home()
    assert filesystem_roots.is_hard_denied(home) is True
    assert filesystem_roots.is_hard_denied(home / "AppData") is True
    assert filesystem_roots.is_hard_denied(Path(home.anchor)) is True
    assert filesystem_roots.is_hard_denied(home.parent) is True
    windows = os.environ.get("WINDIR") or os.environ.get("SystemRoot")
    if windows:
        assert filesystem_roots.is_hard_denied(Path(windows)) is True
    # The repository folder is an ordinary directory, not a protected path.
    assert filesystem_roots.is_hard_denied(Path(__file__).resolve().parent) is False


def test_normalize_allowed_roots_dedupes_and_drops_nested(tmp_path, monkeypatch):
    default = tmp_path / "default"
    default.mkdir()
    monkeypatch.setattr(filesystem_roots, "default_roots", lambda: [default])
    monkeypatch.setattr(filesystem_roots, "is_hard_denied", lambda _path: False)

    base = tmp_path / "base"
    base.mkdir()
    (base / "child").mkdir()
    result = filesystem_roots.normalize_allowed_roots([
        str(base),
        str(base),
        str(default),
        str(default / "child"),
        "relative\\path",
    ])
    assert result == [str(base)]


def test_allowed_root_paths_skips_missing_roots(tmp_path, monkeypatch):
    default = tmp_path / "default"
    default.mkdir()
    missing = tmp_path / "missing"
    monkeypatch.setattr(filesystem_roots, "default_roots", lambda: [default])
    monkeypatch.setattr(filesystem_roots, "is_hard_denied", lambda _path: False)
    paths = filesystem_roots.allowed_root_paths([str(missing)])
    assert paths == [default]


def test_create_file_normalizes_lines_and_enforces_limits(root):
    path = root / "notes.md"
    result = fs.create_file(str(path), "one\r\ntwo\rthree\r\n")
    assert "Created" in result
    assert path.read_bytes() == b"one\ntwo\nthree\n"

    with pytest.raises(fs.FilesystemError):
        fs.create_file(str(path), "again")

    with pytest.raises(fs.FilesystemError):
        fs.create_file(str(root / "big.txt"), "x" * (fs.MAX_CREATE_BYTES + 1))

    with pytest.raises(fs.FilesystemError):
        fs.create_file(str(root / "null.txt"), "a\x00b")

    with pytest.raises(fs.FilesystemError):
        fs.create_file(str(root / "run.bat"), "echo hi")

    with pytest.raises(fs.FilesystemError):
        fs.create_file(str(root / "data.xyz"), "hi")

    with pytest.raises(fs.FilesystemError):
        fs.create_file(str(root / "missing" / "notes.md"), "hi")


def test_create_folder_parents(root):
    with pytest.raises(fs.FilesystemError):
        fs.create_folder(str(root / "a" / "b"))
    assert "Created folder" in fs.create_folder(str(root / "a" / "b"), parents=True)
    assert "already exists" in fs.create_folder(str(root / "a" / "b"))
    assert "Created folder" in fs.create_folder(str(root / "one"))
    with pytest.raises(fs.FilesystemError):
        fs.create_folder(str(root / "one" / "two" / "three"))


def test_paths_outside_roots_are_rejected(tmp_path, monkeypatch):
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.txt").write_text("x", encoding="utf-8")
    monkeypatch.setattr(fs, "_roots", lambda: [allowed])

    with pytest.raises(fs.FilesystemError):
        fs.create_file(str(outside / "new.txt"), "hi")
    with pytest.raises(fs.FilesystemError):
        fs.create_folder(str(outside / "new"))
    with pytest.raises(fs.FilesystemError):
        fs.move_file(str(outside / "secret.txt"), str(allowed / "secret.txt"))
    with pytest.raises(fs.FilesystemError):
        fs.rename_file(str(outside / "secret.txt"), "renamed.txt")
    with pytest.raises(fs.FilesystemError):
        fs.find_files("secret", root=str(outside))
    # The rejection never touched the disk.
    assert (outside / "secret.txt").exists()
    assert not (outside / "new.txt").exists()


def test_find_files_respects_depth_and_limit(root):
    (root / "top.txt").write_text("x", encoding="utf-8")
    deep = root / "one" / "two" / "three"
    deep.mkdir(parents=True)
    (deep / "buried.txt").write_text("x", encoding="utf-8")

    shallow = fs.find_files("*.txt", depth=1)
    assert "top.txt" in shallow
    assert "buried.txt" not in shallow

    everything = fs.find_files("*.txt", depth=8)
    assert "buried.txt" in everything

    for index in range(5):
        (root / f"many{index}.log").write_text("x", encoding="utf-8")
    limited = fs.find_files("*.log", limit=2)
    assert limited.count("\n") <= 3
    assert "Showing the first 2" in limited


def test_move_file_into_folder_and_no_overwrite(root):
    source = root / "report.txt"
    source.write_text("data", encoding="utf-8")
    target_dir = root / "archive"
    target_dir.mkdir()

    result = fs.move_file(str(source), str(target_dir))
    assert (target_dir / "report.txt").exists()
    assert "Moved" in result

    other = root / "other.txt"
    other.write_text("x", encoding="utf-8")
    with pytest.raises(fs.FilesystemError):
        fs.move_file(str(other), str(target_dir / "report.txt"))


def test_rename_file_validation_and_collision(root):
    source = root / "draft.txt"
    source.write_text("x", encoding="utf-8")
    other = root / "taken.txt"
    other.write_text("x", encoding="utf-8")

    assert "Renamed" in fs.rename_file(str(source), "final.txt")
    assert (root / "final.txt").exists()

    with pytest.raises(fs.FilesystemError):
        fs.rename_file(str(root / "final.txt"), "taken.txt")
    with pytest.raises(fs.FilesystemError):
        fs.rename_file(str(root / "final.txt"), "..\\escape.txt")
    with pytest.raises(fs.FilesystemError):
        fs.rename_file(str(root / "final.txt"), "CON.txt")


def test_organize_preview_and_execution(root):
    for name in ("x.jpg", "y.jpg", "z.png", "doc.pdf", "song.mp3"):
        (root / name).write_text("data", encoding="utf-8")
    (root / "keep").mkdir()

    preview = build_tool_preview("organize_folder", {"path": str(root)})
    assert preview is not None
    assert "Organize" in preview.text
    assert "Images (3)" in preview.text
    assert "Subfolders are left untouched" in preview.text
    assert preview.risk == "destructive"

    plan = preview.args["_plan"]
    result = fs.organize_folder(str(root), "type", plan)
    assert "Organized 5 file(s)" in result
    assert (root / "Images" / "x.jpg").exists()
    assert (root / "Documents" / "doc.pdf").exists()
    assert (root / "Audio" / "song.mp3").exists()
    assert (root / "keep").is_dir()


def test_organize_plan_skips_changed_entries(root):
    (root / "a.jpg").write_text("data", encoding="utf-8")
    (root / "b.png").write_text("data", encoding="utf-8")

    plan = build_tool_preview("organize_folder", {"path": str(root)}).args["_plan"]
    (root / "a.jpg").unlink()  # vanished after the preview
    (root / "Images" / "b.png").mkdir(parents=True)  # target appeared

    result = fs.organize_folder(str(root), "type", plan)
    assert "Skipped" in result
    assert "source no longer exists" in result
    assert "target already exists" in result


def test_organize_collisions_are_planned(root):
    (root / "photo.jpg").write_text("data", encoding="utf-8")
    (root / "Images").mkdir()
    (root / "Images" / "photo.jpg").write_text("old", encoding="utf-8")

    preview = build_tool_preview("organize_folder", {"path": str(root)})
    assert "Name collision" in preview.text
    assert '"photo (2).jpg"' in preview.text


def test_move_preview_captures_exact_target(root):
    source = root / "file.txt"
    source.write_text("data", encoding="utf-8")
    target_dir = root / "dest"
    target_dir.mkdir()

    preview = build_tool_preview("move_file", {
        "source": str(source),
        "destination": str(target_dir),
    })
    assert preview.args["_exact_target"] is True
    assert preview.args["destination"] == str(target_dir / "file.txt")
    assert "No files will be overwritten" in preview.text


def test_move_preview_rejects_existing_target(root):
    source = root / "file.txt"
    source.write_text("data", encoding="utf-8")
    target = root / "other.txt"
    target.write_text("x", encoding="utf-8")
    with pytest.raises(fs.FilesystemError):
        build_tool_preview("move_file", {
            "source": str(source),
            "destination": str(target),
        })


def test_create_file_approval_tiers(root):
    assert requires_approval("create_file", {"path": str(root / "notes.md")}) is False
    assert requires_approval("create_file", {"path": str(root / "app.py")}) is True

    preview = build_tool_preview("create_file", {
        "path": str(root / "app.py"),
        "content": "print('hi')\n",
    })
    assert preview.risk == "destructive"
    assert "Create file" in preview.text
    assert "app.py" in preview.text


def test_organize_rejects_unknown_grouping(root):
    (root / "a.txt").write_text("x", encoding="utf-8")
    with pytest.raises(fs.FilesystemError):
        build_tool_preview("organize_folder", {"path": str(root), "by": "date"})


class _RecordingEngine:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def complete(self, messages, **kwargs):
        self.calls.append(messages)
        return self.replies.pop(0)


def _tool_call(name, arguments):
    return {
        "id": "call-1",
        "function": {"name": name, "arguments": json.dumps(arguments)},
    }


def test_router_previews_move_and_executes_exact_plan(root, monkeypatch):
    from backend.ai.llm_router import llm_router

    source = root / "file.txt"
    source.write_text("data", encoding="utf-8")
    dest_dir = root / "dest"
    dest_dir.mkdir()

    engine = _RecordingEngine([
        {"content": "Moving.", "tool_calls": [
            _tool_call("move_file", {
                "source": str(source),
                "destination": str(dest_dir),
            })
        ]},
        {"content": "Moved.", "tool_calls": []},
    ])
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)

    paused = llm_router.chat_completion(
        [{"role": "user", "content": "move it"}], session_id="s-fs"
    )
    approval = paused["approval_required"]
    assert approval["name"] == "move_file"
    assert approval["risk"] == "destructive"
    assert "Move 1 file" in approval["preview"]
    assert approval["args"]["_exact_target"] is True
    assert source.exists()  # nothing ran before approval

    result = llm_router.resolve_approval(approval["approval_id"], "s-fs", True)
    assert result["content"] == "Moved."
    assert (dest_dir / "file.txt").exists()


def test_router_preview_failure_returns_tool_error_without_pausing(root, monkeypatch):
    from backend.ai.llm_router import llm_router

    source = root / "file.txt"
    source.write_text("data", encoding="utf-8")
    engine = _RecordingEngine([
        {"content": "", "tool_calls": [
            _tool_call("move_file", {
                "source": str(source),
                "destination": str(root / "missing" / "file.txt"),
            })
        ]},
        {"content": "Could not move it.", "tool_calls": []},
    ])
    monkeypatch.setattr(llm_router, "_engine", lambda: engine)

    result = llm_router.chat_completion(
        [{"role": "user", "content": "move it"}], session_id="s-fs-2"
    )
    assert "approval_required" not in result
    assert result["content"] == "Could not move it."
    follow_up = engine.calls[-1][-1]
    assert follow_up["role"] == "tool"
    assert follow_up["content"].startswith("Error")
    assert source.exists()

