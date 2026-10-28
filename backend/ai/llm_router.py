"""
Aether LLM Router — Hybrid Local / Ollama / Cloud Facade
Resolves the configured inference backend at call time (hot-swappable),
runs the deterministic FastMCP tool loop, and keeps dictation cleaning local.
"""

import json
from typing import Any, Callable, Dict, List, Optional

from ..config_manager import config_manager
from ..config_schema import DEFAULT_MAX_TOOL_ROUNDS, normalize_max_tool_rounds
from ..db.sessions import (
    EMPTY_REPLY,
    REASONING_ONLY_REPLY,
    looks_like_reasoning,
    session_manager,
)
from ..mcp_tools.server import (
    SESSION_SCOPED_TOOLS,
    execute_tool,
    filter_tool_schemas,
    get_openai_tool_schemas,
)
from ..mcp_tools.tool_permissions import (
    PendingApproval,
    approval_store,
    requires_approval,
    tool_permission,
)
from .cloud_engine import CloudEngine
from .errors import ModelNotConfiguredError
from .local_engine import LocalGGUFEngine
from .ollama_engine import OllamaEngine
from .prompts import DICTATION_SYSTEM_PROMPT

__all__ = ["llm_router", "ModelNotConfiguredError", "LocalGGUFEngine"]

# A tool result begins with "Error" when execute_tool caught a failure; it never
# raises. That string contract is the only failure signal the loop has.
_ERROR_PREFIX = "Error"


def _parse_args(raw: Any) -> Dict[str, Any]:
    """Parses a tool-call argument payload that may arrive as JSON text or a dict."""
    try:
        return json.loads(raw) if isinstance(raw, str) else dict(raw or {})
    except Exception:
        return {}


def _call_signature(name: str, args: Dict[str, Any]) -> str:
    """Stable identity for a tool call, used to stop identical repeat calls."""
    try:
        payload = json.dumps(args, sort_keys=True, ensure_ascii=False, default=str)
    except Exception:
        payload = str(args)
    return f"{name}:{payload}"


