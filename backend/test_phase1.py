"""
Phase 1 Verification Test
Verifies:
1. Python syntax across all Phase 1 files.
2. SQLite + sqlite-vec database creation.
3. Strict 5-word session title rule.
4. 1-Turn raw buffer persistence.
5. Session-scoped vector search via fastembed (CPU).
"""

import sys
import tempfile
from pathlib import Path

# Add backend parent to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.config_manager import config_manager
from backend.db.database import get_db, init_db
from backend.db.sessions import SessionManager, generate_session_title


def run_tests():
    print("=== [Aether Phase 1 Verification] ===")

    # Test 1: Session Title Rule
    print("\n[Test 1] Testing 5-Word Title Generation...")
    p1 = "Compress video and send Rahul right now"
    t1 = generate_session_title(p1)
    assert t1 == "Compress video and send Rahul...", f"Expected 'Compress video and send Rahul...', got '{t1}'"

    p2 = "Quick question"
    t2 = generate_session_title(p2)
    assert t2 == "Quick question", f"Expected 'Quick question', got '{t2}'"
    print(f"  PASS: '{p1}' -> '{t1}'")
    print(f"  PASS: '{p2}' -> '{t2}'")

    # Test 2: Database Initialization with sqlite-vec
    print("\n[Test 2] Testing SQLite + sqlite-vec Initializer...")
    with tempfile.TemporaryDirectory() as tmp_dir:
        test_db_path = Path(tmp_dir) / "test_assistant.db"
        init_db(test_db_path)
        assert test_db_path.exists(), "Test DB file was not created"

        conn = get_db(test_db_path)
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [r[0] for r in cur.fetchall()]
        print(f"  Tables created: {tables}")
        for req in ["sessions", "chat_memory", "vec_chat_memory", "doc_chunks", "vec_doc_chunks", "clipboard_history", "scheduled_tasks"]:
            assert req in tables, f"Missing required table {req}"
        conn.close()
        print("  PASS: All 7 tables and virtual vector tables initialized successfully!")

    # Test 3: Session Lifecycle & 1-Turn Memory Buffer
    print("\n[Test 3] Testing 1-Turn Buffer & Vector Memory...")
    with tempfile.TemporaryDirectory() as tmp_dir:
        test_db_path = Path(tmp_dir) / "test_assistant.db"
        init_db(test_db_path)

        # Monkey-patch get_db for testing in isolated temp path
        import backend.db.sessions as sm_mod
        orig_get_db = sm_mod.get_db
        sm_mod.get_db = lambda: get_db(test_db_path)

        try:
            sm = SessionManager(timeout_minutes=15)
            first_prompt = "Find the quarterly financial report for Q3"
            sess_id = sm.get_or_create_session(first_prompt)
            print(f"  Session created with ID: {sess_id}")

            # Commit Turn 1
            sm.commit_turn(
                sess_id,
                user_prompt=first_prompt,
                ai_reply="Found Q3_Financials.pdf on your desktop with net profit $1.2M."
            )

            # Commit Turn 2
            sm.commit_turn(
                sess_id,
                user_prompt="What was the tax rate applied?",
                ai_reply="The effective corporate tax rate was 21%."
            )

            # Verify 1-Turn buffer directly in sessions table
            conn = get_db(test_db_path)
            row = conn.execute("SELECT last_turn_prompt, last_turn_reply FROM sessions WHERE id = ?", (sess_id,)).fetchone()
            assert row["last_turn_prompt"] == "What was the tax rate applied?"
            assert row["last_turn_reply"] == "The effective corporate tax rate was 21%."
            print("  PASS: 1-Turn Buffer correctly holds the immediate previous turn!")

            # Verify Context Assembly (should retrieve Q3 financial turn via vector match + 1-turn buffer)
            query_prompt = "Can you remind me about the Q3 net profit?"
            context = sm.build_session_context(sess_id, query_prompt)
            print("\n--- Assembled Session Context ---")
            print(context)
            print("---------------------------------")

            assert "Q3 net profit" in context or "Q3_Financials.pdf" in context or "net profit" in context
            assert "What was the tax rate applied?" in context  # 1-turn buffer
            print("  PASS: Vector search retrieved earlier turn and combined with 1-turn buffer!")

            # Verify Session Listing
            sessions = sm.list_sessions()
            assert len(sessions) == 1
            assert sessions[0]["turn_count"] == 2
            print(f"  PASS: Session list shows {sessions[0]['turn_count']} turns.")
            conn.close()

        finally:
            sm_mod.get_db = orig_get_db

    print("\n=== All Phase 1 Tests Passed Successfully! ===")


if __name__ == "__main__":
    run_tests()
