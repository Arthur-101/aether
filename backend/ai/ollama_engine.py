"""
Aether Ollama Engine
Routes chat completions to a local Ollama server with the user's configured
context length. Ollama's /api/chat endpoint mirrors OpenAI tool calling.
"""

import json
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

from ..config_manager import config_manager
from .errors import ModelNotConfiguredError


def _ollama_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Converts OpenAI multimodal content into Ollama's text + images shape."""
    normalized: List[Dict[str, Any]] = []
    for message in messages:
        item = dict(message)
        content = item.get("content")
        if isinstance(content, list):
            texts: List[str] = []
            images: List[str] = []
            for part in content:
                if not isinstance(part, dict):
                    continue
                if part.get("type") == "text":
                    texts.append(str(part.get("text", "")))
                elif part.get("type") == "image_url":
                    url = str((part.get("image_url") or {}).get("url", ""))
                    if "," in url:
                        images.append(url.split(",", 1)[1])
            item["content"] = "\n".join(texts)
            if images:
                item["images"] = images
        normalized.append(item)
    return normalized


class OllamaEngine:
    """HTTP client for a locally running Ollama instance."""

    def complete(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        max_tokens: int = 1024,
        temperature: float = 0.7,
        top_p: float = 0.80,
        presence_penalty: float = 1.5,
        thinking_mode: bool = False,
    ) -> Dict[str, Any]:
        base_url = str(
            config_manager.get("ai_provider", "ollama_base_url", "")
            or "http://127.0.0.1:11434"
        ).rstrip("/")
        model = str(config_manager.get("ai_provider", "ollama_model_name", "") or "")
        if not model:
            raise ModelNotConfiguredError(
                "Ollama model name is empty. Open Settings and enter a model "
                "such as qwen2.5:7b or ternary-bonsai-2:9b."
            )

        context_length = int(config_manager.get("ai_provider", "context_length", 8192))
        payload: Dict[str, Any] = {
            "model": model,
            "messages": _ollama_messages(messages),
            "stream": False,
            "options": {
                "num_ctx": context_length,
                "temperature": temperature,
                "top_p": top_p,
            },
        }
        if tools:
            payload["tools"] = tools

        req = urllib.request.Request(
            f"{base_url}/api/chat",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, ConnectionError) as exc:
            raise ModelNotConfiguredError(
                f"Ollama is not reachable at {base_url}. Start Ollama or switch "
                f"to Local GGUF / Cloud API in Settings. ({exc})"
            ) from exc
        except Exception as exc:
            raise ModelNotConfiguredError(f"Ollama request failed: {exc}") from exc

        message = data.get("message", {}) or {}
        tool_calls = message.get("tool_calls") or []
        # Normalize Ollama tool calls to the OpenAI/llama.cpp shape.
        normalized = []
        for index, call in enumerate(tool_calls):
            fn = call.get("function", {}) if isinstance(call, dict) else {}
            args = fn.get("arguments", {})
            if not isinstance(args, str):
                args = json.dumps(args)
            normalized.append({
                "id": call.get("id", f"call_{index}") if isinstance(call, dict) else f"call_{index}",
                "type": "function",
                "function": {"name": fn.get("name", ""), "arguments": args},
            })

        return {
            "content": (message.get("content") or "").strip(),
            "reasoning": (message.get("thinking") or "").strip(),
            "tool_calls": normalized,
            "message": message,
        }
