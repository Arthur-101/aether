"""Chat history metadata tests: old-schema migration and turn round-trips."""

import sqlite3
import struct
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.db import sessions as sessions_module
from backend.db.database import get_db, init_db
from backend.db.sessions import SessionManager


ZERO_VECTOR = struct.pack("384f", *([0.0] * 384))


@pytest.fixture()
def session_db(tmp_path, monkeypatch):
    """Temp database with one session; embeddings stubbed to keep tests offline."""
    db_path = tmp_path / "history.db"
    init_db(db_path)
    conn = get_db(db_path)
    conn.execute(
        "INSERT INTO sessions (id, title) VALUES (?, ?)",
        ("session-1", "History test"),
    )
    conn.commit()
    conn.close()
    monkeypatch.setattr(sessions_module, "get_db", lambda: get_db(db_path))
    monkeypatch.setattr(sessions_module, "embed_text", lambda _text: ZERO_VECTOR)
    return db_path


def test_init_db_adds_metadata_columns_to_old_chat_memory(tmp_path):
    db_path = tmp_path / "old.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute("""
        CREATE TABLE chat_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            user_prompt TEXT NOT NULL,
            ai_reply TEXT NOT NULL,
            combined_text TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute(
        """INSERT INTO chat_memory (session_id, user_prompt, ai_reply, combined_text)
           VALUES (?, ?, ?, ?)""",
        ("old-session", "Hi", "Hello", "User: Hi\nAI: Hello"),
    )
    conn.commit()
    conn.close()

    init_db(db_path)

    conn = get_db(db_path)
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(chat_memory)")}
    assert {"attachments", "tools_used"} <= columns
    row = conn.execute(
        "SELECT attachments, tools_used FROM chat_memory WHERE session_id = ?",
        ("old-session",),
    ).fetchone()
    assert row["attachments"] == "[]"
    assert row["tools_used"] == "[]"
    conn.close()


def test_switch_session_returns_label_only_attachment_and_tool_metadata(session_db):
    manager = SessionManager()
    manager.commit_turn(
        "session-1",
        "Summarize Q3.pdf",
        "It was a strong quarter.",
        attachments=[
            {
                "file_name": "Q3.pdf",
                "mode": "inline",
                "file_path": "C:/private/Q3.pdf",
                "inline_text": "secret contents",
            },
            {"file_name": "", "mode": "image"},
        ],
        tools_used=[
            {"name": "read_note", "output": "note body"},
            {"name": "web_search", "output": "Error: missing key"},
            {"name": "list_notes", "ok": True, "output": "ignored"},
        ],
    )

    data = manager.switch_session("session-1")

    assert data["session"]["id"] == "session-1"
    assert data["session"]["title"] == "History test"
    turn = data["history"][0]
    assert turn["attachments"] == [{"file_name": "Q3.pdf", "mode": "inline"}]
    assert turn["tools_used"] == [
        {"name": "read_note", "ok": True},
        {"name": "web_search", "ok": False},
        {"name": "list_notes", "ok": True},
    ]
    assert "file_path" not in turn
    assert "secret contents" not in str(turn)
    assert "note body" not in str(turn)


def test_commit_turn_defaults_to_empty_metadata(session_db):
    manager = SessionManager()
    manager.commit_turn("session-1", "Hello", "Hi")

    turn = manager.switch_session("session-1")["history"][0]

    assert turn["attachments"] == []
    assert turn["tools_used"] == []


def test_history_tolerates_missing_or_corrupt_metadata(session_db):
    manager = SessionManager()
    manager.commit_turn("session-1", "Hello", "Hi")
    conn = get_db(session_db)
    conn.execute(
        "UPDATE chat_memory SET attachments = NULL, tools_used = 'not json' WHERE session_id = ?",
        ("session-1",),
    )
    conn.commit()
    conn.close()

    turn = manager.switch_session("session-1")["history"][0]

    assert turn["attachments"] == []
    assert turn["tools_used"] == []
