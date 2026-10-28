"""Read-only guide tools for the assistant.

The guide is documentation about Aether itself: setup, settings, tools, voice,
and troubleshooting. These tools let the model navigate the bundled Markdown
instead of guessing. They never write to disk and are safe to call repeatedly.
"""

from __future__ import annotations

from typing import Any, Dict, List

from .. import guide_store

DEFAULT_SEARCH_LIMIT = 5


def guide_index() -> str:
    """Returns the guide index and its topic directory."""
    try:
        return guide_store.index_text()
    except guide_store.GuideUnavailableError as exc:
        return f"The bundled guide is unavailable: {exc}"


def read_guide(topic: str, max_chars: int = guide_store.DEFAULT_MAX_TOPIC_CHARS) -> str:
    """Returns one guide topic by id or unique title."""
    reference = (topic or "").strip()
    if not reference:
        return "Which guide topic? Call guide_index to see the available topic ids."
    try:
        return guide_store.topic_text(reference, max_chars=max_chars)
    except guide_store.GuideUnavailableError as exc:
        return f"The bundled guide is unavailable: {exc}"


def search_guide(query: str, limit: int = DEFAULT_SEARCH_LIMIT) -> str:
    """Routes a question to likely guide topics using lexical matches."""
    if not (query or "").strip():
        return "Provide a search query, or call guide_index to see every topic."
    try:
        return guide_store.search_text(query, limit=limit)
    except guide_store.GuideUnavailableError as exc:
        return f"The bundled guide is unavailable: {exc}"


def get_guide_tool_schemas() -> List[Dict[str, Any]]:
    """OpenAI/GGUF function schemas for the guide tools."""
    return [
        {
            "type": "function",
            "function": {
                "name": "guide_index",
                "description": (
                    "Read the Aether guide index: setup and feature topics about "
                    "Aether itself. Call this before answering questions about how "
                    "Aether works."
                ),
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "read_guide",
                "description": (
                    "Read one Aether guide topic by id from guide_index. Answer "
                    "setup or feature questions from this text instead of guessing."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "topic": {
                            "type": "string",
                            "description": "Topic id from guide_index, e.g. 'voice'.",
                        }
                    },
                    "required": ["topic"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "search_guide",
                "description": (
                    "Find likely Aether guide topics by keyword. Use only when the "
                    "right topic is not obvious from guide_index."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Feature, setting, or error to find.",
                        },
                        "limit": {
                            "type": "integer",
                            "description": f"Max topics (default {DEFAULT_SEARCH_LIMIT}).",
                        },
                    },
                    "required": ["query"],
                },
            },
        },
    ]
