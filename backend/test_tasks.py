"""Scheduled task CRUD, validation, and session-binding tests."""

import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.ai.llm_router import llm_router
from backend.db.database import get_db, init_db
from backend.mcp_tools import clock_task_repository as repo
from backend.mcp_tools.clock_scheduler import (
    ALARM_SESSION_ID,
    cancel_scheduled_task,
    cancel_tasks_for_session,
    complete_scheduled_task,
    create_custom_task,
    create_daily_task,
    create_one_time_task,
    list_scheduled_tasks,
    pause_scheduled_task,
    restore_scheduled_tasks,
    resume_scheduled_task,
    schedule_alarm,
    scheduler,
    update_scheduled_task,
)


@pytest.fixture()
def task_db(tmp_path, monkeypatch):
    db_path = tmp_path / "tasks.db"
    init_db(db_path)
    conn = get_db(db_path)
    conn.execute("INSERT INTO sessions (id, title) VALUES (?, ?)", ("session-1", "Test chat"))
    conn.commit()
    conn.close()
    monkeypatch.setattr(repo, "get_db", lambda: get_db(db_path))
    return db_path


def _future_iso(hours: int = 1) -> str:
    return (datetime.now() + timedelta(hours=hours)).isoformat()


def test_create_update_list_and_cancel(task_db):
    task = create_one_time_task("session-1", _future_iso(), "Drink water")
    try:
        assert task["session_title"] == "Test chat"
        assert task["is_recurring"] is False
        assert scheduler.get_job(task["id"]) is not None

        listed = list_scheduled_tasks()
        assert any(item["id"] == task["id"] for item in listed)

        updated = update_scheduled_task(
            task["id"], task_prompt="Drink tea", is_recurring=True, hour=9, minute=30
        )
        assert updated["prompt_to_execute"] == "Drink tea"
        assert updated["is_recurring"] is True
        assert updated["hour"] == 9 and updated["minute"] == 30
    finally:
        cancel_scheduled_task(task["id"])

    assert scheduler.get_job(task["id"]) is None
    assert all(item["id"] != task["id"] for item in list_scheduled_tasks())


def test_alarm_kind_round_trip(task_db):
    task = create_one_time_task(
        "session-1", _future_iso(), "Wake up", kind="alarm"
    )
    try:
        assert task["kind"] == "alarm"
        assert any(
            item["id"] == task["id"] and item["kind"] == "alarm"
            for item in list_scheduled_tasks()
        )
    finally:
        cancel_scheduled_task(task["id"])


def test_past_time_is_rejected(task_db):
    with pytest.raises(ValueError, match="in the past"):
        create_one_time_task("session-1", "2024-11-19T22:00:00", "Too late")


def test_restore_rehydrates_future_task(task_db):
    task = create_one_time_task("session-1", _future_iso(), "Restore me")
    scheduler.remove_job(task["id"])
    try:
        result = restore_scheduled_tasks()
        assert result["restored"] >= 1
        assert scheduler.get_job(task["id"]) is not None
    finally:
        cancel_scheduled_task(task["id"])


def test_daily_task_and_session_cleanup(task_db):
    conn = get_db(task_db)
    conn.execute(
        "INSERT INTO sessions (id, title) VALUES (?, ?)", ("session-2", "Delete me")
    )
    conn.commit()
    conn.close()
    task = create_daily_task("session-2", 7, 5, "Daily standup")
    try:
        assert task["is_recurring"] is True
        assert task["hour"] == 7 and task["minute"] == 5
        assert scheduler.get_job(task["id"]) is not None
    finally:
        cancelled = cancel_tasks_for_session("session-2")

    assert task["id"] in cancelled
    assert scheduler.get_job(task["id"]) is None
    assert list_scheduled_tasks("session-2") == []


def test_custom_range_create_update_and_restore(task_db):
    start = datetime.now() + timedelta(hours=1)
    end = start + timedelta(days=2)
    task = create_custom_task(
        "session-1", start.isoformat(), end.isoformat(), "Range routine"
    )
    try:
        assert task["schedule_type"] == "custom"
        assert task["hour"] == start.hour and task["minute"] == start.minute
        assert task["start_at_iso"] == start.isoformat(timespec="seconds")
        assert scheduler.get_job(task["id"]) is not None

        scheduler.remove_job(task["id"])
        restored = restore_scheduled_tasks()
        assert restored["restored"] >= 1
        assert scheduler.get_job(task["id"]) is not None

        new_end = end + timedelta(days=1)
        updated = update_scheduled_task(
            task["id"],
            task_prompt="Range edited",
            schedule_type="custom",
            start_at_iso=start.isoformat(),
            end_at_iso=new_end.isoformat(),
        )
        assert updated["prompt_to_execute"] == "Range edited"
        assert updated["end_at_iso"] == new_end.isoformat(timespec="seconds")
        assert scheduler.get_job(task["id"]) is not None
    finally:
        cancel_scheduled_task(task["id"])


def test_finished_custom_range_expires(task_db):
    start = datetime.now() + timedelta(hours=1)
    end = start + timedelta(days=1)
    task = create_custom_task(
        "session-1", start.isoformat(), end.isoformat(), "Expire me"
    )
    conn = get_db(task_db)
    past = (datetime.now() - timedelta(minutes=1)).isoformat(timespec="seconds")
    conn.execute(
        "UPDATE scheduled_tasks SET end_at_iso = ? WHERE id = ?", (past, task["id"])
    )
    conn.commit()
    conn.close()

    assert all(item["id"] != task["id"] for item in list_scheduled_tasks())
    assert scheduler.get_job(task["id"]) is None
    conn = get_db(task_db)
    row = conn.execute(
        "SELECT status FROM scheduled_tasks WHERE id = ?", (task["id"],)
    ).fetchone()
    conn.close()
    assert row["status"] == "completed"


def test_scheduler_forces_real_session_id():
    with patch("backend.ai.llm_router.execute_tool", return_value="ok") as execute:
        llm_router._execute_tool(
            "schedule_one_time_task",
            '{"session_id":"current_session","run_at_iso":"2030-01-01T10:00:00"}',
            "real-session",
        )
    assert execute.call_args.args[1]["session_id"] == "real-session"


def test_pause_and_resume_recurring_task(task_db):
    task = create_daily_task("session-1", 8, 15, "Morning review")
    try:
        paused = pause_scheduled_task(task["id"])
        assert paused["status"] == "paused"
        assert scheduler.get_job(task["id"]) is None
        visible = list_scheduled_tasks("session-1")
        assert any(item["id"] == task["id"] and item["status"] == "paused" for item in visible)

        resumed = resume_scheduled_task(task["id"])
        assert resumed["status"] == "active"
        assert scheduler.get_job(task["id"]) is not None
    finally:
        cancel_scheduled_task(task["id"])


def test_complete_one_time_task_removes_it_from_manager(task_db):
    task = create_one_time_task("session-1", _future_iso(), "Finish report")
    completed = complete_scheduled_task(task["id"])
    assert completed["status"] == "completed"
    assert scheduler.get_job(task["id"]) is None
    assert all(item["id"] != task["id"] for item in list_scheduled_tasks())


def test_alarm_tool_uses_internal_alarm_session(task_db):
    message = schedule_alarm(run_at_iso=_future_iso(), task_prompt="Wake up")
    assert "Set alarm" in message
    alarms = [item for item in list_scheduled_tasks() if item["kind"] == "alarm"]
    assert len(alarms) == 1
    assert alarms[0]["session_id"] == ALARM_SESSION_ID
    cancel_scheduled_task(alarms[0]["id"])
