"""Configurable memory depth, token budgets, and bad-turn filtering."""

import struct
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.db import sessions as sessions_module
from backend.db.database import get_db, init_db
from backend.db.sessions import (
    MEMORY_DEFAULTS,
    SessionManager,
    is_fallback_reply,
    looks_like_reasoning,
    memory_profile,
)

ZERO_VECTOR = struct.pack("384f", *([0.0] * 384))
REASONING_LEAK = (
    "The user said they want me to continue updating the note. "
    "They want every tool listed with a short explanation and proper groups. "
    "Let me think about the best structure and then write the whole thing out."
)


@pytest.fixture()
def memory_config(monkeypatch):
    """Patches the config read with an in-memory AI section."""
    values = {"mode": "local_gguf"}

    def fake_get(section, key=None, default=None):
        if section == "ai_provider" and key in values:
            return values[key]
        return default

    monkeypatch.setattr(sessions_module.config_manager, "get", fake_get)
    return values


@pytest.fixture()
def session_db(tmp_path, monkeypatch, memory_config):
    """Temp database with one session and stubbed embeddings."""
    db_path = tmp_path / "memory.db"
    init_db(db_path)
    conn = get_db(db_path)
    conn.execute(
        "INSERT INTO sessions (id, title) VALUES (?, ?)",
        ("session-1", "Memory test"),
    )
    conn.commit()
    conn.close()
    monkeypatch.setattr(sessions_module, "get_db", lambda: get_db(db_path))
    monkeypatch.setattr(sessions_module, "embed_text", lambda _text: ZERO_VECTOR)
    return db_path


def test_memory_defaults_are_local_2_3_and_cloud_8_8():
    assert MEMORY_DEFAULTS["local"] == {
        "recent_turns": 2,
        "semantic_matches": 3,
    }
    assert MEMORY_DEFAULTS["cloud"] == {
        "recent_turns": 8,
        "semantic_matches": 8,
    }


def test_memory_profile_reads_configured_values(memory_config):
    memory_config.update(
        {
            "mode": "cloud",
            "memory_cloud_recent_turns": 5,
            "memory_cloud_semantic_matches": 6,
        }
    )

    profile = memory_profile()

    assert profile["category"] == "cloud"
    assert profile["recent_turns"] == 5
    assert profile["semantic_matches"] == 6
    assert profile["token_budget"] == 400 + 11 * 320


def test_memory_profile_clamps_out_of_range_values(memory_config):
    memory_config.update(
        {
            "memory_local_recent_turns": 99,
            "memory_local_semantic_matches": -4,
        }
    )

    profile = memory_profile("ollama")

    assert profile["category"] == "local"
    assert profile["recent_turns"] == 12
    assert profile["semantic_matches"] == 0


def test_fallback_and_reasoning_detection():
    assert is_fallback_reply("")
    assert is_fallback_reply("I could not produce a response.")
    assert is_fallback_reply(
        "The model returned only reasoning, not an answer. Please try again."
    )
    assert not is_fallback_reply("Here is the summary.")

    assert looks_like_reasoning(REASONING_LEAK)
    assert not looks_like_reasoning("Let me send the report tomorrow.")


def test_commit_turn_skips_fallback_and_reasoning_replies(session_db):
    manager = SessionManager()

    assert manager.commit_turn("session-1", "hello", "") is False
    assert (
        manager.commit_turn(
            "session-1", "hello", "I could not produce a response."
        )
        is False
    )
    assert manager.commit_turn("session-1", "hello", REASONING_LEAK) is False

    conn = get_db(session_db)
    assert conn.execute("SELECT COUNT(*) FROM chat_memory").fetchone()[0] == 0
    conn.close()


