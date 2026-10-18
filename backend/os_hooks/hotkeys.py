"""
Aether Global Hotkey Manager
Monitors the three system hotkey modes using pynput:
1. Ctrl + Win (Hold): Smart Dictation (clean text injected at cursor via Ctrl+V).
2. Ctrl + Shift (Hold): Circle to Ask (triggers screen canvas + voice recording).
3. Alt + Space (Hold): Voice Assistant (active window context + LLM + Paradee TTS).
"""

import threading
from typing import Any, Callable, Optional
import keyboard as kb
from pynput import keyboard
import pyperclip
from ..ai.llm_router import llm_router
from ..ai.stt_engine import stt_engine
from ..ai.tts_engine import tts_engine
from .explorer_spy import DragShiftDetector
from .window_context import get_active_window_context


class HotkeyManager:
    """Manages global hotkey listeners and dispatches to AI/Voice/Overlay pipelines."""

    def __init__(
        self,
        on_voice_state: Optional[Callable[[str, str], None]] = None,
        on_show_wheel: Optional[Callable[[int, int, str, str], None]] = None,
        on_circle_to_ask: Optional[Callable[[], None]] = None,
    ):
        self.on_voice_state = on_voice_state or (lambda state, text: None)
        self.on_show_wheel = on_show_wheel or (lambda x, y, path, ext: None)
        self.on_circle_to_ask = on_circle_to_ask or (lambda: None)

        self._ctrl_down = False
        self._cmd_down = False
        self._alt_down = False
        self._space_down = False

        self._dictation_active = False
        self._assistant_active = False

        self._listener: Optional[keyboard.Listener] = None
        self.drag_detector = DragShiftDetector(on_trigger_callback=self._handle_wheel_trigger)

    def _handle_wheel_trigger(self, x: int, y: int, file_path: str, ext: str) -> None:
        self.on_show_wheel(x, y, file_path, ext)

    def _on_key_press(self, key: Any) -> None:
        if key in (keyboard.Key.ctrl, keyboard.Key.ctrl_l, keyboard.Key.ctrl_r):
            self._ctrl_down = True
        elif key in (keyboard.Key.cmd, keyboard.Key.cmd_l, keyboard.Key.cmd_r):
            self._cmd_down = True
        elif key in (keyboard.Key.alt, keyboard.Key.alt_l, keyboard.Key.alt_r):
            self._alt_down = True
        elif key == keyboard.Key.space:
            self._space_down = True

        # Mode 1: Ctrl + Win (Hold) -> Start Smart Dictation
        if self._ctrl_down and self._cmd_down and not self._dictation_active:
            self._dictation_active = True
            stt_engine.recorder.start_recording()
            self.on_voice_state("listening", "Listening for dictation...")

        # Mode 3: Alt + Space (Hold) -> Start Voice Assistant
        if self._alt_down and self._space_down and not self._assistant_active:
            self._assistant_active = True
            stt_engine.recorder.start_recording()
            self.on_voice_state("listening", "Listening for question...")

    def _on_key_release(self, key: Any) -> None:
        # Check Dictation Release (Ctrl or Win released)
        if self._dictation_active and (
            key in (keyboard.Key.ctrl, keyboard.Key.ctrl_l, keyboard.Key.ctrl_r)
            or key in (keyboard.Key.cmd, keyboard.Key.cmd_l, keyboard.Key.cmd_r)
        ):
            self._dictation_active = False
            threading.Thread(target=self._process_dictation_release, daemon=True).start()

        # Check Assistant Release (Alt or Space released)
        if self._assistant_active and (
            key in (keyboard.Key.alt, keyboard.Key.alt_l, keyboard.Key.alt_r)
            or key == keyboard.Key.space
        ):
            self._assistant_active = False
            threading.Thread(target=self._process_assistant_release, daemon=True).start()

        if key in (keyboard.Key.ctrl, keyboard.Key.ctrl_l, keyboard.Key.ctrl_r):
            self._ctrl_down = False
        elif key in (keyboard.Key.cmd, keyboard.Key.cmd_l, keyboard.Key.cmd_r):
            self._cmd_down = False
        elif key in (keyboard.Key.alt, keyboard.Key.alt_l, keyboard.Key.alt_r):
            self._alt_down = False
        elif key == keyboard.Key.space:
            self._space_down = False

    def _process_dictation_release(self) -> None:
        """Processes recorded audio through STT, cleans via LLM, and injects at cursor."""
        self.on_voice_state("thinking", "Cleaning dictation...")
        audio = stt_engine.recorder.stop_recording()
        raw_text = stt_engine.transcribe(audio)

        if raw_text:
            cleaned = llm_router.clean_dictation(raw_text)
            if cleaned:
                pyperclip.copy(cleaned)
                kb.send("ctrl+v")
                self.on_voice_state("idle", cleaned)
                return

        self.on_voice_state("idle", "")

    def _process_assistant_release(self) -> None:
        """Processes audio with active window context and speaks response via Paradee."""
        self.on_voice_state("thinking", "Thinking...")
        audio = stt_engine.recorder.stop_recording()
        query = stt_engine.transcribe(audio)

        if not query:
            self.on_voice_state("idle", "")
            return

        window_ctx = get_active_window_context()
        messages = [
            {"role": "system", "content": f"Active Window: {window_ctx['window_title']}"},
            {"role": "user", "content": query}
        ]
        res = llm_router.chat_completion(messages, max_tokens=128)
        reply = res.get("content", "")

        if reply:
            self.on_voice_state("speaking", reply)
            tts_engine.speak(reply, blocking=True)

        self.on_voice_state("idle", "")

    def start(self) -> None:
        """Starts the keyboard and drag detector listeners."""
        self._listener = keyboard.Listener(
            on_press=self._on_key_press,
            on_release=self._on_key_release
        )
        self._listener.daemon = True
        self._listener.start()
        self.drag_detector.start()

    def stop(self) -> None:
        """Stops all listeners."""
        if self._listener:
            self._listener.stop()
        self.drag_detector.stop()


# Global singleton instance
hotkey_manager = HotkeyManager()
