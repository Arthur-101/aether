"""
Aether Cloud Engine
Routes chat completions to Gemini, Groq, OpenAI, or any LiteLLM provider using
the API key stored in %APPDATA%/Aether/config.json. Zero local VRAM.
"""

from typing import Any, Dict, List, Optional

from ..config_manager import config_manager
from .errors import ModelNotConfiguredError


class CloudEngine:
    """Thin LiteLLM wrapper with provider-qualified model resolution."""

    def _selected_credentials(self) -> Dict[str, str]:
        """Returns the selected provider plus its saved model and API key."""
        provider = str(
            config_manager.get("ai_provider", "cloud_provider", "") or ""
        ).strip().lower()
        providers = config_manager.get("ai_provider", "cloud_providers") or {}
        entry = providers.get(provider) if isinstance(providers, dict) else None
        entry = entry if isinstance(entry, dict) else {}
        model = str(
            entry.get("model")
            or config_manager.get("ai_provider", "cloud_model", "")
            or ""
        ).strip()
        api_key = str(
            entry.get("api_key")
            or config_manager.get("ai_provider", "api_key", "")
            or ""
        ).strip()
        return {"provider": provider, "model": model, "api_key": api_key}

    def _qualified_model(self) -> str:
        credentials = self._selected_credentials()
        provider = credentials["provider"]
        model = credentials["model"]
        if not model:
            raise ModelNotConfiguredError(
                "Cloud model name is empty. Open Settings and choose a provider/model."
            )
        if provider == "openrouter":
            # OpenRouter's copy button returns a bare vendor/model slug, but
            # LiteLLM needs the openrouter/ prefix. Accept either paste.
            return model if model.startswith("openrouter/") else f"openrouter/{model}"
        if "/" in model:
            return model
        return f"{provider}/{model}" if provider else model

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
        api_key = self._selected_credentials()["api_key"]
        if not api_key:
            raise ModelNotConfiguredError(
                "Cloud API mode is selected but no API key is configured. "
                "Open Settings → AI Engine and paste your key (or switch to Local GGUF)."
            )

        try:
            import litellm
        except ImportError as exc:
            raise ModelNotConfiguredError(
                "Cloud mode requires the 'litellm' package. Run: pip install litellm"
            ) from exc

        model = self._qualified_model()
        kwargs: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "api_key": api_key,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
        }
        if tools:
            kwargs["tools"] = tools

        try:
            response = litellm.completion(**kwargs)
        except Exception as exc:
            raise ModelNotConfiguredError(f"Cloud API request failed: {exc}") from exc

        message = response.choices[0].message
        raw_calls = getattr(message, "tool_calls", None) or []
        tool_calls: List[Dict[str, Any]] = []
        for index, call in enumerate(raw_calls):
            fn = getattr(call, "function", None)
            name = getattr(fn, "name", "") if fn else ""
            arguments = getattr(fn, "arguments", "{}") if fn else "{}"
            tool_calls.append({
                "id": getattr(call, "id", f"call_{index}") or f"call_{index}",
                "type": "function",
                "function": {"name": name, "arguments": arguments or "{}"},
            })

        return {
            "content": (getattr(message, "content", "") or "").strip(),
            "reasoning": (getattr(message, "reasoning_content", "") or "").strip(),
            "tool_calls": tool_calls,
            "message": message,
        }