def test_local_context_keeps_two_recent_turns_and_three_matches(session_db):
    manager = SessionManager()
    for index in range(8):
        manager.commit_turn("session-1", f"question {index}", f"answer {index}")

    context = manager.build_session_context(
        "session-1", "question 7", mode="local_gguf"
    )

    assert "[Recent Conversation]" in context
    recent_section = context.split("[Recent Conversation]")[1].split("\n\n")[0]
    assert recent_section.count("User:") == 2
    assert "question 7" in recent_section
    assert "question 6" in recent_section
    assert context.count("Past User:") <= 3


def test_cloud_context_keeps_eight_recent_turns_and_eight_matches(session_db):
    manager = SessionManager()
    for index in range(24):
        manager.commit_turn("session-1", f"question {index}", f"answer {index}")

    context = manager.build_session_context(
        "session-1", "question 23", mode="cloud"
    )

    assert "[Recent Conversation]" in context
    recent_section = context.split("[Recent Conversation]")[1].split("\n\n")[0]
    assert recent_section.count("User:") == 8
    for index in range(16, 24):
        assert f"question {index}" in recent_section
    assert context.count("Past User:") <= 8


def test_settings_override_changes_local_context_depth(session_db, memory_config):
    memory_config.update(
        {
            "memory_local_recent_turns": 4,
            "memory_local_semantic_matches": 1,
        }
    )
    manager = SessionManager()
    for index in range(10):
        manager.commit_turn("session-1", f"question {index}", f"answer {index}")

    context = manager.build_session_context(
        "session-1", "question 9", mode="ollama"
    )

    recent_section = context.split("[Recent Conversation]")[1].split("\n\n")[0]
    assert recent_section.count("User:") == 4
    assert context.count("Past User:") <= 1


def test_memory_blocks_include_tool_names_only(session_db):
    manager = SessionManager()
    manager.commit_turn(
        "session-1",
        "what is on my clipboard",
        "It says hello.",
        tools_used=[
            {
                "name": "read_clipboard",
                "ok": True,
                "output": "secret clipboard text",
            },
            {"name": "read_clipboard", "ok": True},
            {"name": "list_notes", "ok": False, "output": "Error: nope"},
        ],
    )

    context = manager.build_session_context(
        "session-1", "what is on my clipboard", mode="cloud"
    )

    assert "Tools: read_clipboard, list_notes" in context
    assert "secret clipboard text" not in context
    assert "nope" not in context


def test_retrieval_skips_failed_only_and_fallback_turns(session_db):
    manager = SessionManager()
    manager.commit_turn("session-1", "good question", "good answer")
    manager.commit_turn(
        "session-1",
        "failed question",
        "The tool failed.",
        tools_used=[{"name": "read_note", "ok": False}],
    )
    manager.commit_turn(
        "session-1", "fallback question", "I could not produce a response."
    )

    context = manager.build_session_context(
        "session-1", "good question", mode="cloud"
    )

    assert "good question" in context
    assert "failed question" not in context
    assert "fallback question" not in context


def test_long_memory_blocks_are_clipped(session_db):
    manager = SessionManager()
    manager.commit_turn("session-1", "long question", "y" * 5000)

    context = manager.build_session_context(
        "session-1", "long question", mode="cloud"
    )

    assert "…" in context
    assert len(context) < 1600


def test_memory_budget_drops_blocks_when_exhausted(session_db, monkeypatch):
    monkeypatch.setattr(sessions_module, "MEMORY_BASE_TOKENS", 100)
    monkeypatch.setattr(sessions_module, "MEMORY_TOKEN_PER_BLOCK", 10)
    manager = SessionManager()
    for index in range(8):
        manager.commit_turn(
            "session-1", f"question {index}", "answer " + ("x" * 400)
        )

    context = manager.build_session_context(
        "session-1", "question 7", mode="cloud"
    )

    recent_section = context.split("[Recent Conversation]")[1].split("\n\n")[0]
    assert recent_section.count("User:") == 2
    assert "question 7" in recent_section
    assert "question 6" in recent_section
    assert "Past User:" not in context
