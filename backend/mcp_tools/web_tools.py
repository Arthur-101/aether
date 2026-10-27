"""Read-only web search and direct URL reading tools for the assistant."""

from __future__ import annotations

import html
import json
import re
from html.parser import HTMLParser
from typing import Any, Dict, List
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from ..config_manager import config_manager

TAVILY_SEARCH_URL = "https://api.tavily.com/search"
NETWORK_TIMEOUT = 12.0
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
MAX_PAGE_CHARS = 12_000
DEFAULT_RESULTS = 5
MAX_RESULTS = 10
USER_AGENT = "Aether/0.2 (local assistant; direct page reader)"


class _TextExtractor(HTMLParser):
    """Small dependency-free HTML-to-text extractor for bounded page context."""

    _SKIP = {"script", "style", "noscript", "svg", "template"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: List[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: List[tuple[str, str | None]]) -> None:
        if tag in self._SKIP:
            self._skip_depth += 1
        elif tag in {"p", "br", "li", "article", "section", "h1", "h2", "h3", "h4", "tr"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self._SKIP and self._skip_depth:
            self._skip_depth -= 1
        elif tag in {"p", "li", "article", "section", "h1", "h2", "h3", "h4", "tr"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip_depth:
            self.parts.append(data)

    def text(self) -> str:
        return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", "".join(self.parts))).strip()


def _result_count(value: Any) -> int:
    try:
        return max(1, min(MAX_RESULTS, int(value)))
    except (TypeError, ValueError):
        return DEFAULT_RESULTS


def _valid_url(value: str) -> str:
    url = (value or "").strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Provide a full http:// or https:// URL.")
    if parsed.username or parsed.password:
        raise ValueError("URLs with embedded credentials are not allowed.")
    return url


def _read_url(url: str) -> tuple[str, str]:
    """Reads a bounded HTTP response, returning content type and decoded text."""
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,text/plain;q=0.9,*/*;q=0.1"})
    try:
        with urlopen(request, timeout=NETWORK_TIMEOUT) as response:
            content_type = str(response.headers.get("Content-Type") or "").lower()
            raw = response.read(MAX_RESPONSE_BYTES + 1)
    except HTTPError as exc:
        raise ValueError(f"The site returned HTTP {exc.code}.") from exc
    except URLError as exc:
        raise ValueError(f"Could not reach this URL: {exc.reason}") from exc
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ValueError("The page is too large to read safely.")
    charset = "utf-8"
    match = re.search(r"charset=([^;\s]+)", content_type)
    if match:
        charset = match.group(1).strip('"\'')
    return content_type, raw.decode(charset, errors="replace")


def web_search(query: str, n: int = DEFAULT_RESULTS) -> str:
    """Searches the live web with Tavily. Requires a Tavily API key in Settings."""
    phrase = (query or "").strip()
    if not phrase:
        return "Provide a search query."
    api_key = str(config_manager.get("ai_provider", "tavily_api_key", "") or "").strip()
    if not api_key:
        return "Web search needs a Tavily API key. Add it in Settings → AI Engine."
    payload = json.dumps({
        "api_key": api_key,
        "query": phrase,
        "max_results": _result_count(n),
        "search_depth": "basic",
        "include_answer": False,
    }).encode("utf-8")
    request = Request(
        TAVILY_SEARCH_URL,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
        method="POST",
    )
    try:
        with urlopen(request, timeout=NETWORK_TIMEOUT) as response:
            raw = response.read(MAX_RESPONSE_BYTES)
        data = json.loads(raw.decode("utf-8"))
    except HTTPError as exc:
        if exc.code in {401, 403}:
            return "Tavily rejected the API key. Check it in Settings → AI Engine."
        return f"Tavily search failed with HTTP {exc.code}."
    except (URLError, TimeoutError) as exc:
        return f"Web search could not reach Tavily: {exc}"
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        return f"Tavily returned an unreadable response: {exc}"

    results = data.get("results") if isinstance(data, dict) else []
    if not isinstance(results, list) or not results:
        return f"No web results found for '{phrase}'."
    lines = [f"Web results for '{phrase}':"]
    for index, item in enumerate(results[:_result_count(n)], start=1):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "Untitled result").strip()
        url = str(item.get("url") or "").strip()
        snippet = " ".join(str(item.get("content") or "").split())[:700]
        lines.append(f"{index}. {title}\n   {url}\n   {snippet}")
    return "\n".join(lines)


def fetch_url(url: str) -> str:
    """Reads a public HTTP(S) URL without requiring an API key."""
    try:
        clean_url = _valid_url(url)
        content_type, source = _read_url(clean_url)
    except ValueError as exc:
        return f"Could not fetch URL: {exc}"
    if "html" in content_type or not content_type:
        extractor = _TextExtractor()
        extractor.feed(source)
        text = html.unescape(extractor.text())
    elif content_type.startswith("text/") or "json" in content_type or "xml" in content_type:
        text = source
    else:
        return f"Could not read this URL: unsupported content type '{content_type}'."
    text = text.strip()
    if not text:
        return "The page did not contain readable text."
    truncated = len(text) > MAX_PAGE_CHARS
    text = text[:MAX_PAGE_CHARS]
    suffix = "\n\n[Page text truncated for context.]" if truncated else ""
    return f"Source: {clean_url}\n\n{text}{suffix}"


def get_web_tool_schemas() -> List[Dict[str, Any]]:
    """OpenAI/GGUF function schemas for the web tool group."""
    return [
        {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Search the live web using Tavily. Requires a Tavily API key configured in Settings.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query."},
                        "n": {"type": "integer", "description": "Number of results, 1 to 10 (default 5)."},
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "fetch_url",
                "description": "Read a public http(s) URL directly. No API key is needed.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string", "description": "Full http:// or https:// URL."},
                    },
                    "required": ["url"],
                },
            },
        },
    ]