def _tool_round_limit() -> int:
    """Reads the configured model→tool loop budget at call time."""
    return normalize_max_tool_rounds(
        config_manager.get("ai_provider", "max_tool_rounds", DEFAULT_MAX_TOOL_ROUNDS)
    )


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
        loadout: Optional[Dict[str, List[str]]] = None,
    ) -> str:
        arguments = _parse_args(raw_args)
        if name in SESSION_SCOPED_TOOLS:
            # The small local model can invent placeholders such as
            # "current_session"; always bind tools to the real active session.
            arguments["session_id"] = (
                session_id or session_manager.active_session_id or ""
            )
        if loadout is None:
            return execute_tool(name, arguments)
        return execute_tool(
            name,
            arguments,
            enabled_groups=loadout.get("enabled_groups"),
            disabled_tools=loadout.get("disabled_tools"),
        )

    def _final_result(
        self,
        engine: Any,
        conversation: List[Dict[str, Any]],
        result: Dict[str, Any],
        executed: List[Dict[str, Any]],
        *,
        max_tokens: int,
        temperature: float,
        top_p: float,
        presence_penalty: float,
        thinking_mode: bool,
        on_stream: Optional[Callable[[str], None]] = None,
        on_stream_reset: Optional[Callable[[], None]] = None,
    ) -> Dict[str, Any]:
        """Returns usable final text, retrying once if the provider leaks reasoning."""
        content = (result.get("content") or "").strip()
        reasoning = (result.get("reasoning") or "").strip()
        if content and not looks_like_reasoning(content):
            return {
                "content": content,
                "reasoning": reasoning,
                "tool_calls_executed": executed,
            }

        # A provider may put its chain of thought in `content`, or leave content
        # empty and expose only `reasoning`. Ask once for a clean final answer.
        if on_stream_reset is not None:
            on_stream_reset()
        retry_messages = list(conversation)
        retry_messages.append({
            "role": "user",
            "content": (
                "Return only your final answer to the user now. "
                "Do not include analysis, reasoning, or a plan."
            ),
        })
        retry = engine.complete(
            retry_messages,
            tools=None,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            presence_penalty=presence_penalty,
            thinking_mode=thinking_mode,
            on_token=on_stream,
        )
        retry_content = (retry.get("content") or "").strip()
        retry_reasoning = (retry.get("reasoning") or "").strip()
        if retry_content and not looks_like_reasoning(retry_content):
            return {
                "content": retry_content,
                "reasoning": retry_reasoning,
                "tool_calls_executed": executed,
            }

        fallback = (
            REASONING_ONLY_REPLY
            if (reasoning or content or retry_reasoning)
            else EMPTY_REPLY
        )
        if on_stream_reset is not None:
            on_stream_reset()
        return {
            "content": fallback,
            "reasoning": reasoning or retry_reasoning,
            "tool_calls_executed": executed,
            "failed": True,
        }

    def _complete(
        self,
        engine: Any,
        conversation: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]],
        max_tokens: int,
        temperature: Optional[float],
        thinking_mode: Optional[bool],
        session_id: Optional[str],
        max_tool_rounds: int,
        loadout: Optional[Dict[str, List[str]]],
        executed: List[Dict[str, Any]],
        on_tool_call: Optional[Callable[[Dict[str, Any]], None]],
        on_stream: Optional[Callable[[str], None]] = None,
        on_stream_reset: Optional[Callable[[], None]] = None,
    ) -> Dict[str, Any]:
        """Runs the tool loop, pausing if a guarded action needs approval."""
        temp, top_p, presence_penalty = self._sampling(thinking_mode, temperature)
        last_signature = ""
        last_output = ""
        duplicates = 0
        for _ in range(max_tool_rounds + 1):
            result = engine.complete(
                conversation,
                tools=tools,
                max_tokens=max_tokens,
                temperature=temp,
                top_p=top_p,
                presence_penalty=presence_penalty,
                thinking_mode=thinking_mode,
                on_token=on_stream,
            )
            tool_calls = result.get("tool_calls") or []
            if not tool_calls:
                return self._final_result(
                    engine,
                    conversation,
                    result,
                    executed,
                    max_tokens=max_tokens,
                    temperature=temp,
                    top_p=top_p,
                    presence_penalty=presence_penalty,
                    thinking_mode=bool(thinking_mode),
                    on_stream=on_stream,
                    on_stream_reset=on_stream_reset,
                )

            # The model may have streamed a sentence before deciding to call a
            # tool. That text is not the answer; discard it before the tool UI.
            if on_stream_reset is not None:
                on_stream_reset()

            assistant_message: Dict[str, Any] = {
                "role": "assistant",
                "content": result.get("content", ""),
                "tool_calls": tool_calls,
            }
            # Preserve provider-native reasoning blocks across tool rounds.
            for key in ("thinking_blocks", "reasoning_details"):
                value = result.get(key)
                if value:
                    assistant_message[key] = value
            conversation.append(assistant_message)
            force_final = False
            for index, call in enumerate(tool_calls):
                fn = call.get("function", {})
                name = fn.get("name", "")
                raw_args = fn.get("arguments", "{}")
                args = _parse_args(raw_args)
                call_id = call.get("id") or f"call_{index}"
                signature = _call_signature(name, args)
                if (
                    signature == last_signature
                    and last_output
                    and not last_output.lstrip().startswith(_ERROR_PREFIX)
                ):
                    duplicates += 1
                    conversation.append({
                        "role": "tool",
                        "tool_call_id": call_id,
                        "name": name,
                        "content": (
                            "This exact call already ran in this turn. "
                            "Do not call it again. Previous result:\n"
                            f"{last_output[:2000]}"
                        ),
                    })
                    if duplicates >= 2:
                        force_final = True
                    continue
                if requires_approval(name):
                    approval_id = approval_store.create_id()
                    approval_store.put(PendingApproval(
                        approval_id=approval_id,
                        session_id=session_id or "",
                        name=name,
                        args=args,
                        call_id=call_id,
                        conversation=conversation,
                        tools=list(tools or []),
                        max_tokens=max_tokens,
                        temperature=temperature,
                        thinking_mode=thinking_mode,
                        loadout=loadout,
                    ))
                    return {
                        "content": result.get("content", "").strip(),
                        "reasoning": result.get("reasoning", ""),
                        "tool_calls_executed": executed,
                        "approval_required": {
                            "approval_id": approval_id,
                            "name": name,
                            "args": args,
                            "risk": tool_permission(name).risk,
                        },
                    }
                if on_tool_call is not None:
                    on_tool_call({
                        "phase": "started", "call_id": call_id, "name": name, "args": args,
                    })
                output = self._execute_tool(name, raw_args, session_id, loadout)
                last_signature = signature
                last_output = str(output)
                executed.append({"name": name, "args": raw_args, "output": output})
                if on_tool_call is not None:
                    on_tool_call({
                        "phase": "finished", "call_id": call_id, "name": name,
                        "ok": not str(output).lstrip().startswith(_ERROR_PREFIX),
                        "output": str(output)[:2000],
                    })
                conversation.append({
                    "role": "tool", "tool_call_id": call_id, "name": name, "content": output,
                })
            if force_final:
                final = engine.complete(
                    conversation,
                    tools=None,
                    max_tokens=max_tokens,
                    temperature=temp,
                    top_p=top_p,
                    presence_penalty=presence_penalty,
                    thinking_mode=thinking_mode,
                    on_token=on_stream,
                )
                return self._final_result(
                    engine,
                    conversation,
                    final,
                    executed,
                    max_tokens=max_tokens,
                    temperature=temp,
                    top_p=top_p,
                    presence_penalty=presence_penalty,
                    thinking_mode=bool(thinking_mode),
                    on_stream=on_stream,
                    on_stream_reset=on_stream_reset,
                )
        if on_stream_reset is not None:
            on_stream_reset()
        return {
            "content": "I reached the maximum number of tool steps for this request.",
            "reasoning": "",
            "tool_calls_executed": executed,
            "failed": True,
        }

    def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        max_tokens: int = 1024,
        temperature: Optional[float] = None,
        thinking_mode: Optional[bool] = None,
        session_id: Optional[str] = None,
        max_tool_rounds: Optional[int] = None,
        on_tool_call: Optional[Callable[[Dict[str, Any]], None]] = None,
        loadout: Optional[Dict[str, List[str]]] = None,
        on_stream: Optional[Callable[[str], None]] = None,
        on_stream_reset: Optional[Callable[[], None]] = None,
    ) -> Dict[str, Any]:
        """
        Runs a completion and executes any FastMCP tool calls deterministically.
        Raises ModelNotConfiguredError with an actionable message when the
        selected backend is unavailable.

        `max_tool_rounds` defaults to the value saved in Settings → AI. Each
        round may contain several tool calls; a final text completion follows
        the last tool round.

        `on_tool_call`, when given, is called synchronously from this thread
        before and after each tool runs so callers can surface live progress.
        `on_stream` receives answer deltas from the same worker thread; the
        caller must marshal them onto the event loop. `on_stream_reset` tells
        the caller to discard the draft when a round becomes a tool call or a
        reasoning retry.
        """
        if max_tool_rounds is None:
            max_tool_rounds = _tool_round_limit()
        else:
            max_tool_rounds = normalize_max_tool_rounds(max_tool_rounds)
        if thinking_mode is None:
            thinking_mode = bool(config_manager.get("ai_provider", "thinking_mode", False))
        engine = self._engine()
        if tools is not None and loadout is not None:
            tools = filter_tool_schemas(
                tools,
                loadout.get("enabled_groups"),
                loadout.get("disabled_tools"),
            )
        convo = [dict(m) for m in messages]
        return self._complete(
            engine, convo, tools, max_tokens, temperature, thinking_mode,
            session_id, max_tool_rounds, loadout, [], on_tool_call,
            on_stream=on_stream, on_stream_reset=on_stream_reset,
        )

    def resolve_approval(
        self,
        approval_id: str,
        session_id: str,
        approved: bool,
        on_tool_call: Optional[Callable[[Dict[str, Any]], None]] = None,
        on_stream: Optional[Callable[[str], None]] = None,
        on_stream_reset: Optional[Callable[[], None]] = None,
    ) -> Dict[str, Any]:
        """Consumes a pending approval and resumes its original model turn."""
        pending = approval_store.take(approval_id, session_id)
        if pending is None:
            return {"error": "This approval request is no longer available."}

        if not approved:
            output = "The user declined this action."
        else:
            if on_tool_call is not None:
                on_tool_call({
                    "phase": "started", "call_id": pending.call_id,
                    "name": pending.name, "args": pending.args,
                })
            output = self._execute_tool(
                pending.name, pending.args, session_id, pending.loadout
            )
            if on_tool_call is not None:
                on_tool_call({
                    "phase": "finished", "call_id": pending.call_id,
                    "name": pending.name,
                    "ok": not str(output).lstrip().startswith(_ERROR_PREFIX),
                    "output": str(output)[:2000],
                })

        pending.conversation.append({
            "role": "tool",
            "tool_call_id": pending.call_id,
            "name": pending.name,
            "content": output,
        })
        executed = [{"name": pending.name, "args": pending.args, "output": output}]
        return self._complete(
            self._engine(), pending.conversation, pending.tools,
            pending.max_tokens, pending.temperature, pending.thinking_mode,
            session_id, _tool_round_limit(), pending.loadout, executed, on_tool_call,
            on_stream=on_stream, on_stream_reset=on_stream_reset,
        )

    def clean_dictation(self, raw_text: str) -> str:
        """Cleans stutters and filler words using the configured backend."""
        raw = raw_text.strip()
        if not raw:
            return ""
        messages = [
            {"role": "system", "content": DICTATION_SYSTEM_PROMPT},
            {"role": "user", "content": raw},
        ]
        result = self.chat_completion(
            messages, tools=None, max_tokens=256, thinking_mode=False
        )
        content = (result.get("content") or "").strip()
        if not content:
            return raw

        # Some providers leak a reasoning trace into content. Never paste it
        # into the user's application; the raw transcript is always usable.
        lowered = content.lower()
        if len(content) > max(160, len(raw) * 3):
            return raw
        if len(content) > len(raw) + 80 and any(
            marker in lowered
            for marker in ("the user wants", "audio transcript", "let me", "i need to")
        ):
            return raw
        return content

    def tool_schemas(self) -> List[Dict[str, Any]]:
        return get_openai_tool_schemas()


# Global singleton instance
llm_router = LLMRouter()
