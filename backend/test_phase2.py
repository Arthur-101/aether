"""
Phase 2 Verification Test
Verifies:
1. Python syntax across all Phase 2 files.
2. Image conversions (PNG, WEBP, PDF), compression, and metadata stripping.
3. PDF document conversion & session-scoped RAG indexing/search.
4. APScheduler tasks and reverse-trigger wake callback.
5. FastMCP server tool schemas & deterministic dispatch.
"""

import sys
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
from PIL import Image
import fitz

# Ensure backend can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.db.database import get_db, init_db
from backend.db.sessions import SessionManager
from backend.mcp_tools.media_tools import (
    convert_image_format,
    compress_media,
    strip_image_metadata,
)
from backend.mcp_tools.doc_tools import (
    convert_document,
    ingest_file_for_rag,
    search_dropped_file,
)
from backend.mcp_tools.clock_scheduler import (
    schedule_one_time_task,
    schedule_recurring_routine,
    list_scheduled_tasks,
    cancel_scheduled_task,
    register_wake_callback,
)
from backend.mcp_tools.server import execute_tool, get_openai_tool_schemas


def run_tests():
    print("=== [Aether Phase 2 Verification] ===")

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp_dir:
        tmp_path = Path(tmp_dir)
        test_db = tmp_path / "test_aether.db"
        init_db(test_db)

        # Patch get_db for testing in isolated DB
        import backend.db.database as db_mod
        import backend.db.sessions as sess_mod
        import backend.mcp_tools.doc_tools as dt_mod
        import backend.mcp_tools.clock_scheduler as cs_mod
        import backend.mcp_tools.clock_task_repository as ctr_mod

        for mod in (sess_mod, dt_mod, cs_mod, ctr_mod):
            mod.get_db = lambda: get_db(test_db)

        # ----------------------------------------------------
        # Test 1: Image Conversion & Media Tools
        # ----------------------------------------------------
        print("\n[Test 1] Testing Deterministic Media Tools...")
        sample_img = tmp_path / "test_sample.jpg"
        img = Image.new("RGB", (200, 200), color=(56, 189, 248))  # Aether Cyan
        img.save(sample_img)

        # Convert to PNG
        png_out = convert_image_format(str(sample_img), "png")
        assert Path(png_out).exists() and png_out.endswith(".png")
        print(f"  PASS: Converted JPG -> PNG: {Path(png_out).name}")

        # Convert to WEBP
        webp_out = convert_image_format(str(sample_img), "webp")
        assert Path(webp_out).exists() and webp_out.endswith(".webp")
        print(f"  PASS: Converted JPG -> WEBP: {Path(webp_out).name}")

        # Strip metadata
        clean_out = strip_image_metadata(str(sample_img))
        assert Path(clean_out).exists()
        print(f"  PASS: Stripped metadata: {Path(clean_out).name}")

        # Compress media
        comp_out = compress_media(str(sample_img), target_mb=1.0)
        assert Path(comp_out).exists()
        print(f"  PASS: Compressed image: {Path(comp_out).name}")

        # ----------------------------------------------------
        # Test 2: Document Conversion & File RAG
        # ----------------------------------------------------
        print("\n[Test 2] Testing Document Conversion & Session RAG...")
        sample_pdf = tmp_path / "q3_budget_report.pdf"
        doc = fitz.open()
        for i in range(6):
            page = doc.new_page()
            page_text = (
                f"Page {i + 1}: Aether Quarterly Financial Analysis Report.\n"
                "The marketing allocation for Q3 2026 is strictly 75000 USD.\n"
                "Key investments include local AI model inference on RTX 4070 laptops.\n"
                "VRAM consumption must remain under 4.5 GB for Ternary-Bonsai.\n"
            ) + ("financial budget analysis numbers " * 60)
            page.insert_textbox(fitz.Rect(50, 50, 500, 700), page_text, fontsize=10)
        doc.save(str(sample_pdf))
        doc.close()

        # Test PDF -> TXT conversion
        txt_out = convert_document(str(sample_pdf), "txt")
        assert Path(txt_out).exists()
        print(f"  PASS: Converted PDF -> TXT: {Path(txt_out).name}")

        # Ingest for RAG
        sess_id = "test-session-42"
        rag_res = ingest_file_for_rag(sess_id, str(sample_pdf))
        assert rag_res["mode"] == "indexed"
        assert rag_res["total_chunks"] > 0
        print(f"  PASS: Ingested file into RAG: {rag_res['total_chunks']} chunks created in sqlite-vec")

        # Semantic Search in Dropped File
        search_res = search_dropped_file(sess_id, "What is the marketing allocation budget?")
        print("\n--- Dropped File RAG Search Result ---")
        print(search_res[:200] + "...")
        print("--------------------------------------")
        assert "75000 USD" in search_res or "marketing allocation" in search_res
        print("  PASS: Semantic search successfully retrieved matching budget chunk!")

        # ----------------------------------------------------
        # Test 3: Clock Scheduler & Reverse Trigger Loop
        # ----------------------------------------------------
        print("\n[Test 3] Testing Clock Scheduler & Reverse Triggers...")
        wake_events = []
        register_wake_callback(
            lambda session_id, system_event, task_id, **_: wake_events.append(
                (session_id, system_event)
            )
        )

        # Schedule task for 2 seconds in future
        target_iso = (datetime.now() + timedelta(seconds=2)).isoformat()
        res_sched = schedule_one_time_task(sess_id, target_iso, "Speak daily news summary")
        print(f"  PASS: {res_sched}")

        tasks = list_scheduled_tasks(sess_id)
        assert len(tasks) >= 1
        print(f"  PASS: Active tasks listed: {len(tasks)}")

        # Wait for trigger
        print("  Waiting 2.5s for reverse-trigger callback...")
        time.sleep(2.5)
        assert len(wake_events) == 1
        assert "daily news summary" in wake_events[0][1]
        print(f"  PASS: Reverse-trigger fired and woke orchestrator: '{wake_events[0][1]}'")

        # ----------------------------------------------------
        # Test 4: FastMCP Tool Registry & Dispatch
        # ----------------------------------------------------
        print("\n[Test 4] Testing FastMCP Server & OpenAI Tool Schemas...")
        schemas = get_openai_tool_schemas()
        assert len(schemas) == 27
        tool_names = [s["function"]["name"] for s in schemas]
        print(f"  Registered LLM Tools: {tool_names}")
        assert "convert_image_format" in tool_names
        assert "search_dropped_file" in tool_names
        assert "schedule_one_time_task" in tool_names

        # Dispatch via execute_tool
        dispatch_res = execute_tool("convert_image_format", {
            "file_path": str(sample_img),
            "target_format": "bmp"
        })
        assert Path(dispatch_res).exists() and dispatch_res.endswith(".bmp")
        print(f"  PASS: Dispatched execute_tool('convert_image_format'): {Path(dispatch_res).name}")

    print("\n=== All Phase 2 Tests Passed Successfully! ===")


if __name__ == "__main__":
    run_tests()
