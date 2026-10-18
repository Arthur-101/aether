"""
Aether Session & Memory Management
Implements the 1-Turn Buffer + Session-Scoped Vector Memory and 5-word title rules.
Strictly isolates chat turns by session_id and bounds LLM context under 2,500 tokens.
"""

import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from .database import get_db
from ..ai.embedder import embed_text


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

    def switch_session(self, session_id: str) -> Dict[str, Any]:
        """Switches the active session and returns session info + history."""
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        row = cur.fetchone()
        if not row:
            conn.close()
            raise ValueError(f"Session {session_id} does not exist.")

        self.active_session_id = session_id
        self.last_interaction = datetime.now()

        cur.execute(
            """SELECT user_prompt, ai_reply, timestamp 
               FROM chat_memory 
               WHERE session_id = ? 
               ORDER BY id ASC""",
            (session_id,)
        )
        history = [dict(r) for r in cur.fetchall()]
        session_data = dict(row)
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

        return "\n\n".join(context_parts)

    def commit_turn(self, session_id: str, user_prompt: str, ai_reply: str) -> None:
        """Saves current turn to chat_memory + vec_chat_memory and updates 1-turn buffer."""
        conn = get_db()
        cur = conn.cursor()

        combined = f"User: {user_prompt}\nAI: {ai_reply}"
        vec_bytes = embed_text(combined)

        cur.execute("""
            INSERT INTO chat_memory (session_id, user_prompt, ai_reply, combined_text)
            VALUES (?, ?, ?, ?)
        """, (session_id, user_prompt, ai_reply, combined))
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
