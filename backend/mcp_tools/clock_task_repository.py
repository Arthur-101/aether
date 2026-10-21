"""
SQLite persistence for scheduled tasks.
"""

from typing import Any, Dict, List, Optional

from ..db.database import get_db


def insert_task(
    task_id: str,
    session_id: str,
    schedule_value: str,
    prompt: str,
    recurring: bool,
    schedule_type: str = "once",
    start_at_iso: Optional[str] = None,
    end_at_iso: Optional[str] = None,
    kind: str = "task",
) -> None:
    conn = get_db()
    conn.execute(
        """INSERT INTO scheduled_tasks
           (id, session_id, cron_or_iso, prompt_to_execute, is_recurring,
            schedule_type, kind, start_at_iso, end_at_iso, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')""",
        (
            task_id,
            session_id,
            schedule_value,
            prompt,
            int(recurring),
            schedule_type,
            kind,
            start_at_iso,
            end_at_iso,
        ),
    )
    conn.commit()
    conn.close()


def fetch_task(task_id: str) -> Optional[Dict[str, Any]]:
    """Returns a task in any status, including completed/cancelled rows."""
    conn = get_db()
    row = conn.execute(
        """SELECT t.*, COALESCE(s.title, 'Unknown session') AS session_title
           FROM scheduled_tasks t LEFT JOIN sessions s ON s.id = t.session_id
           WHERE t.id = ?""",
        (task_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def fetch_active_task(task_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    row = conn.execute(
        """SELECT t.*, COALESCE(s.title, 'Unknown session') AS session_title
           FROM scheduled_tasks t LEFT JOIN sessions s ON s.id = t.session_id
           WHERE t.id = ? AND t.status = 'active'""",
        (task_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def fetch_visible_task(task_id: str) -> Optional[Dict[str, Any]]:
    """Returns an active or paused task for user/UI management."""
    conn = get_db()
    row = conn.execute(
        """SELECT t.*, COALESCE(s.title, 'Unknown session') AS session_title
           FROM scheduled_tasks t LEFT JOIN sessions s ON s.id = t.session_id
           WHERE t.id = ? AND t.status IN ('active', 'paused')""",
        (task_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def list_active_tasks(session_id: str = "") -> List[Dict[str, Any]]:
    conn = get_db()
    where = "WHERE t.status = 'active'"
    params: tuple = ()
    if session_id:
        where += " AND t.session_id = ?"
        params = (session_id,)
    rows = conn.execute(
        f"""SELECT t.*, COALESCE(s.title, 'Unknown session') AS session_title
            FROM scheduled_tasks t LEFT JOIN sessions s ON s.id = t.session_id
            {where} ORDER BY t.rowid DESC""",
        params,
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def list_visible_tasks(session_id: str = "") -> List[Dict[str, Any]]:
    """Returns active and paused tasks for the manager and MCP list tool."""
    conn = get_db()
    where = "WHERE t.status IN ('active', 'paused')"
    params: tuple = ()
    if session_id:
        where += " AND t.session_id = ?"
        params = (session_id,)
    rows = conn.execute(
        f"""SELECT t.*, COALESCE(s.title, 'Unknown session') AS session_title
            FROM scheduled_tasks t LEFT JOIN sessions s ON s.id = t.session_id
            {where} ORDER BY t.rowid DESC""",
        params,
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def all_active_tasks() -> List[Dict[str, Any]]:
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM scheduled_tasks WHERE status = 'active'"
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def update_task(
    task_id: str,
    schedule_value: str,
    prompt: str,
    recurring: bool,
    schedule_type: str = "once",
    start_at_iso: Optional[str] = None,
    end_at_iso: Optional[str] = None,
) -> None:
    conn = get_db()
    conn.execute(
        """UPDATE scheduled_tasks
           SET cron_or_iso = ?, prompt_to_execute = ?, is_recurring = ?,
               schedule_type = ?, start_at_iso = ?, end_at_iso = ?
           WHERE id = ? AND status = 'active'""",
        (
            schedule_value,
            prompt,
            int(recurring),
            schedule_type,
            start_at_iso,
            end_at_iso,
            task_id,
        ),
    )
    conn.commit()
    conn.close()


def set_status(task_id: str, status: str) -> None:
    conn = get_db()
    conn.execute("UPDATE scheduled_tasks SET status = ? WHERE id = ?", (status, task_id))
    conn.commit()
    conn.close()


def cancel_active_task(task_id: str) -> bool:
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "UPDATE scheduled_tasks SET status = 'cancelled' WHERE id = ? AND status = 'active'",
        (task_id,),
    )
    conn.commit()
    affected = cur.rowcount > 0
    conn.close()
    return affected


def cancel_visible_task(task_id: str) -> bool:
    """Cancels an active or paused task."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "UPDATE scheduled_tasks SET status = 'cancelled' "
        "WHERE id = ? AND status IN ('active', 'paused')",
        (task_id,),
    )
    conn.commit()
    affected = cur.rowcount > 0
    conn.close()
    return affected


def active_ids_for_session(session_id: str) -> List[str]:
    conn = get_db()
    rows = conn.execute(
        "SELECT id FROM scheduled_tasks WHERE session_id = ? AND status = 'active'",
        (session_id,),
    ).fetchall()
    conn.close()
    return [row["id"] for row in rows]


def cancel_session_tasks(session_id: str) -> List[str]:
    ids = active_ids_for_session(session_id)
    if not ids:
        return []
    conn = get_db()
    conn.execute(
        "UPDATE scheduled_tasks SET status = 'cancelled' WHERE session_id = ? AND status = 'active'",
        (session_id,),
    )
    conn.commit()
    conn.close()
    return ids
