"""
Aether Database Layer
SQLite connection manager with sqlite-vec extension loading and table initialization.
Stores all sessions, chat embeddings, document chunks, clipboard history, and tasks.
"""

import sqlite3
import sqlite_vec
from pathlib import Path
from typing import Optional
from ..config_manager import get_db_path


def get_db(db_path: Optional[Path] = None) -> sqlite3.Connection:
    """Creates a connection to SQLite and loads the sqlite-vec extension."""
    target_path = db_path or get_db_path()
    target_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(target_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row

    # Enable and load sqlite-vec extension
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)

    return conn


def init_db(db_path: Optional[Path] = None) -> None:
    """Initializes tables and sqlite-vec virtual tables."""
    conn = get_db(db_path)
    cur = conn.cursor()

    # 1. Sessions Table (Includes 1-Turn Raw Buffer)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_turn_prompt TEXT DEFAULT '',
        last_turn_reply TEXT DEFAULT ''
    );
    """)

    # 2. Chat Memory Metadata Table (Joined with Vector Search)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS chat_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        user_prompt TEXT NOT NULL,
        ai_reply TEXT NOT NULL,
        combined_text TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    """)

    # 3. sqlite-vec Virtual Table for Session Chat Memory (384 dimensions)
    cur.execute("""
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_chat_memory USING vec0(
        memory_id INTEGER PRIMARY KEY,
        embedding FLOAT[384]
    );
    """)

    # 4. Dropped Document Chunks Metadata Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS doc_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    """)

    # 5. sqlite-vec Virtual Table for Document Chunks (384 dimensions)
    cur.execute("""
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_doc_chunks USING vec0(
        chunk_id INTEGER PRIMARY KEY,
        embedding FLOAT[384]
    );
    """)

    # 5b. Session-scoped ASK attachments (documents, inline buffers, images)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS session_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        mode TEXT NOT NULL,
        inline_text TEXT DEFAULT '',
        token_count INTEGER DEFAULT 0,
        chunk_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 6. Clipboard History Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS clipboard_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_type TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 7. Scheduled Tasks Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        cron_or_iso TEXT NOT NULL,
        prompt_to_execute TEXT NOT NULL,
        is_recurring INTEGER DEFAULT 0,
        schedule_type TEXT DEFAULT 'once',
        start_at_iso TEXT,
        end_at_iso TEXT,
        status TEXT DEFAULT 'active'
    );
    """)

    # Migrate older task tables to the typed schedule columns.
    cur.execute("PRAGMA table_info(scheduled_tasks)")
    columns = {row["name"] for row in cur.fetchall()}
    migrations = {
        "schedule_type": "TEXT DEFAULT 'once'",
        "start_at_iso": "TEXT",
        "end_at_iso": "TEXT",
    }
    for name, ddl in migrations.items():
        if name not in columns:
            cur.execute(f"ALTER TABLE scheduled_tasks ADD COLUMN {name} {ddl}")
    cur.execute("""
        UPDATE scheduled_tasks
        SET schedule_type = CASE WHEN is_recurring = 1 THEN 'daily' ELSE 'once' END
        WHERE schedule_type IS NULL OR schedule_type = ''
    """)

    conn.commit()
    conn.close()
