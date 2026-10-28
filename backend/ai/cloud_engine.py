"""
Aether Cloud Engine
Routes chat completions to Gemini, Groq, OpenAI, Mistral, or any LiteLLM provider using
the API key stored in %APPDATA%/Aether/config.json. Zero local VRAM.
"""

from typing import Any, Dict, List, Optional

from ..config_manager import config_manager
from .errors import ModelNotConfiguredError

# Thinking Mode uses LiteLLM's portable `reasoning_effort`; each provider
# translates it to its native control (OpenAI effort, Gemini thinking level,
# Anthropic thinking budget, OpenRouter reasoning, Groq/Mistral effort).
_REASONING_ON_EFFORT = "medium"
_REASONING_OFF_EFFORT = "minimal"
_REASONING_ON_MIN_TOKENS = 4096
_REASONING_OFF_MIN_TOKENS = 2048


def _model_supports_reasoning(provider: str, model: str) -> bool:
    """Checks LiteLLM's model map; OpenRouter accepts the field for every model."""
    if provider == "openrouter":
        return True
    try:
        from litellm.utils import supports_reasoning

        return bool(
            supports_reasoning(model=model, custom_llm_provider=provider or None)
        )
    except Exception:
        return False


def reasoning_effort(
    provider: str, model: str, thinking_mode: bool
) -> Optional[str]:
    """Returns the portable effort for this provider, or None when unsupported."""
    provider = (provider or "").strip().lower()
    if not _model_supports_reasoning(provider, model):
        return None
    if thinking_mode:
        return _REASONING_ON_EFFORT
    if provider in {"anthropic", "gemini"}:
        # These map `none` to thinking disabled / zero budget.
        return "none"
    if provider in {"openai", "azure", "azure_ai"}:
        try:
            from litellm.utils import supports_none_reasoning_effort

            if supports_none_reasoning_effort(
                model=model, custom_llm_provider=provider
            ):
                return "none"
        except Exception:
            pass
    # OpenRouter/Groq/Mistral reject `none` on some mandatory-reasoning models;
    # minimal is the lowest effort they accept consistently.
    return _REASONING_OFF_EFFORT


def effective_temperature(model: str, temperature: float) -> float:
    """Gemini 3 expects its provider default (1.0) for reliable output."""
    lowered = str(model or "").lower()
    if temperature < 1.0 and ("gemini-3" in lowered or "gemini/3" in lowered):
        return 1.0
    return temperature


def _is_reasoning_param_error(exc: Exception) -> bool:
    """Detects a provider rejecting `reasoning_effort` so we can retry without it."""
    text = str(exc).lower()
    return "reasoning" in text and any(
        marker in text
        for marker in ("unsupported", "unknown", "invalid", "not supported", "unexpected")
    )


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
        temperature = effective_temperature(model, temperature)
        provider = self._selected_credentials()["provider"]
        effort = reasoning_effort(provider, model, thinking_mode)
        if effort is not None:
            # Reasoning tokens count against max_tokens on most providers.
            max_tokens = max(
                max_tokens,
                _REASONING_ON_MIN_TOKENS if thinking_mode else _REASONING_OFF_MIN_TOKENS,
            )

        kwargs: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "api_key": api_key,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
        }
        if effort is not None:
            kwargs["reasoning_effort"] = effort
        if tools:
            kwargs["tools"] = tools

        try:
            response = litellm.completion(**kwargs)
        except Exception as exc:
            # Older providers or model-map gaps may reject the portable field.
            # Retry once without it rather than failing the whole turn.
            if "reasoning_effort" in kwargs and _is_reasoning_param_error(exc):
                kwargs.pop("reasoning_effort")
                try:
                    response = litellm.completion(**kwargs)
                except Exception as retry_exc:
                    raise ModelNotConfiguredError(
                        f"Cloud API request failed: {retry_exc}"
                    ) from retry_exc
            else:
                raise ModelNotConfiguredError(
                    f"Cloud API request failed: {exc}"
                ) from exc

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

        reasoning = (
            getattr(message, "reasoning_content", "")
            or getattr(message, "reasoning", "")
            or ""
        )
        return {
            "content": (getattr(message, "content", "") or "").strip(),
            "reasoning": str(reasoning).strip(),
            "tool_calls": tool_calls,
            "message": message,
            # Preserve provider-native blocks so tool rounds keep reasoning context.
            "thinking_blocks": getattr(message, "thinking_blocks", None),
            "reasoning_details": getattr(message, "reasoning_details", None),
        }
