"""
Aether Session & Memory Management
Implements user-configurable, provider-aware recent-turn buffers + session-scoped
vector memory and the 5-word title rule. Local GGUF/Ollama default to 2 recent
turns + 3 matches; cloud APIs default to 8 + 8. Each category keeps its own
Settings values, so cloud depth never increases local context or VRAM use.
"""

import json
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from .database import get_db
from ..ai.embedder import embed_text
from ..config_manager import config_manager


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


def _tool_names(tools_used: Any) -> str:
    """Deduped, order-preserving tool names for memory blocks and embeddings.

    Only names are surfaced; arguments and outputs are never stored anywhere.
    """
    names: List[str] = []
    for row in _json_list(tools_used):
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or "").strip()
        if name and name not in names:
            names.append(name)
    return ", ".join(names)


# Memory depth is user-tunable in Settings, per backend category. Local GGUF
# and Ollama share one pair; cloud APIs have their own, deeper pair. The context
# length stays a local/Ollama launch option; cloud providers own their windows.
MEMORY_DEFAULTS: Dict[str, Dict[str, int]] = {
    "local": {"recent_turns": 2, "semantic_matches": 3},
    "cloud": {"recent_turns": 8, "semantic_matches": 8},
}
MEMORY_LIMITS: Dict[str, tuple[int, int]] = {
    "recent_turns": (1, 12),
    "semantic_matches": (0, 12),
}
MEMORY_TOKEN_PER_BLOCK = 320
MEMORY_BASE_TOKENS = 400
MEMORY_BLOCK_CHAR_LIMIT = 1200
SEMANTIC_DISTANCE_LIMIT = 0.80
ACTIVE_SESSION_KEY = "active_session_id"
ACTIVE_SESSION_AT_KEY = "active_session_at"

REASONING_ONLY_REPLY = (
    "The model returned only reasoning, not an answer. Please try again."
)
EMPTY_REPLY = "The model returned an empty response. Please try again."
FALLBACK_REPLIES = frozenset({
    "i could not produce a response.",
    "i reached the maximum number of tool steps for this request.",
    REASONING_ONLY_REPLY.lower(),
    EMPTY_REPLY.lower(),
})

_REASONING_PREFIXES = (
    "the user said",
    "the user wants",
    "the user is asking",
    "the user asked",
    "the user is requesting",
    "the user's message",
    "let me think",
    "let me analyze",
    "okay, let's",
)
_REASONING_MARKERS = (
    "the user wants me to",
    "let me think",
    "let me analyze",
    "i need to respond to the user",
)


def _clamp_memory_count(value: Any, key: str, fallback: int) -> int:
    minimum, maximum = MEMORY_LIMITS[key]
    try:
        count = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(minimum, min(maximum, count))


def memory_profile(mode: Optional[str] = None) -> Dict[str, Any]:
    """Returns the configured recent/semantic depth and a derived token budget.

    Local GGUF and Ollama share the `local` pair; cloud APIs use the `cloud`
    pair. Settings owns the values, so changing the backend never silently
    inherits the other category's depth.
    """
    if mode is None:
        mode = str(
            config_manager.get("ai_provider", "mode", "local_gguf") or "local_gguf"
        )
    category = "cloud" if mode.strip().lower() == "cloud" else "local"
    defaults = MEMORY_DEFAULTS[category]
    recent_turns = _clamp_memory_count(
        config_manager.get(
            "ai_provider",
            f"memory_{category}_recent_turns",
            defaults["recent_turns"],
        ),
        "recent_turns",
        defaults["recent_turns"],
    )
    semantic_matches = _clamp_memory_count(
        config_manager.get(
            "ai_provider",
            f"memory_{category}_semantic_matches",
            defaults["semantic_matches"],
        ),
        "semantic_matches",
        defaults["semantic_matches"],
    )
    return {
        "category": category,
        "recent_turns": recent_turns,
        "semantic_matches": semantic_matches,
        "token_budget": (
            MEMORY_BASE_TOKENS
            + (recent_turns + semantic_matches) * MEMORY_TOKEN_PER_BLOCK
        ),
        "block_chars": MEMORY_BLOCK_CHAR_LIMIT,
    }


