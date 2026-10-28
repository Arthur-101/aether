"""Session continuity tests.

A daemon restart used to forget the active session, so the next message opened
a new one while the Island still showed the old turns. These tests pin the
persisted active session and the reset flag the router uses to clear the UI.
"""

from datetime import datetime, timedelta

import pytest

from backend.db import sessions
from backend.db.database import get_db, init_db


@pytest.fixture()
def temp_db(tmp_path, monkeypatch):
    path = tmp_path / "session-continuity.db"
    init_db(path)
    monkeypatch.setattr(sessions, "get_db", lambda: get_db(path))
    return path


def test_active_session_survives_a_restart(temp_db):
    first = sessions.SessionManager(timeout_minutes=15)
    session_id = first.get_or_create_session("which mistral models are STT and TTS")
    first.commit_turn(session_id, "which mistral models are STT and TTS", "Voxtral TTS 3.")

    restarted = sessions.SessionManager(timeout_minutes=15)
    assert restarted.get_or_create_session("what are their names") == session_id
    assert restarted.session_changed is False

    context = restarted.build_session_context(session_id, "what are their names")
    assert "Voxtral TTS 3" in context


def test_expired_session_starts_a_new_one_and_flags_it(temp_db):
    first = sessions.SessionManager(timeout_minutes=15)
    session_id = first.get_or_create_session("first question")

    conn = get_db(temp_db)
    aged = (datetime.now() - timedelta(minutes=16)).isoformat()
    conn.execute(
        "UPDATE app_state SET value = ? WHERE key = ?",
        (aged, sessions.ACTIVE_SESSION_AT_KEY),
    )
    conn.commit()
    conn.close()

    restarted = sessions.SessionManager(timeout_minutes=15)
    new_id = restarted.get_or_create_session("after the timeout")

    assert new_id != session_id
    assert restarted.session_changed is True


def test_switching_sessions_persists_the_new_active_one(temp_db):
    manager = sessions.SessionManager(timeout_minutes=15)
    first_id = manager.get_or_create_session("first")
    second = manager.create_empty_session()
    second_id = second["session"]["id"]

    restarted = sessions.SessionManager(timeout_minutes=15)
    assert restarted.get_or_create_session("continue") == second_id
    assert second_id != first_id


def test_deleting_the_active_session_clears_persisted_state(temp_db):
    manager = sessions.SessionManager(timeout_minutes=15)
    session_id = manager.get_or_create_session("delete me")
    assert manager.delete_session(session_id) is True

    restarted = sessions.SessionManager(timeout_minutes=15)
    replacement = restarted.get_or_create_session("fresh start")

    assert replacement != session_id
    assert restarted.session_changed is True
