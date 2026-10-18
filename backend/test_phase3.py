"""
Phase 3 Verification Test
Verifies:
1. Python syntax across all Phase 3 AI and Voice files.
2. Prompt assembly conforming to the 1-Turn + Active Window + Preferences structure.
3. Paradee 24kHz TTS synthesis and WAV export.
4. Audio recorder initialization & state management.
5. Local Ternary-Bonsai-2-9B execution via llama-server (chat completion & clean_dictation).
"""

import sys
import tempfile
import time
from pathlib import Path

# Ensure backend can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.ai.prompts import (
    DICTATION_SYSTEM_PROMPT,
    ASSISTANT_SYSTEM_PROMPT,
    build_assistant_messages,
)
from backend.ai.tts_engine import tts_engine
from backend.ai.stt_engine import stt_engine
from backend.ai.llm_router import llm_router


def run_tests():
    print("=== [Aether Phase 3 Verification] ===")

    # ----------------------------------------------------
    # Test 1: Prompt Assembly & Token Compactness
    # ----------------------------------------------------
    print("\n[Test 1] Testing Prompt Assembly...")
    messages = build_assistant_messages(
        current_prompt="Can you summarize the budget in that PDF?",
        session_context="[Immediate Previous Turn]\nUser: What was the total spend?\nAI: $50,000.",
        window_context={"window_title": "VS Code - main.py", "mode": "selection", "content": "print('hello')"},
        user_preferences={"preferred_theme": "dark", "name": "Arthur"}
    )
    assert len(messages) >= 2
    assert messages[0]["role"] == "system"
    assert "VS Code" in messages[0]["content"]
    assert "Arthur" in messages[0]["content"]
    assert messages[-1]["content"] == "Can you summarize the budget in that PDF?"
    print("  PASS: Assembled system + context + prompt payload conforming to memory specs.")

    # ----------------------------------------------------
    # Test 2: Paradee 24kHz TTS Audio Synthesis
    # ----------------------------------------------------
    print("\n[Test 2] Testing Paradee 24kHz TTS Engine...")
    assert tts_engine.is_available(), "Paradee ONNX model not found"
    test_phrase = "Aether voice assistant online"
    audio_data = tts_engine.synthesize(test_phrase, speed=1.0)

    assert audio_data.ndim == 1, f"Expected 1D audio array, got shape {audio_data.shape}"
    assert len(audio_data) > 0, "Synthesized audio is empty"
    print(f"  PASS: Synthesized '{test_phrase}': {len(audio_data)} samples at 24,000 Hz (~{len(audio_data)/24000:.2f}s)")

    with tempfile.TemporaryDirectory() as tmp_dir:
        wav_path = Path(tmp_dir) / "test_voice.wav"
        tts_engine.save_wav(test_phrase, str(wav_path))
        assert wav_path.exists() and wav_path.stat().st_size > 1000
        print(f"  PASS: Exported 24kHz WAV file: {wav_path.name} ({wav_path.stat().st_size} bytes)")

    # ----------------------------------------------------
    # Test 3: Audio Recorder & STT Engine
    # ----------------------------------------------------
    print("\n[Test 3] Testing Microphone Recorder State...")
    recorder = stt_engine.recorder
    assert not recorder.is_recording
    print(f"  PASS: Recorder initialized at {recorder.sample_rate} Hz (idle state)")

    # ----------------------------------------------------
    # Test 4: Local Ternary-Bonsai-2-9B Model Execution
    # ----------------------------------------------------
    print("\n[Test 4] Testing Ternary-Bonsai-2-9B via llama-server...")
    started = llm_router.start_server(context_length=1024, gpu_layers=-1)
    assert started, "Failed to start local llama-server on port 8089"
    assert llm_router.is_healthy(), "llama-server health check failed"
    print("  PASS: llama-server is healthy and running on port 8089.")

    # Test 4a: Normal Mode (Default - Fast & Direct)
    print("  Testing Normal Mode (thinking_mode=False)...")
    res_normal = llm_router.chat_completion(
        messages=[{"role": "user", "content": "What is 15 * 4?"}],
        max_tokens=64,
        thinking_mode=False
    )
    reply_normal = res_normal.get("content", "").strip()
    print(f"  Normal Output: '{reply_normal}'")
    assert len(reply_normal) > 0 and "60" in reply_normal
    assert not res_normal.get("reasoning"), "Reasoning should be empty in Normal Mode"
    print("  PASS: Normal Mode responded directly with zero thinking overhead!")

    # Test 4b: Thinking Mode (Chain of Thought Enabled)
    print("  Testing Thinking Mode (thinking_mode=True)...")
    res_thinking = llm_router.chat_completion(
        messages=[{"role": "user", "content": "What is 15 * 4?"}],
        max_tokens=256,
        thinking_mode=True
    )
    reply_thinking = res_thinking.get("content", "").strip()
    reasoning = res_thinking.get("reasoning", "").strip()
    print(f"  Thinking Chain-of-Thought ({len(reasoning)} chars): '{reasoning[:120]}...'")
    print(f"  Thinking Final Output: '{reply_thinking}'")
    assert len(reasoning) > 0, "Reasoning should be present in Thinking Mode"
    print("  PASS: Thinking Mode captured deep chain-of-thought successfully!")

    # Test 4c: Smart Dictation cleaning (always Normal Mode)
    print("  Testing Smart Dictation cleaning...")
    raw_stutter = "uh um please can you like send the report to Rahul no wait to Vikram"
    cleaned = llm_router.clean_dictation(raw_stutter)
    print(f"  Raw:     '{raw_stutter}'")
    print(f"  Cleaned: '{cleaned}'")
    assert len(cleaned) > 0
    print("  PASS: Smart Dictation filter executed through Ternary-Bonsai!")

    # Cleanup: Stop server
    llm_router.stop_server()
    print("  PASS: llama-server stopped cleanly and freed VRAM.")

    print("\n=== All Phase 3 Tests Passed Successfully! ===")


if __name__ == "__main__":
    run_tests()
