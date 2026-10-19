"""
Aether Session Attachment Store
Tracks files attached to the active chat session (inline text, RAG chunks, images)
and removes their vectors when detached.
"""

from typing import Any, Dict, List

from .database import get_db


def upsert_attachment(
    session_id: str,
    file_name: str,
    file_path: str,
    mode: str,
    inline_text: str = "",
    token_count: int = 0,
    chunk_count: int = 0,
) -> None:
    """Replaces any existing attachment for the same file in the session."""
    conn = get_db()
    try:
        conn.execute(
            "DELETE FROM session_attachments WHERE session_id = ? AND file_path = ?",
            (session_id, file_path),
        )
        conn.execute(
            """INSERT INTO session_attachments
               (session_id, file_name, file_path, mode, inline_text, token_count, chunk_count)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (session_id, file_name, file_path, mode, inline_text, token_count, chunk_count),
        )
        conn.commit()
    finally:
        conn.close()


def remove_attachment(session_id: str, file_path: str) -> None:
    """Drops an attachment plus its document chunks and sqlite-vec rows."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM doc_chunks WHERE session_id = ? AND file_path = ?",
            (session_id, file_path),
        )
        chunk_ids = [row["id"] for row in cur.fetchall()]
        for chunk_id in chunk_ids:
            cur.execute("DELETE FROM vec_doc_chunks WHERE chunk_id = ?", (chunk_id,))
        cur.execute(
            "DELETE FROM doc_chunks WHERE session_id = ? AND file_path = ?",
            (session_id, file_path),
        )
        cur.execute(
            "DELETE FROM session_attachments WHERE session_id = ? AND file_path = ?",
            (session_id, file_path),
        )
        conn.commit()
    finally:
        conn.close()


def list_attachments(session_id: str, include_text: bool = False) -> List[Dict[str, Any]]:
    """Returns attachment rows, optionally including the full inline buffer."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM session_attachments WHERE session_id = ? ORDER BY id ASC",
            (session_id,),
        )
        rows = [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()
    if not include_text:
        for row in rows:
            row.pop("inline_text", None)
    return rows
