"""
Aether Session & Memory Management
Implements the 1-Turn Buffer + Session-Scoped Vector Memory and 5-word title rules.
Strictly isolates chat turns by session_id and bounds LLM context under 2,500 tokens.
"""

import json
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from .database import get_db
from ..ai.embedder import embed_text


def _json_list(value: Any) -> List[Any]:
    """Parses a JSON list column, tolerating old or corrupt values."""
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(value or "[]")
    except (TypeError, ValueError):
        return []
    return parsed if isinstance(parsed, list) else []


def _attachment_metadata(rows: Optional[List[Dict[str, Any]]]) -> List[Dict[str, str]]:
    """Keeps only the label and kind; the file itself is never stored."""
    metadata: List[Dict[str, str]] = []
    for row in rows or []:
        name = str(row.get("file_name") or "").strip()
        if not name:
            continue
        metadata.append({"file_name": name, "mode": str(row.get("mode") or "")})
    return metadata


def _tool_metadata(rows: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Keeps only the tool name and outcome; outputs stay out of history."""
    metadata: List[Dict[str, Any]] = []
    for row in rows or []:
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        ok = row.get("ok")
        if ok is None:
            ok = not str(row.get("output") or "").lstrip().startswith("Error")
        metadata.append({"name": name, "ok": bool(ok)})
    return metadata


def generate_session_title(prompt: str) -> str:
    """Strict Rule: Title is the first 5 words of the initial prompt."""
    words = prompt.strip().split()
    if not words:
        return "New Voice Session"
    title = " ".join(words[:5])
    if len(words) > 5:
        title += "..."
    return title


class SessionManager:
    """Manages active sessions, 15m inactivity timeout, 1-turn buffers, and vector search."""

    def __init__(self, timeout_minutes: int = 15):
        self.active_session_id: Optional[str] = None
        self.last_interaction: datetime = datetime.min
        self.timeout_minutes = timeout_minutes

    def get_or_create_session(self, first_prompt: str) -> str:
        """Returns the active session or creates a new one on timeout/fresh start."""
        now = datetime.now()
        is_expired = (now - self.last_interaction) > timedelta(minutes=self.timeout_minutes)

        if not self.active_session_id or is_expired:
            self.active_session_id = str(uuid.uuid4())
            title = generate_session_title(first_prompt)
            conn = get_db()
            conn.execute(
                "INSERT INTO sessions (id, title) VALUES (?, ?)",
                (self.active_session_id, title)
            )
            conn.commit()
            conn.close()

        self.last_interaction = now
        return self.active_session_id

    def create_empty_session(self) -> Dict[str, Any]:
        """Creates a blank session (used by the Drawer's New Chat button)."""
        now = datetime.now()
        self.active_session_id = str(uuid.uuid4())
        self.last_interaction = now
        conn = get_db()
        conn.execute(
            "INSERT INTO sessions (id, title) VALUES (?, ?)",
            (self.active_session_id, "New Session"),
        )
        conn.commit()
        conn.close()
        return {
            "session": {
                "id": self.active_session_id,
                "title": "New Session",
                "last_turn_prompt": "",
                "last_turn_reply": "",
            },
            "history": [],
        }

    def switch_session(self, session_id: str) -> Dict[str, Any]:
        """Switches the active session and returns session info + history."""
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        row = cur.fetchone()
        if not row:
            conn.close()
            raise ValueError(f"Session {session_id} does not exist.")
        session_data = dict(row)

        self.active_session_id = session_id
        self.last_interaction = datetime.now()

        cur.execute(
            """SELECT user_prompt, ai_reply, timestamp, attachments, tools_used
               FROM chat_memory 
               WHERE session_id = ? 
               ORDER BY id ASC""",
            (session_id,)
        )
        history = []
        for memory_row in cur.fetchall():
            turn = dict(memory_row)
            turn["attachments"] = _json_list(turn.get("attachments"))
            turn["tools_used"] = _json_list(turn.get("tools_used"))
            history.append(turn)
        conn.close()
        return {"session": session_data, "history": history}

    def list_sessions(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Returns all sessions ordered by updated_at DESC for SessionDrawer."""
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT s.*, COUNT(cm.id) as turn_count
            FROM sessions s
            LEFT JOIN chat_memory cm ON cm.session_id = s.id
            GROUP BY s.id
            ORDER BY s.updated_at DESC
            LIMIT ?
        """, (limit,))
        sessions = [dict(r) for r in cur.fetchall()]
        conn.close()
        return sessions

    def build_session_context(self, session_id: str, current_prompt: str) -> str:
        """
        Builds compact context:
        1. Top 2 past semantic turns in THIS session (distance < 0.80, roughly cosine sim > 0.65).
        2. Immediate previous 1-turn raw buffer.
        """
        conn = get_db()
        cur = conn.cursor()

        # Fetch 1-turn buffer
        cur.execute("SELECT last_turn_prompt, last_turn_reply FROM sessions WHERE id = ?", (session_id,))
        session_row = cur.fetchone()
        last_prompt = session_row["last_turn_prompt"] if session_row else ""
        last_reply = session_row["last_turn_reply"] if session_row else ""

        # Session-scoped vector search
        q_vec = embed_text(current_prompt)
        cur.execute("""
            SELECT cm.user_prompt, cm.ai_reply, v.distance
            FROM vec_chat_memory v
            JOIN chat_memory cm ON cm.id = v.memory_id
            WHERE cm.session_id = ?
              AND v.embedding MATCH ?
              AND k = 4
            ORDER BY v.distance ASC
        """, (session_id, q_vec))

        relevant_blocks = []
        for r in cur.fetchall():
            # Filter matches: distance < 0.80 and avoid duplicating the 1-turn buffer
            if r["distance"] < 0.80 and r["user_prompt"] != last_prompt:
                relevant_blocks.append(f"Past User: {r['user_prompt']}\nPast AI: {r['ai_reply']}")

        conn.close()

        context_parts = []
        if relevant_blocks:
            context_parts.append("[Relevant Earlier Context in This Session]\n" + "\n---\n".join(relevant_blocks[:2]))
        if last_prompt and last_reply:
            context_parts.append(f"[Immediate Previous Turn]\nUser: {last_prompt}\nAI: {last_reply}")

        try:
            from ..mcp_tools.attachment_tools import build_attachment_context

            attachment_context = build_attachment_context(session_id, current_prompt)
            if attachment_context:
                context_parts.append(attachment_context)
        except Exception:
            pass

        return "\n\n".join(context_parts)

    def delete_session(self, session_id: str) -> bool:
        """Deletes a session and all of its vectors, attachments, and tasks."""
        conn = get_db()
        try:
            cur = conn.cursor()
            cur.execute("SELECT id FROM chat_memory WHERE session_id = ?", (session_id,))
            for row in cur.fetchall():
                cur.execute("DELETE FROM vec_chat_memory WHERE memory_id = ?", (row["id"],))
            cur.execute("SELECT id FROM doc_chunks WHERE session_id = ?", (session_id,))
            for row in cur.fetchall():
                cur.execute("DELETE FROM vec_doc_chunks WHERE chunk_id = ?", (row["id"],))
            for table in (
                "chat_memory",
                "doc_chunks",
                "session_attachments",
                "scheduled_tasks",
            ):
                cur.execute(f"DELETE FROM {table} WHERE session_id = ?", (session_id,))
            cur.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            deleted = cur.rowcount > 0
            conn.commit()
        finally:
            conn.close()
        if self.active_session_id == session_id:
            self.active_session_id = None
            self.last_interaction = datetime.min
        return deleted

    def commit_turn(
        self,
        session_id: str,
        user_prompt: str,
        ai_reply: str,
        attachments: Optional[List[Dict[str, Any]]] = None,
        tools_used: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        """Saves current turn to chat_memory + vec_chat_memory and updates 1-turn buffer.

        `attachments` and `tools_used` are display metadata only: attachment
        labels/kinds and tool names/outcomes. File contents and tool outputs are
        deliberately excluded so history stays small and safe.
        """
        conn = get_db()
        cur = conn.cursor()

        combined = f"User: {user_prompt}\nAI: {ai_reply}"
        vec_bytes = embed_text(combined)

        cur.execute("""
            INSERT INTO chat_memory
                (session_id, user_prompt, ai_reply, combined_text, attachments, tools_used)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            session_id,
            user_prompt,
            ai_reply,
            combined,
            json.dumps(_attachment_metadata(attachments), ensure_ascii=False),
            json.dumps(_tool_metadata(tools_used), ensure_ascii=False),
        ))
        memory_id = cur.lastrowid

        cur.execute("""
            INSERT INTO vec_chat_memory (memory_id, embedding)
            VALUES (?, ?)
        """, (memory_id, vec_bytes))

        cur.execute("""
            UPDATE sessions
            SET last_turn_prompt = ?, last_turn_reply = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (user_prompt, ai_reply, session_id))

        conn.commit()
        conn.close()


# Global singleton instance
session_manager = SessionManager()