def is_fallback_reply(text: str) -> bool:
    """True for empty replies and the canned strings Aether uses on failure."""
    normalized = " ".join(str(text or "").split()).lower()
    return not normalized or normalized in FALLBACK_REPLIES


def looks_like_reasoning(text: str) -> bool:
    """Conservative detector for a provider leaking its analysis trace.

    Kept deliberately narrow: only long replies that open with a reasoning
    phrase (or contain a strong marker) are rejected, so normal prose such as
    "Let me send the report tomorrow." is never treated as a leak.
    """
    value = str(text or "").strip()
    if len(value) < 120:
        return False
    lowered = value.lower()
    if any(lowered.startswith(prefix) for prefix in _REASONING_PREFIXES):
        return True
    return any(marker in lowered for marker in _REASONING_MARKERS)


def _approx_tokens(text: str) -> int:
    """Fast, provider-independent token estimate used for memory budgets."""
    return max(1, (len(text) + 3) // 4)


def _clip_memory_text(text: Any, limit: int) -> str:
    """Caps one memory block so the configured turn count always fits."""
    value = str(text or "").strip()
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip() + "…"


def _failed_only_tools(tools_used: Any) -> bool:
    """True when every recorded tool call in a turn failed."""
    rows = _json_list(tools_used)
    if not rows:
        return False
    outcomes: List[bool] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        ok = row.get("ok")
        if ok is None:
            ok = not str(row.get("output") or "").lstrip().startswith("Error")
        outcomes.append(bool(ok))
    return bool(outcomes) and not any(outcomes)


def _is_bad_memory_turn(
    user_prompt: Any, ai_reply: Any, tools_used: Any = None
) -> bool:
    """Rejects turns that would poison retrieval or the recent-turn buffer."""
    if not str(user_prompt or "").strip():
        return True
    reply = str(ai_reply or "").strip()
    if is_fallback_reply(reply) or looks_like_reasoning(reply):
        return True
    return _failed_only_tools(tools_used)


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
        self._state_loaded = False
        # Set by get_or_create_session when the active session was replaced
        # (fresh start or timeout) so the router can reset the visible chat.
        self.session_changed = False

    def _load_state(self) -> None:
        """Restores the active session after a daemon restart.

        Without this, the first message after any restart silently opened a new
        session while the Island still displayed the previous chat, so the model
        lost the turn the user was looking at. A session older than the
        configured timeout still expires normally on the next message.
        """
        if self._state_loaded:
            return
        self._state_loaded = True
        try:
            conn = get_db()
            rows = conn.execute(
                "SELECT key, value FROM app_state WHERE key IN (?, ?)",
                (ACTIVE_SESSION_KEY, ACTIVE_SESSION_AT_KEY),
            ).fetchall()
            state = {row["key"]: row["value"] for row in rows}
            session_id = str(state.get(ACTIVE_SESSION_KEY) or "").strip()
            exists = False
            if session_id:
                exists = conn.execute(
                    "SELECT 1 FROM sessions WHERE id = ?", (session_id,)
                ).fetchone() is not None
            conn.close()
        except Exception:
            return

        if not session_id or not exists:
            return
        self.active_session_id = session_id
        stamp = str(state.get(ACTIVE_SESSION_AT_KEY) or "").strip()
        if stamp:
            try:
                self.last_interaction = datetime.fromisoformat(stamp)
            except ValueError:
                self.last_interaction = datetime.min

    def _persist_state(self) -> None:
        """Writes the active session id and last interaction for restart recovery."""
        if not self.active_session_id:
            return
        stamp = self.last_interaction
        if stamp == datetime.min:
            stamp = datetime.now()
        try:
            conn = get_db()
            for key, value in (
                (ACTIVE_SESSION_KEY, self.active_session_id),
                (ACTIVE_SESSION_AT_KEY, stamp.isoformat()),
            ):
                conn.execute(
                    "INSERT INTO app_state (key, value) VALUES (?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (key, value),
                )
            conn.commit()
            conn.close()
        except Exception:
            # Losing continuity is recoverable; never fail a chat turn over it.
            pass

    def get_or_create_session(self, first_prompt: str) -> str:
        """Returns the active session or creates a new one on timeout/fresh start."""
        self._load_state()
        self.session_changed = False
        now = datetime.now()
        is_expired = (now - self.last_interaction) > timedelta(minutes=self.timeout_minutes)

        if not self.active_session_id or is_expired:
            self.active_session_id = str(uuid.uuid4())
            self.session_changed = True
            title = generate_session_title(first_prompt)
            conn = get_db()
            conn.execute(
                "INSERT INTO sessions (id, title) VALUES (?, ?)",
                (self.active_session_id, title)
            )
            conn.commit()
            conn.close()

        self.last_interaction = now
        self._persist_state()
        return self.active_session_id

    def create_empty_session(self) -> Dict[str, Any]:
        """Creates a blank session (used by the Drawer's New Chat button)."""
        now = datetime.now()
        self.active_session_id = str(uuid.uuid4())
        self.last_interaction = now
        self._state_loaded = True
        self.session_changed = False
        conn = get_db()
        conn.execute(
            "INSERT INTO sessions (id, title) VALUES (?, ?)",
            (self.active_session_id, "New Session"),
        )
        conn.commit()
        conn.close()
        self._persist_state()
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
        self._state_loaded = True
        self.session_changed = False

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
        self._persist_state()
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

    def build_session_context(
        self, session_id: str, current_prompt: str, mode: Optional[str] = None
    ) -> str:
        """
        Builds a token-budgeted memory block for the active backend:

        - local_gguf / ollama: configured local pair (default 2 recent + 3 matches)
        - cloud: configured cloud pair (default 8 recent + 8 matches)

        Both pairs are editable in Settings. Each block is clipped so the chosen
        turn counts fit; `context_length` is never used as a memory budget.
        Bad turns (empty/fallback/reasoning-only/failed-only) are skipped so a
        provider failure cannot be retrieved as if it were useful history.
        """
        profile = memory_profile(mode)
        recent_limit = max(1, int(profile["recent_turns"]))
        semantic_limit = max(0, int(profile["semantic_matches"]))
        token_budget = max(256, int(profile["token_budget"]))
        block_chars = max(200, int(profile["block_chars"]))

        conn = get_db()
        cur = conn.cursor()

        # Fallback buffer for legacy sessions whose chat_memory row is missing.
        cur.execute(
            "SELECT last_turn_prompt, last_turn_reply FROM sessions WHERE id = ?",
            (session_id,),
        )
        session_row = cur.fetchone()
        last_prompt = session_row["last_turn_prompt"] if session_row else ""
        last_reply = session_row["last_turn_reply"] if session_row else ""

        # Fetch extra rows so filtered/bad turns do not shrink the recent window.
        fetch_limit = max(recent_limit * 4, recent_limit + 8)
        cur.execute(
            """
            SELECT id, user_prompt, ai_reply, tools_used
            FROM chat_memory
            WHERE session_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (session_id, fetch_limit),
        )
        recent_rows: List[Dict[str, Any]] = []
        recent_ids = set()
        recent_prompts = set()
        for row in cur.fetchall():
            if _is_bad_memory_turn(
                row["user_prompt"], row["ai_reply"], row["tools_used"]
            ):
                continue
            recent_rows.append(dict(row))
            recent_ids.add(row["id"])
            recent_prompts.add(row["user_prompt"])
            if len(recent_rows) >= recent_limit:
                break

        if (
            not recent_rows
            and last_prompt
            and last_reply
            and not _is_bad_memory_turn(last_prompt, last_reply)
        ):
            recent_rows = [
                {"id": None, "user_prompt": last_prompt, "ai_reply": last_reply}
            ]

        semantic_rows: List[Dict[str, Any]] = []
        if semantic_limit:
            q_vec = embed_text(current_prompt)
            # `k` is an integer from the profile, never user text.
            k = max(8, semantic_limit + len(recent_rows) + 2)
            cur.execute(
                f"""
                SELECT cm.id, cm.user_prompt, cm.ai_reply, cm.tools_used, v.distance
                FROM vec_chat_memory v
                JOIN chat_memory cm ON cm.id = v.memory_id
                WHERE cm.session_id = ?
                  AND v.embedding MATCH ?
                  AND k = {k}
                ORDER BY v.distance ASC
                """,
                (session_id, q_vec),
            )
            for row in cur.fetchall():
                if row["distance"] >= SEMANTIC_DISTANCE_LIMIT:
                    continue
                if row["id"] in recent_ids:
                    continue
                if row["user_prompt"] in recent_prompts:
                    continue
                if _is_bad_memory_turn(
                    row["user_prompt"], row["ai_reply"], row["tools_used"]
                ):
                    continue
                semantic_rows.append(dict(row))
                if len(semantic_rows) >= semantic_limit:
                    break

        conn.close()

        # Spend the budget on recent turns first (newest kept), then semantic.
        recent_blocks: List[str] = []
        used = 0
        for row in recent_rows:  # newest first
            block_text = f"User: {row['user_prompt']}\nAI: {row['ai_reply']}"
            tool_line = _tool_names(row.get("tools_used"))
            if tool_line:
                block_text += f"\nTools: {tool_line}"
            block = _clip_memory_text(block_text, block_chars)
            cost = _approx_tokens(block) + 2
            if recent_blocks and used + cost > token_budget:
                break
            recent_blocks.append(block)
            used += cost
        recent_blocks.reverse()

        semantic_blocks: List[str] = []
        remaining = max(0, token_budget - used)
        for row in semantic_rows:
            block_text = (
                f"Past User: {row['user_prompt']}\nPast AI: {row['ai_reply']}"
            )
            tool_line = _tool_names(row.get("tools_used"))
            if tool_line:
                block_text += f"\nTools: {tool_line}"
            block = _clip_memory_text(block_text, block_chars)
            cost = _approx_tokens(block) + 2
            if cost > remaining:
                break
            semantic_blocks.append(block)
            remaining -= cost

        context_parts: List[str] = []
        if semantic_blocks:
            context_parts.append(
                "[Relevant Earlier Context in This Session]\n"
                + "\n---\n".join(semantic_blocks)
            )
        if recent_blocks:
            if len(recent_blocks) == 1:
                context_parts.append(
                    f"[Immediate Previous Turn]\n{recent_blocks[0]}"
                )
            else:
                context_parts.append(
                    "[Recent Conversation]\n" + "\n---\n".join(recent_blocks)
                )

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
            if self.active_session_id == session_id:
                cur.execute(
                    "DELETE FROM app_state WHERE key IN (?, ?)",
                    (ACTIVE_SESSION_KEY, ACTIVE_SESSION_AT_KEY),
                )
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
    ) -> bool:
        """Saves current turn to chat_memory + vec_chat_memory and updates 1-turn buffer.

        `attachments` and `tools_used` are display metadata only: attachment
        labels/kinds and tool names/outcomes. File contents and tool outputs are
        deliberately excluded so history stays small and safe.

        Empty, fallback, and reasoning-only replies are not persisted at all;
        the session timestamp is still refreshed so the drawer keeps its order.
        Returns True when the turn was written.
        """
        prompt = str(user_prompt or "").strip()
        reply = str(ai_reply or "").strip()
        conn = get_db()
        cur = conn.cursor()

        if not prompt or is_fallback_reply(reply) or looks_like_reasoning(reply):
            cur.execute(
                "UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (session_id,),
            )
            conn.commit()
            conn.close()
            return False

        tool_names = _tool_names(tools_used)
        combined = f"User: {prompt}\nAI: {reply}"
        if tool_names:
            combined += f"\nTools: {tool_names}"
        vec_bytes = embed_text(combined)

        cur.execute("""
            INSERT INTO chat_memory
                (session_id, user_prompt, ai_reply, combined_text, attachments, tools_used)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            session_id,
            prompt,
            reply,
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
        """, (prompt, reply, session_id))

        conn.commit()
        conn.close()
        return True


# Global singleton instance
session_manager = SessionManager()
