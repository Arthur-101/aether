"""
Aether System Prompts
Strict, specialized prompt definitions for Dictation cleaning, Desktop Assistant, and Vision.
Optimized for small/local models (Ternary-Bonsai-2-9B) with zero token waste.
"""

from typing import Any, Dict, List, Optional

DICTATION_SYSTEM_PROMPT = """You are an expert real-time dictation cleaner.
Your job is to transform raw, spoken microphone transcripts into clean, readable text:
1. Remove stutters, filler words (uh, um, like, you know, ah), and false starts.
2. Resolve verbal self-corrections (e.g., 'send tomorrow, no wait, send on Friday' -> 'send on Friday').
3. Retain technical jargon, code snippets, numbers, and user intent precisely.
4. Add correct punctuation and capitalization.
5. Think very briefly (1-2 sentences), then output ONLY the final cleaned text with no explanations."""

ASSISTANT_SYSTEM_PROMPT = """You are Aether, an ultra-fast, local-first Windows AI Assistant.
Rules:
1. Be concise, direct, and actionable. Avoid robotic pleasantries.
2. When the user requests an OS action, file conversion, search, or routine, call the appropriate tool.
3. If relevant past context or active window information is provided, ground your reply on it.
4. Keep spoken responses brief and natural so they sound great via text-to-speech."""

VISION_SYSTEM_PROMPT = """You are Aether Vision. You analyze screenshots cropped from the user's desktop.
Rules:
1. Explain what is visible inside the cropped region clearly and concisely.
2. If text, error messages, or code are present, read and address them directly.
3. Answer the user's spoken question accurately based on the visual evidence."""


def build_assistant_messages(
    current_prompt: str,
    session_context: str = "",
    window_context: Optional[Dict[str, Any]] = None,
    user_preferences: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, str]]:
    """
    Assembles a compact prompt payload strictly under 2,500 tokens:
    [System + Preferences] + [Relevant Session Memory] + [Active Window] + [Current Turn]
    """
    system_sections = [ASSISTANT_SYSTEM_PROMPT]

    if user_preferences:
        prefs_text = ", ".join(f"{k}: {v}" for k, v in user_preferences.items() if v)
        if prefs_text:
            system_sections.append(f"\n[User Profile / Facts]\n{prefs_text}")

    if window_context and window_context.get("window_title"):
        title = window_context["window_title"]
        content = window_context.get("content", "").strip()
        mode = window_context.get("mode", "active_window")
        if content:
            system_sections.append(f"\n[Active Window: {title} ({mode})]\n{content[:1500]}")
        else:
            system_sections.append(f"\n[Active Window: {title}]")

    messages = [{"role": "system", "content": "\n".join(system_sections)}]

    if session_context:
        messages.append({"role": "system", "content": f"[Session Memory]\n{session_context}"})

    messages.append({"role": "user", "content": current_prompt})
    return messages
