"""
Aether Global Hotkey Manager
Monitors configurable pynput hotkey holds for dictation, Circle to Ask, the
voice assistant, and Drag + modifier Radial Wheel gestures.
"""

import threading
from typing import Any, Callable, Dict, Optional
import numpy as np
import keyboard as kb
from pynput import keyboard
from pyperclip import copy as clipboard_copy
from ..ai.errors import ModelNotConfiguredError
from ..ai.llm_router import llm_router
from ..ai.prompts import build_assistant_messages
from ..ai.stt_engine import stt_engine
from ..ai.tts_engine import tts_engine
from ..config_manager import config_manager
from ..db.sessions import session_manager
from ..mcp_tools.server import get_openai_tool_schemas
from .explorer_spy import DragShiftDetector
from .hotkey_parser import HotkeyBinding, key_name, modifier_name, parse_hotkey
from .window_context import get_active_window_context

_ACTIONS = ("dictation", "circle_to_ask", "toggle_drawer")


class HotkeyManager:
    """Manages global hotkey listeners and dispatches AI/voice/overlay actions."""

    def __init__(
        self,
        on_voice_state: Optional[Callable[[str, str], None]] = None,
        on_show_wheel: Optional[Callable[[int, int, str, str], None]] = None,
        on_circle_to_ask: Optional[Callable[[], None]] = None,
        on_session_updated: Optional[Callable[[Dict[str, Any]], None]] = None,
        on_wheel_move: Optional[Callable[[int, int], None]] = None,
    ):
        self.on_voice_state = on_voice_state or (lambda state, text: None)
        self.on_show_wheel = on_show_wheel or (lambda x, y, path, ext: None)
        self.on_circle_to_ask = on_circle_to_ask or (lambda: None)
        self.on_session_updated = on_session_updated or (lambda data: None)
        self.on_wheel_move = on_wheel_move or (lambda x, y: None)

        self._pressed: set[str] = set()
        self._active: set[str] = set()
        self._lock = threading.RLock()
        self._bindings: Dict[str, HotkeyBinding] = {}
        self._listener: Optional[keyboard.Listener] = None
        self.suspended = False
        self.drag_detector = DragShiftDetector(
            on_trigger_callback=self._handle_wheel_trigger,
            on_move_callback=self._handle_wheel_move,
        )
        self.reload(config_manager.get("hotkeys") or {})

    def reload(self, new_config: Optional[Dict[str, Any]] = None) -> None:
        """Applies new hotkey bindings immediately, without restarting listeners."""
        cfg = new_config if isinstance(new_config, dict) else config_manager.get("hotkeys") or {}
        bindings = {action: parse_hotkey(str(cfg.get(action, ""))) for action in _ACTIONS}
        with self._lock:
            self._bindings = bindings
            self.drag_detector.set_modifier(
                modifier_name(str(cfg.get("radial_wheel_modifier", "shift")))
            )

    def _handle_wheel_trigger(self, x: int, y: int, file_path: str, ext: str) -> None:
        self.on_show_wheel(x, y, file_path, ext)

    def _handle_wheel_move(self, x: int, y: int) -> None:
        self.on_wheel_move(x, y)

    def set_suspended(self, suspended: bool) -> None:
        """Temporarily ignores actions while Settings records a new shortcut."""
        self.suspended = suspended
        with self._lock:
            self._pressed.clear()
            if suspended:
                self._active.clear()
                self._stop_recording_safe()

    def _start_recording_safe(self) -> None:
        try:
            stt_engine.recorder.start_recording()
        except Exception:
            pass

    def _stop_recording_safe(self) -> np.ndarray:
        try:
            return stt_engine.recorder.stop_recording()
        except Exception:
            return np.zeros(0, dtype=np.float32)

    def _start_action(self, action: str) -> None:
        if action in self._active:
            return
        self._active.add(action)
        if action == "dictation":
            self._start_recording_safe()
            self.on_voice_state("listening", "Listening for dictation...")
        elif action == "circle_to_ask":
            self.on_voice_state("listening", "Draw around anything to ask...")
            self.on_circle_to_ask()
            self._start_recording_safe()
        elif action == "toggle_drawer":
            self._start_recording_safe()
            self.on_voice_state("listening", "Listening for question...")

    def _stop_action(self, action: str) -> None:
        if action not in self._active:
            return
        self._active.discard(action)
        if action == "dictation":
            threading.Thread(target=self._process_dictation_release, daemon=True).start()
        elif action == "circle_to_ask":
            self._stop_recording_safe()
            self.on_voice_state("idle", "")
        elif action == "toggle_drawer":
            threading.Thread(target=self._process_assistant_release, daemon=True).start()

    def _on_key_press(self, key: Any) -> None:
        name = key_name(key)
        with self._lock:
            self._pressed.add(name)
            if self.suspended:
                return
            for action, binding in self._bindings.items():
                if binding.matches(frozenset(self._pressed)):
                    self._start_action(action)

    def _on_key_release(self, key: Any) -> None:
        name = key_name(key)
        with self._lock:
            self._pressed.discard(name)
            if self.suspended:
                return
            pressed = frozenset(self._pressed)
            for action in list(self._active):
                binding = self._bindings.get(action)
                if binding and not binding.matches(pressed):
                    self._stop_action(action)

    def _process_dictation_release(self) -> None:
        self.on_voice_state("thinking", "Cleaning dictation...")
        audio = self._stop_recording_safe()
        raw_text = stt_engine.transcribe(audio)
        if raw_text:
            try:
                cleaned = llm_router.clean_dictation(raw_text)
            except ModelNotConfiguredError:
                self.on_voice_state("idle", "Model not configured")
                return
            if cleaned:
                clipboard_copy(cleaned)
                kb.send("ctrl+v")
                self.on_voice_state("idle", cleaned)
                return
        self.on_voice_state("idle", "")

    def _process_assistant_release(self) -> None:
        self.on_voice_state("thinking", "Thinking...")
        audio = self._stop_recording_safe()
        query = stt_engine.transcribe(audio)
        if not query:
            self.on_voice_state("idle", "")
            return

        window_ctx = get_active_window_context()
        sid = session_manager.get_or_create_session(query)
        context = session_manager.build_session_context(sid, query)
        messages = build_assistant_messages(
            query, session_context=context, window_context=window_ctx
        )
        try:
            result = llm_router.chat_completion(
                messages, tools=get_openai_tool_schemas(), session_id=sid
            )
            reply = result.get("content", "")
            if reply:
                session_manager.commit_turn(sid, query, reply)
                self.on_session_updated({
                    "session_id": sid,
                    "title": "Voice Session",
                    "turn": {"user": query, "ai": reply},
                    "reasoning": result.get("reasoning", ""),
                    "tools_used": result.get("tool_calls_executed", []),
                })
                self.on_voice_state("speaking", reply)
                tts_engine.speak(reply, blocking=True)
        except ModelNotConfiguredError as exc:
            self.on_voice_state("idle", str(exc))
            return
        except Exception:
            pass
        self.on_voice_state("idle", "")

    def start(self) -> None:
        """Starts the keyboard and drag detector listeners."""
        if self._listener is not None:
            return
        self._listener = keyboard.Listener(
            on_press=self._on_key_press, on_release=self._on_key_release
        )
        self._listener.daemon = True
        self._listener.start()
        self.drag_detector.start()

    def stop(self) -> None:
        if self._listener:
            self._listener.stop()
            self._listener = None
        self.drag_detector.stop()
        with self._lock:
            self._active.clear()
            self._pressed.clear()


# Global singleton instance
hotkey_manager = HotkeyManager()


def reload_hotkeys(new_hotkey_config: Optional[Dict[str, Any]] = None) -> None:
    """Called by config persistence to hot-swap bindings immediately."""
    hotkey_manager.reload(new_hotkey_config)
