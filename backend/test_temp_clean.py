"""Temp folder sweep: age guard, locked-file skipping, and refusal to nuke a root."""

import os
import time
from pathlib import Path

import pytest

from backend.os_hooks import temp_clean


def _use_root(monkeypatch, root: Path) -> None:
    monkeypatch.setattr(
        temp_clean.tempfile, "gettempdir", lambda: str(root)
    )


def _write(path: Path, size: int, age_seconds: int) -> None:
    path.write_bytes(b"x" * size)
    stamp = time.time() - age_seconds
    os.utime(path, (stamp, stamp))


def test_old_files_are_deleted_and_new_ones_kept(monkeypatch, tmp_path):
    _use_root(monkeypatch, tmp_path)
    _write(tmp_path / "old.tmp", 2048, 3600)
    _write(tmp_path / "fresh.tmp", 4096, 5)

    result = temp_clean.clean_temp()

    assert result["deleted"] == 1
    assert result["skipped"] == 1
    assert result["freed_bytes"] == 2048
    assert not (tmp_path / "old.tmp").exists()
    assert (tmp_path / "fresh.tmp").exists()


def test_old_directories_are_removed_recursively(monkeypatch, tmp_path):
    _use_root(monkeypatch, tmp_path)
    nested = tmp_path / "old-dir" / "inner"
    nested.mkdir(parents=True)
    _write(nested / "a.bin", 1024, 7200)
    _write(tmp_path / "old-dir" / "b.bin", 512, 7200)

    result = temp_clean.clean_temp()

    assert result["deleted"] == 1
    assert result["freed_bytes"] == 1536
    assert not (tmp_path / "old-dir").exists()


def test_a_directory_holding_a_fresh_file_is_kept(monkeypatch, tmp_path):
    _use_root(monkeypatch, tmp_path)
    folder = tmp_path / "mixed"
    folder.mkdir()
    _write(folder / "old.bin", 1024, 7200)
    _write(folder / "fresh.bin", 1024, 1)

    result = temp_clean.clean_temp()

    assert result["deleted"] == 0
    assert result["skipped"] == 1
    assert folder.exists()


def test_locked_entries_are_skipped_not_raised(monkeypatch, tmp_path):
    _use_root(monkeypatch, tmp_path)
    _write(tmp_path / "locked.txt", 1024, 3600)
    _write(tmp_path / "free.txt", 2048, 3600)

    real_unlink = Path.unlink

    def stubborn(self, *args, **kwargs):
        if self.name == "locked.txt":
            raise PermissionError("in use by another process")
        return real_unlink(self, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", stubborn)

    result = temp_clean.clean_temp()

    assert result["deleted"] == 1
    assert result["skipped"] == 1
    assert result["freed_bytes"] == 2048
    assert (tmp_path / "locked.txt").exists()


def test_a_filesystem_root_is_refused(monkeypatch):
    root = Path(Path.cwd().anchor)  # "C:\\" on Windows, "/" elsewhere
    _use_root(monkeypatch, root)

    with pytest.raises(RuntimeError):
        temp_clean.clean_temp()


def test_api_endpoint_reports_a_sweep(monkeypatch, tmp_path):
    _use_root(monkeypatch, tmp_path)
    _write(tmp_path / "old.tmp", 1024, 3600)

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from backend import system_api

    app = FastAPI()
    app.include_router(system_api.router)

    response = TestClient(app).post("/api/system/clean-temp")

    assert response.status_code == 200
    assert response.json()["freed_bytes"] == 1024
