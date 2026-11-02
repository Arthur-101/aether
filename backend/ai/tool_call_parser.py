"""
Recovers tool calls that a model printed as plain text.

Providers are supposed to return calls in the `tool_calls` field. Some do not:
dots models emit `<dots_function_call><invoke name="update_note">...</invoke>`,
Qwen/Hermes-style checkpoints emit `<tool_call>{"name": ...}</tool_call>`, and a
small local model will imitate either. Without recovery that markup is returned
as if it were the answer — the tool never runs and the user is shown XML.

This module only *reads* markup. The router decides whether a recovered call
runs, and it is limited to tools that were actually offered this turn, so a
quoted example in normal prose can never trigger one.
"""

import json
import re
import uuid
from typing import Any, Dict, Iterable, List, Optional, Tuple

_TAG_NAMES = r"dots_function_call|function_call|tool_call|invoke|parameter"

_INVOKE_RE = re.compile(
    r"<invoke\s+name\s*=\s*[\"']([^\"']+)[\"']\s*>(.*?)</invoke\s*>",
    re.DOTALL | re.IGNORECASE,
)
_CONTAINER_RE = re.compile(
    r"<(?:dots_function_call|function_call|tool_call)\s*>(.*?)"
    r"</(?:dots_function_call|function_call|tool_call)\s*>",
    re.DOTALL | re.IGNORECASE,
)
_PARAMETER_RE = re.compile(
    r"<parameter\s+name\s*=\s*[\"']([^\"']+)[\"']\s*>(.*?)</parameter\s*>",
    re.DOTALL | re.IGNORECASE,
)
_OPEN_TAG_RE = re.compile(rf"<\s*(?:{_TAG_NAMES})\b", re.IGNORECASE)
_ANY_TAG_RE = re.compile(rf"</?\s*(?:{_TAG_NAMES})\b[^>]*>", re.IGNORECASE)
_SPECIAL_RE = re.compile(
    r"<\|\s*(?:tool_call|function_call|invoke)\s*\|>", re.IGNORECASE
)


def _json_payload(text: str) -> Any:
    """Parses a JSON body, tolerating the ```json fences models like to add."""
    candidate = str(text or "").strip()
    if candidate.startswith("```"):
        candidate = re.sub(r"^```[A-Za-z0-9_+-]*\s*", "", candidate)
        candidate = re.sub(r"\s*```$", "", candidate).strip()
    try:
        return json.loads(candidate)
    except (TypeError, ValueError):
        return None


def _arguments(body: str) -> Dict[str, Any]:
    """Reads a call body as JSON, falling back to `<parameter>` blocks."""
    payload = _json_payload(body)
    if isinstance(payload, dict):
        return payload
    return {
        name.strip(): value.strip()
        for name, value in _PARAMETER_RE.findall(body)
        if name.strip()
    }


def _payload_call(payload: Any) -> Optional[Tuple[str, Dict[str, Any]]]:
    """Maps a JSON tool-call payload onto `(name, arguments)`."""
    if not isinstance(payload, dict):
        return None
    node = payload.get("function")
    if not isinstance(node, dict):
        node = payload
    name = node.get("name") or payload.get("name") or node.get("tool")
    if not isinstance(name, str) or not name.strip():
        return None

    raw = node.get("arguments", node.get("parameters", payload.get("arguments", {})))
    if isinstance(raw, str):
        parsed = _json_payload(raw)
        args = parsed if isinstance(parsed, dict) else {}
    elif isinstance(raw, dict):
        args = dict(raw)
    else:
        args = {}
    return name.strip(), args


def _call(name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    """Builds the same shape a provider-native tool call uses."""
    return {
        "id": f"call_text_{uuid.uuid4().hex[:8]}",
        "type": "function",
        "function": {
            "name": name,
            "arguments": json.dumps(args, ensure_ascii=False, default=str),
        },
    }


def extract_text_tool_calls(
    content: str, allowed: Optional[Iterable[str]] = None
) -> List[Dict[str, Any]]:
    """Returns provider-shaped tool calls found as markup in `content`.

    `allowed` holds the names offered this turn. Nothing is recovered when it
    is empty, and a name outside it is skipped, which keeps quoted
    documentation and half-remembered tools inert.
    """
    text = str(content or "")
    if not text:
        return []
    names = {str(name).strip() for name in (allowed or ()) if str(name).strip()}
    if not names:
        return []

    found: List[Tuple[str, Dict[str, Any]]] = [
        (name.strip(), _arguments(body))
        for name, body in _INVOKE_RE.findall(text)
    ]
    for body in _CONTAINER_RE.findall(text):
        parsed = _payload_call(_json_payload(body))
        if parsed is not None:
            found.append(parsed)

    calls: List[Dict[str, Any]] = []
    seen = set()
    for name, args in found:
        if name not in names:
            continue
        signature = name + json.dumps(args, sort_keys=True, default=str)
        if signature in seen:
            continue
        seen.add(signature)
        calls.append(_call(name, args))
    return calls


def has_complete_tool_call(content: str) -> bool:
    """True when `content` holds a closed `<invoke>` or `<tool_call>` block."""
    text = str(content or "")
    return bool(_INVOKE_RE.search(text) or _CONTAINER_RE.search(text))


def contains_tool_markup(content: str) -> bool:
    """True for any tool-call tag, including a truncated, unclosed call."""
    text = str(content or "")
    return bool(_OPEN_TAG_RE.search(text) or _SPECIAL_RE.search(text))


def strip_tool_markup(content: str) -> str:
    """Removes tool-call markup, keeping any surrounding prose."""
    text = str(content or "")
    if not text:
        return ""
    cleaned = _CONTAINER_RE.sub(" ", text)
    cleaned = _INVOKE_RE.sub(" ", cleaned)
    cleaned = _SPECIAL_RE.sub(" ", cleaned)
    cleaned = _ANY_TAG_RE.sub("", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()