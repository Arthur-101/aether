"""
Aether LLM Router — Hybrid Local / Ollama / Cloud Facade
Resolves the configured inference backend at call time (hot-swappable),
runs the deterministic FastMCP tool loop, and keeps dictation cleaning local.
"""

import json
from typing import Any, Dict, List, Optional

from ..config_manager import config_manager
from ..db.sessions import session_manager
from ..mcp_tools.server import SESSION_SCOPED_TOOLS, execute_tool, get_openai_tool_schemas
from .cloud_engine import CloudEngine
from .errors import ModelNotConfiguredError
from .local_engine import LocalGGUFEngine
from .ollama_engine import OllamaEngine
from .prompts import DICTATION_SYSTEM_PROMPT

__all__ = ["llm_router", "ModelNotConfiguredError", "LocalGGUFEngine"]


class LLMRouter:
    """Single entry point for every text inference request in Aether."""

    def __init__(self) -> None:
        self.local = LocalGGUFEngine()
        self.ollama = OllamaEngine()
        self.cloud = CloudEngine()

    # ── Backend lifecycle (Settings hot-swap) ──────────────────────
    def active_mode(self) -> str:
        return str(config_manager.get("ai_provider", "mode", "local_gguf") or "local_gguf")

    def _engine(self):
        mode = self.active_mode()
        if mode == "ollama":
            return self.ollama
        if mode == "cloud":
            return self.cloud
        return self.local

    def start_server(self, model_path: Optional[str] = None) -> bool:
        """Compatibility helper used by the Settings UI / tests."""
        if self.active_mode() != "local_gguf":
            return True
        return self.local.start_server(model_path)

    def is_healthy(self) -> bool:
        if self.active_mode() != "local_gguf":
            return True
        return self.local.is_healthy()

    def stop_server(self) -> None:
        """Terminate the local llama-server subprocess (frees VRAM)."""
        self.local.stop_server()

    # ── Inference ───────────────────────────────────────────────────
    def _sampling(self, thinking_mode: bool, temperature: Optional[float]):
        if temperature is None:
            temperature = 1.0 if thinking_mode else 0.7
        top_p = 0.95 if thinking_mode else 0.80
        presence_penalty = 1.0 if thinking_mode else 1.5
        return temperature, top_p, presence_penalty

    def _execute_tool(
        self,
        name: str,
        raw_args: Any,
        session_id: Optional[str],
    ) -> str:
        try:
            arguments = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args or {})
        except Exception:
            arguments = {}
        if name in SESSION_SCOPED_TOOLS:
            # The small local model can invent placeholders such as
            # "current_session"; always bind tools to the real active session.
            arguments["session_id"] = (
                session_id or session_manager.active_session_id or ""
            )
        return execute_tool(name, arguments)

    def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        max_tokens: int = 1024,
        temperature: Optional[float] = None,
        thinking_mode: Optional[bool] = None,
        session_id: Optional[str] = None,
        max_tool_rounds: int = 3,
    ) -> Dict[str, Any]:
        """
        Runs a completion and executes any FastMCP tool calls deterministically.
        Raises ModelNotConfiguredError with an actionable message when the
        selected backend is unavailable.
        """
        if thinking_mode is None:
            thinking_mode = bool(config_manager.get("ai_provider", "thinking_mode", False))
        temp, top_p, presence_penalty = self._sampling(thinking_mode, temperature)
        engine = self._engine()
        convo = [dict(m) for m in messages]
        executed: List[Dict[str, Any]] = []

        for _ in range(max_tool_rounds + 1):
            result = engine.complete(
                convo,
                tools=tools,
                max_tokens=max_tokens,
                temperature=temp,
                top_p=top_p,
                presence_penalty=presence_penalty,
                thinking_mode=thinking_mode,
            )
            tool_calls = result.get("tool_calls") or []
            if not tool_calls:
                content = result.get("content") or result.get("reasoning") or ""
                return {
                    "content": content.strip(),
                    "reasoning": result.get("reasoning", ""),
                    "tool_calls_executed": executed,
                }

            convo.append({
                "role": "assistant",
                "content": result.get("content", ""),
                "tool_calls": tool_calls,
            })
            for index, call in enumerate(tool_calls):
                fn = call.get("function", {})
                name = fn.get("name", "")
                output = self._execute_tool(name, fn.get("arguments", "{}"), session_id)
                executed.append({
                    "name": name,
                    "args": fn.get("arguments", "{}"),
                    "output": output,
                })
                convo.append({
                    "role": "tool",
                    "tool_call_id": call.get("id", f"call_{index}"),
                    "name": name,
                    "content": output,
                })

        return {
            "content": "I reached the maximum number of tool steps for this request.",
            "reasoning": "",
            "tool_calls_executed": executed,
        }

    def clean_dictation(self, raw_text: str) -> str:
        """Cleans stutters and filler words using the configured backend."""
        if not raw_text.strip():
            return ""
        messages = [
            {"role": "system", "content": DICTATION_SYSTEM_PROMPT},
            {"role": "user", "content": raw_text},
        ]
        result = self.chat_completion(
            messages, tools=None, max_tokens=256, thinking_mode=False
        )
        return result.get("content", "").strip()

    def tool_schemas(self) -> List[Dict[str, Any]]:
        return get_openai_tool_schemas()


# Global singleton instance
llm_router = LLMRouter()
