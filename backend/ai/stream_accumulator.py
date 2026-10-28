"""Shared accumulator for OpenAI-shaped streaming deltas.

All three engines (LiteLLM, llama-server, Ollama) expose text and tool calls in
slightly different chunk shapes. Normalising each chunk to the same four fields
keeps the accumulation logic in one place and testable without a network.
"""

from typing import Any, Dict, List, Optional


class StreamAccumulator:
    """Collects content, reasoning, and incremental tool-call fragments."""

    def __init__(self) -> None:
        self._content: List[str] = []
        self._reasoning: List[str] = []
        self._calls: Dict[int, Dict[str, str]] = {}
        self.thinking_blocks: Any = None
        self.reasoning_details: Any = None

    def feed(
        self,
        *,
        content: Optional[str] = None,
        reasoning: Optional[str] = None,
        tool_calls: Optional[List[Dict[str, Any]]] = None,
        thinking_blocks: Any = None,
        reasoning_details: Any = None,
    ) -> str:
        """Adds one chunk and returns the visible text it contributed."""
        if content:
            self._content.append(str(content))
        if reasoning:
            self._reasoning.append(str(reasoning))
        if thinking_blocks:
            self.thinking_blocks = thinking_blocks
        if reasoning_details:
            self.reasoning_details = reasoning_details

        for fragment in tool_calls or []:
            try:
                index = int(fragment.get("index", 0) or 0)
            except (TypeError, ValueError):
                index = 0
            slot = self._calls.setdefault(
                index, {"id": "", "name": "", "arguments": ""}
            )
            if fragment.get("id"):
                slot["id"] = str(fragment["id"])
            if fragment.get("name"):
                # Names arrive whole; assigning avoids duplicating a repeated chunk.
                slot["name"] = str(fragment["name"])
            if fragment.get("arguments"):
                slot["arguments"] += str(fragment["arguments"])
        return str(content or "")

    @property
    def content(self) -> str:
        return "".join(self._content)

    @property
    def reasoning(self) -> str:
        return "".join(self._reasoning)

    def tool_calls(self) -> List[Dict[str, Any]]:
        """Returns the OpenAI/llama.cpp tool-call shape the router expects."""
        calls: List[Dict[str, Any]] = []
        for index in sorted(self._calls):
            slot = self._calls[index]
            if not slot["name"] and not slot["arguments"]:
                continue
            calls.append({
                "id": slot["id"] or f"call_{index}",
                "type": "function",
                "function": {
                    "name": slot["name"],
                    "arguments": slot["arguments"] or "{}",
                },
            })
        return calls
