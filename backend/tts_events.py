"""
Aether Text-to-Speech WebSocket Handlers
Reads a completed assistant reply aloud on demand from Quick Chat.

Playback is serialized: asking for a new reply stops the previous utterance
before the new one starts, and a stop request suppresses the worker's trailing
"idle" broadcast so the frontend never sees a stale state.
"""

import asyncio
import logging
import re
import threading
from typing import Any, Dict, Optional

import sounddevice as sd

from .ai.tts_engine import tts_engine
from .ws_manager import ws_manager

logger = logging.getLogger("aether.tts_events")

UNAVAILABLE_NOTICE = (
    "Voice output isn't available. Choose a local TTS model or a cloud "
    "provider with a saved key in Settings → Voice Engine."
)
FAILED_NOTICE = "Voice output failed. Check Settings → Voice Engine."
EMPTY_NOTICE = "There is nothing to read in that reply."

_speech_lock = threading.Lock()
_playback_lock = threading.Lock()
_state: Dict[str, Any] = {"generation": 0, "cancel": None, "request_id": ""}

def local_voice_state() -> Dict[str, Any]:
    """Describes the voices bundled with the selected local model."""
    return {
        "voices": tts_engine.available_voices(),
        "default_voice": tts_engine.default_voice_id(),
    }


async def broadcast_local_voices() -> None:
    """Pushes the discovered local voice catalog to the Settings UI."""
    await ws_manager.broadcast("LOCAL_VOICES_STATE", local_voice_state())


_FENCED_CODE = re.compile(r"```.*?```", re.S)
_INLINE_CODE = re.compile(r"`([^`]*)`")
_IMAGE = re.compile(r"!\[([^\]]*)\]\([^)]*\)")
_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_HEADING = re.compile(r"^\s{0,3}#{1,6}\s*", re.M)
_BULLET = re.compile(r"^\s*[-*+]\s+", re.M)
_QUOTE = re.compile(r"^\s*>\s?", re.M)
_TABLE_RULE = re.compile(r"^\s*\|?[\s:|-]+\|[\s:|-]*$", re.M)
_BOLD = re.compile(r"(\*\*|__)(.*?)\1", re.S)
_ITALIC = re.compile(r"(?<![\w*_])([*_])([^*_\n]+)\1(?![\w*_])")


def plain_speech_text(text: str) -> str:
    """Turns a Markdown reply into something a voice model should read.

    Code fences are dropped (reading source aloud is rarely useful), while
    inline code, links, and emphasis keep their words and lose their markers.
    """
    value = str(text or "")
    value = _FENCED_CODE.sub(" ", value)
    value = _IMAGE.sub(r"\1", value)
    value = _LINK.sub(r"\1", value)
    value = _INLINE_CODE.sub(r"\1", value)
    value = _TABLE_RULE.sub("", value)
    value = _HEADING.sub("", value)
    value = _BULLET.sub("", value)
    value = _QUOTE.sub("", value)
    value = _BOLD.sub(r"\2", value)
    value = _ITALIC.sub(r"\2", value)
    value = value.replace("|", ", ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{2,}", "\n", value)
    return value.strip()


def _begin_speech(request_id: str) -> tuple[int, threading.Event]:
    """Marks a new utterance current and cancels the previous one."""
    with _speech_lock:
        previous: Optional[threading.Event] = _state["cancel"]
        if previous is not None:
            previous.set()
        cancel = threading.Event()
        _state["cancel"] = cancel
        _state["request_id"] = request_id
        _state["generation"] += 1
        return int(_state["generation"]), cancel


def _finish_speech(generation: int) -> bool:
    """Returns True only when the finished utterance is still the current one."""
    with _speech_lock:
        if _state["generation"] != generation:
            return False
        _state["cancel"] = None
        return True


def _stop_audio() -> None:
    """Interrupts sounddevice playback; safe when nothing is playing."""
    try:
        sd.stop()
    except Exception:
        pass


def _speak_blocking(text: str, cancel: threading.Event) -> None:
    # Serialize playback so a superseded request can never talk over the new
    # one while its synthesis finishes.
    with _playback_lock:
        if cancel.is_set():
            return
        tts_engine.speak(text, blocking=True, cancel=cancel)


async def _run_speech(
    text: str,
    request_id: str,
    generation: int,
    cancel: threading.Event,
) -> None:
    """Synthesizes and plays one utterance, then reports idle."""
    message = ""
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _speak_blocking, text, cancel)
    except FileNotFoundError:
        message = UNAVAILABLE_NOTICE
        logger.warning("Voice output unavailable: the local TTS model is missing.")
    except Exception as exc:
        message = FAILED_NOTICE
        logger.warning("Voice output failed: %s", exc)
    finally:
        if _finish_speech(generation):
            await ws_manager.broadcast(
                "TTS_STATE",
                {
                    "state": "idle",
                    "request_id": request_id,
                    "message": message,
                },
            )


async def _handle_speak(payload: Dict[str, Any]) -> None:
    """Speaks the supplied reply through the configured TTS provider."""
    request_id = str(payload.get("request_id") or "")
    text = plain_speech_text(str(payload.get("text") or ""))
    if not text:
        await ws_manager.broadcast(
            "TTS_STATE",
            {"state": "idle", "request_id": request_id, "message": EMPTY_NOTICE},
        )
        return
    if not tts_engine.is_available():
        await ws_manager.broadcast(
            "TTS_STATE",
            {
                "state": "idle",
                "request_id": request_id,
                "message": UNAVAILABLE_NOTICE,
            },
        )
        return

    generation, cancel = _begin_speech(request_id)
    _stop_audio()
    await ws_manager.broadcast(
        "TTS_STATE",
        {"state": "speaking", "request_id": request_id, "message": ""},
    )
    asyncio.create_task(_run_speech(text, request_id, generation, cancel))


async def _handle_get_local_voices(payload: Dict[str, Any]) -> None:
    """Replies with the voices bundled with the selected local model."""
    await broadcast_local_voices()


async def _handle_stop(payload: Dict[str, Any]) -> None:
    """Stops the current utterance, if any."""
    with _speech_lock:
        cancel: Optional[threading.Event] = _state["cancel"]
        if cancel is None:
            return
        cancel.set()
        _state["cancel"] = None
        _state["generation"] += 1
        request_id = str(_state["request_id"] or payload.get("request_id") or "")
    _stop_audio()
    await ws_manager.broadcast(
        "TTS_STATE",
        {"state": "idle", "request_id": request_id, "message": ""},
    )


def register_tts_events() -> None:
    """Registers Quick Chat's read-aloud handlers."""
    # Imported lazily so this module can be imported directly in tests without
    # tripping event_router's own registration import.
    from .event_router import register_handler

    register_handler("SPEAK_TEXT", _handle_speak)
    register_handler("STOP_SPEAKING", _handle_stop)
    register_handler("GET_LOCAL_VOICES", _handle_get_local_voices)
