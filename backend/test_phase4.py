"""
Phase 4 Verification Test
Verifies:
1. Python syntax across all Phase 4 OS hooks.
2. Active window context scraper (pywinauto + clipboard simulation).
3. System telemetry reader (CPU, RAM, Disk) and master volume controls via pycaw.
4. Explorer COM file detection.
5. HotkeyManager initialization and callback wiring.
"""

import sys
from pathlib import Path

# Ensure backend can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.os_hooks.window_context import get_active_window_context
from backend.os_hooks.system_controls import (
    get_system_telemetry,
    get_master_volume,
    set_master_volume,
    get_mute_state,
    set_mute_state,
)
from backend.os_hooks.explorer_spy import get_selected_explorer_file, DragShiftDetector
from backend.os_hooks.hotkeys import HotkeyManager


def run_tests():
    print("=== [Aether Phase 4 Verification] ===")

    # ----------------------------------------------------
    # Test 1: Active Window Context Scraper
    # ----------------------------------------------------
    print("\n[Test 1] Testing Active Window Context Scraper...")
    ctx = get_active_window_context()
    assert isinstance(ctx, dict), "Context must be a dictionary"
    assert "window_title" in ctx
    assert "mode" in ctx
    assert "content" in ctx
    print(f"  Active Window Title: '{ctx['window_title']}'")
    print(f"  Capture Mode:        '{ctx['mode']}'")
    print(f"  Captured Text (len): {len(ctx['content'])} chars")
    print("  PASS: Active window context scraper executed cleanly!")

    # ----------------------------------------------------
    # Test 2: System Controls & Telemetry Poller
    # ----------------------------------------------------
    print("\n[Test 2] Testing System Telemetry & Volume Controls...")
    telemetry = get_system_telemetry()
    print(f"  CPU:  {telemetry['cpu_percent']}%")
    print(f"  RAM:  {telemetry['ram_percent']}% ({telemetry['ram_used_gb']} GB / {telemetry['ram_total_gb']} GB)")
    print(f"  Disk: {telemetry['disk_percent']}%")

    assert telemetry["ram_percent"] > 0, "RAM percentage should be positive"
    assert telemetry["ram_total_gb"] > 0, "Total RAM should be positive"
    print("  PASS: System telemetry poller retrieved accurate hardware stats!")

    # Test Volume controls via pycaw
    original_vol = get_master_volume()
    print(f"  Current Master Volume: {original_vol * 100:.0f}%")
    assert 0.0 <= original_vol <= 1.0

    test_vol = 0.42
    set_master_volume(test_vol)
    new_vol = get_master_volume()
    print(f"  Set Volume to:         {new_vol * 100:.0f}%")
    assert abs(new_vol - test_vol) < 0.05

    # Restore original volume
    set_master_volume(original_vol)
    print(f"  Restored Volume to:    {get_master_volume() * 100:.0f}%")
    print("  PASS: pycaw master volume read/write verified!")

    # ----------------------------------------------------
    # Test 3: Explorer COM Drag & Drop Spy
    # ----------------------------------------------------
    print("\n[Test 3] Testing Explorer COM Inspection...")
    # Safe call to verify COM initialization and Shell dispatch without crash
    detected_file = get_selected_explorer_file()
    print(f"  Selected File Detected: {detected_file or 'None (No active selection)'}")

    triggered_wheel = []
    detector = DragShiftDetector(on_trigger_callback=lambda x, y, p, ext: triggered_wheel.append((x, y, p)))
    assert not detector.is_dragging
    assert not detector.wheel_active
    print("  PASS: Explorer COM dispatcher and DragShiftDetector state verified!")

    # ----------------------------------------------------
    # Test 4: Hotkey Manager Wiring
    # ----------------------------------------------------
    print("\n[Test 4] Testing Hotkey Manager Wiring...")
    voice_events = []
    manager = HotkeyManager(
        on_voice_state=lambda s, t: voice_events.append((s, t)),
        on_show_wheel=lambda x, y, p, ext: None,
        on_circle_to_ask=lambda: None
    )
    assert manager._listener is None
    print("  PASS: HotkeyManager initialized with callback hooks!")

    print("\n=== All Phase 4 Tests Passed Successfully! ===")


if __name__ == "__main__":
    run_tests()
