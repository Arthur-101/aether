"""Clipboard read/write tools for the assistant.

These tools talk to the real Windows clipboard through ``pyperclip``. There is
no Aether-side history: reading only inspects the current clipboard, and writing
replaces it. Text is capped before it reaches the model so a copied document
cannot flood a small context window.
"""

from __future__ import annotations

from typing import Any, Dict, List

import pyperclip

MAX_CLIPBOARD_CHARS = 4000

EMPTY_CLIPBOARD = "The clipboard is empty."
NO_TEXT_CLIPBOARD = "The clipboard does not contain text."
IMAGE_CLIPBOARD = "The clipboard contains an image, not text."
FILES_CLIPBOARD = "The clipboard contains files, not text."
WRITE_FAILED = "Could not write to the clipboard."


def _non_text_clipboard_kind() -> str:
    """Detects an image or file clipboard when pyperclip returned no text."""
    try:
        from PIL import ImageGrab

        data = ImageGrab.grabclipboard()
    except Exception:
        return ""
    if isinstance(data, list):
        return "files"
    if data is not None:
        return "image"
    return ""


def read_clipboard() -> str:
    """Returns the current clipboard text, or a clear message when unavailable."""
    try:
        text = pyperclip.paste()
    except Exception:
        return NO_TEXT_CLIPBOARD
    if not isinstance(text, str):
        return NO_TEXT_CLIPBOARD
    if not text.strip():
        kind = _non_text_clipboard_kind()
        if kind == "image":
            return IMAGE_CLIPBOARD
        if kind == "files":
            return FILES_CLIPBOARD
        return EMPTY_CLIPBOARD
    if len(text) > MAX_CLIPBOARD_CHARS:
        return (
            text[:MAX_CLIPBOARD_CHARS]
            + f"\n[Clipboard truncated after {MAX_CLIPBOARD_CHARS} characters.]"
        )
    return text


def write_clipboard(text: str) -> str:
    """Replaces the Windows clipboard with the given text."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError("text must be a non-empty string.")
    try:
        pyperclip.copy(text)
    except Exception as exc:
        raise RuntimeError(WRITE_FAILED) from exc
    return f"Copied {len(text)} characters to the clipboard."


def get_clipboard_tool_schemas() -> List[Dict[str, Any]]:
    """OpenAI/GGUF function schemas for the clipboard tool group."""
    return [
        {
            "type": "function",
            "function": {
                "name": "read_clipboard",
                "description": (
                    "Read the current Windows clipboard text. Takes no arguments. "
                    "Returns a notice when the clipboard is empty or holds only "
                    "an image or files."
                ),
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "write_clipboard",
                "description": "Replace the Windows clipboard with the given text.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "Text to copy to the clipboard.",
                        }
                    },
                    "required": ["text"],
                },
            },
        },
    ]
