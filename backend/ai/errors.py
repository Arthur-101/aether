"""Shared LLM errors used across all inference backends."""


class ModelNotConfiguredError(RuntimeError):
    """Raised when the selected inference backend is not usable.

    The message is surfaced verbatim in the Quick Chat feed and triggers the
    frontend Settings modal via the ERROR_CONFIG_MISSING WebSocket event.
    """


class EngineNotInstalledError(ModelNotConfiguredError):
    """Raised when local mode is active but no engine pack can be resolved.

    Distinct from a missing model: the fix is Settings → Components, so the
    event carries ``target: components`` and the frontend opens that tab.
    """


class ToolCallParseError(ModelNotConfiguredError):
    """Raised when llama-server rejected a malformed tool call.

    The local model usually produced the call but its JSON arguments were cut
    short, so the router retries once with a larger output budget before this
    reaches the user.
    """
