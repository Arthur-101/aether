"""
Aether System Prompts
Strict, specialized prompt definitions for Dictation cleaning, Desktop Assistant, and Vision.
Optimized for small/local models (Ternary-Bonsai-2-9B) with zero token waste.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
import base64
import mimetypes
from pathlib import Path

DICTATION_SYSTEM_PROMPT = """You clean dictated text.
Return ONLY the cleaned text. Never explain, never think aloud, never add quotes, labels, or preamble.
1. Remove stutters, filler words (uh, um, like, you know, ah), and false starts.
2. Resolve verbal self-corrections (e.g., 'send tomorrow, no wait, send on Friday' -> 'send on Friday').
3. Retain technical jargon, code snippets, numbers, and user intent precisely.
4. Add correct punctuation and capitalization.
5. If the transcript is already clean, return it unchanged."""

ASSISTANT_SYSTEM_PROMPT = """You are Aether, an ultra-fast, local-first Windows AI Assistant.
Rules:
1. Be concise, direct, and actionable. Avoid robotic pleasantries.
2. When the user requests an OS action, file conversion, search, or routine, call the appropriate tool.
3. If relevant past context or active window information is provided, ground your reply on it.
4. Keep spoken responses brief and natural so they sound great via text-to-speech.
5. For reminders or routines, call a scheduling tool with a future date/time. Use list_scheduled_tasks before editing/cancelling so you have the real task ID, and use schedule_alarm for audible alarms. Recurring tasks can be paused/resumed; one-time tasks can be completed. Use schedule_custom_task when a daily routine must stop at an end date/time. Never claim something changed unless the tool returned a success message."""

VISION_SYSTEM_PROMPT = """You are Aether Vision. You analyze screenshots cropped from the user's desktop.
Rules:
1. Explain what is visible inside the cropped region clearly and concisely.
2. If text, error messages, or code are present, read and address them directly.
3. Answer the user's spoken question accurately based on the visual evidence."""


def _vision_user_content(current_prompt: str, image_paths: List[str]) -> Any:
    """Builds an OpenAI-compatible multimodal user message for attached images."""
    content: List[Dict[str, Any]] = [{"type": "text", "text": current_prompt}]
    for raw_path in image_paths:
        path = Path(raw_path)
        if not path.exists():
            continue
        mime = mimetypes.guess_type(path.name)[0] or "image/png"
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        content.append(
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{encoded}"}}
        )
    return content


def build_assistant_messages(
    current_prompt: str,
    session_context: str = "",
    window_context: Optional[Dict[str, Any]] = None,
    user_preferences: Optional[Dict[str, Any]] = None,
    image_paths: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Assembles a compact prompt payload strictly under 2,500 tokens:
    [System + Preferences + Session Memory + Active Window] + [Current Turn].

    All context is merged into one system message because several GGUF chat
    templates (including Ternary-Bonsai) reject a second system role.
    """
    system_sections = [ASSISTANT_SYSTEM_PROMPT]
    local_now = datetime.now().astimezone()
    timezone_label = local_now.tzname() or local_now.strftime("UTC%z")
    system_sections.append(
        "\n[Current Local Date & Time]\n"
        f"{local_now.strftime('%A, %B %d, %Y at %I:%M %p')} ({timezone_label})\n"
        "Use this exact current time for every relative date or reminder."
    )

    if user_preferences:
        prefs_text = ", ".join(f"{k}: {v}" for k, v in user_preferences.items() if v)
        if prefs_text:
            system_sections.append(f"\n[User Profile / Facts]\n{prefs_text}")

    if session_context:
        system_sections.append(f"\n[Session Memory]\n{session_context}")

    if window_context and window_context.get("window_title"):
        title = window_context["window_title"]
        content = window_context.get("content", "").strip()
        mode = window_context.get("mode", "active_window")
        if content:
            system_sections.append(f"\n[Active Window: {title} ({mode})]\n{content[:1500]}")
        else:
            system_sections.append(f"\n[Active Window: {title}]")

    messages = [{"role": "system", "content": "\n".join(system_sections)}]
    user_content = (
        _vision_user_content(current_prompt, image_paths)
        if image_paths
        else current_prompt
    )
    messages.append({"role": "user", "content": user_content})
    return messages
