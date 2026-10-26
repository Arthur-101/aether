"""
Aether Global Hotkey Manager
Monitors configurable pynput hotkey holds for dictation, Circle to Ask, the
voice assistant, and Drag + modifier Radial Wheel gestures.
"""

import logging
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

_ACTIONS = ("dictation", "circle_to_ask", "toggle_drawer", "open_island")
logger = logging.getLogger("aether.hotkeys")

# A quick press of the shared open/voice shortcut opens the island; holding it
# past this threshold starts voice capture. The delay only applies to the voice
# action, so an accidental tap never opens the microphone.
VOICE_HOLD_SECONDS = 0.3


class HotkeyManager:
    """Manages global hotkey listeners and dispatches AI/voice/overlay actions."""

    def __init__(
        self,
        on_voice_state: Optional[Callable[[str, str], None]] = None,
        on_show_wheel: Optional[Callable[[int, int, str, str], None]] = None,
        on_circle_to_ask: Optional[Callable[[], None]] = None,
        on_session_updated: Optional[Callable[[Dict[str, Any]], None]] = None,
        on_wheel_move: Optional[Callable[[int, int], None]] = None,
        on_open_island: Optional[Callable[[], None]] = None,
        hold_threshold: float = VOICE_HOLD_SECONDS,
    ):
        self.on_voice_state = on_voice_state or (lambda state, text: None)
        self.on_show_wheel = on_show_wheel or (lambda x, y, path, ext: None)
        self.on_circle_to_ask = on_circle_to_ask or (lambda: None)
        self.on_session_updated = on_session_updated or (lambda data: None)
        self.on_wheel_move = on_wheel_move or (lambda x, y: None)
        self.on_open_island = on_open_island or (lambda: None)
        self.hold_threshold = max(0.0, float(hold_threshold))

        self._pressed: set[str] = set()
        self._active: set[str] = set()
        self._lock = threading.RLock()
        self._bindings: Dict[str, HotkeyBinding] = {}
        self._voice_hold_pending = False
        self._voice_hold_timer: Optional[threading.Timer] = None
        self._voice_hold_paired = False
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
        # An empty binding must stay disabled. parse_hotkey("") produces a
        # wildcard binding that matches every key press.
        bindings = {}
        for action in _ACTIONS:
            raw = str(cfg.get(action, "")).strip()
            if raw:
                bindings[action] = parse_hotkey(raw)
        with self._lock:
            self._clear_voice_hold()
            self._bindings = bindings
            self.drag_detector.set_modifier(
                modifier_name(str(cfg.get("radial_wheel_modifier", "shift")))
            )

    def _clear_voice_hold(self) -> None:
        """Cancels a pending hold without touching an already-active voice run."""
        timer = self._voice_hold_timer
        self._voice_hold_timer = None
        self._voice_hold_pending = False
        self._voice_hold_paired = False
        if timer is not None:
            timer.cancel()

    def _shares_voice_binding(self) -> bool:
        open_binding = self._bindings.get("open_island")
        voice_binding = self._bindings.get("toggle_drawer")
        return bool(open_binding and voice_binding and open_binding == voice_binding)

    def _arm_voice_hold(self, paired: bool) -> None:
        """Defers voice capture so a tap can be recognised as an open gesture."""
        if self._voice_hold_pending or "toggle_drawer" in self._active:
            return
        self._voice_hold_pending = True
        self._voice_hold_paired = paired
        timer = threading.Timer(self.hold_threshold, self._begin_voice_hold)
        timer.daemon = True
        self._voice_hold_timer = timer
        timer.start()

    def _begin_voice_hold(self) -> None:
        with self._lock:
            if not self._voice_hold_pending or self.suspended:
                return
            binding = self._bindings.get("toggle_drawer")
            if not binding or not binding.matches(frozenset(self._pressed)):
                self._clear_voice_hold()
                return
            self._voice_hold_pending = False
            self._voice_hold_timer = None
            self._start_action("toggle_drawer")

    def _open_island(self) -> None:
        if "open_island" in self._active:
            return
        # Track the held binding so auto-repeat cannot fire the callback again.
        self._active.add("open_island")
        self.on_open_island()

    def _handle_wheel_trigger(self, x: int, y: int, file_path: str, ext: str) -> None:
        self.on_show_wheel(x, y, file_path, ext)

    def _handle_wheel_move(self, x: int, y: int) -> None:
        self.on_wheel_move(x, y)

    def set_suspended(self, suspended: bool) -> None:
        """Temporarily ignores actions while Settings records a new shortcut."""
        self.suspended = suspended
        with self._lock:
            self._pressed.clear()
            self._clear_voice_hold()
            if suspended:
                self._active.clear()
                self._stop_recording_safe()

    def _start_recording_safe(self) -> None:
        try:
            stt_engine.recorder.start_recording()
            stt_engine.prewarm()
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
            # pynput repeats on_press while a key is held. Only the first event
            # should arm a gesture or fire a one-shot callback.
            if name in self._pressed:
                return
            self._pressed.add(name)
            if self.suspended:
                return

            pressed = frozenset(self._pressed)
            open_binding = self._bindings.get("open_island")
            voice_binding = self._bindings.get("toggle_drawer")

            if self._shares_voice_binding():
                if voice_binding and voice_binding.matches(pressed):
                    self._arm_voice_hold(paired=True)
                    return
            else:
                if open_binding and open_binding.matches(pressed):
                    self._open_island()
                if voice_binding and voice_binding.matches(pressed):
                    self._arm_voice_hold(paired=False)

            for action, binding in self._bindings.items():
                if action in ("open_island", "toggle_drawer"):
                    continue
                if binding.matches(pressed):
                    self._start_action(action)

    def _on_key_release(self, key: Any) -> None:
        name = key_name(key)
        with self._lock:
            self._pressed.discard(name)
            if self.suspended:
                return
            pressed = frozenset(self._pressed)

            # Releasing before the hold threshold is a tap. When the open and
            # voice shortcuts share a binding, that tap opens the island; when
            # they are separate, a voice tap does nothing.
            if self._voice_hold_pending:
                binding = self._bindings.get("toggle_drawer")
                if not binding or not binding.matches(pressed):
                    paired = self._voice_hold_paired
                    self._clear_voice_hold()
                    if paired:
                        self.on_open_island()

            for action in list(self._active):
                binding = self._bindings.get(action)
                if not binding or not binding.matches(pressed):
                    self._stop_action(action)

    def _process_dictation_release(self) -> None:
        self.on_voice_state("thinking", "Cleaning dictation...")
        audio = self._stop_recording_safe()
        raw_text = stt_engine.transcribe(audio)
        if raw_text:
            cleaned = raw_text
            try:
                candidate = llm_router.clean_dictation(raw_text)
                if candidate:
                    cleaned = candidate
            except ModelNotConfiguredError:
                # Local dictation is still useful without an LLM.
                pass
            except Exception as exc:
                logger.warning("Dictation cleanup failed: %s", exc)
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
            self._clear_voice_hold()
            self._active.clear()
            self._pressed.clear()


# Global singleton instance
hotkey_manager = HotkeyManager()


def reload_hotkeys(new_hotkey_config: Optional[Dict[str, Any]] = None) -> None:
    """Called by config persistence to hot-swap bindings immediately."""
    hotkey_manager.reload(new_hotkey_config)
