"""Bundled, model-navigable Aether guide.

The guide is a small set of Markdown files: one index plus one file per topic.
The model reads the index first, then requests a single topic by id. The same
files power Settings -> Guide, so the documentation cannot drift between the
assistant and the UI.

Resolution order matters for packaging: an explicit override wins, then a
PyInstaller bundle, then the checkout layout. The guide is read-only; nothing in
this module writes to disk.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

GUIDE_ENV = "AETHER_GUIDE_DIR"
INDEX_FILE = "index.md"
TOPICS_DIR = "topics"
DEFAULT_MAX_TOPIC_CHARS = 9000
MAX_SEARCH_RESULTS = 8
TOPIC_MARKER = re.compile(r"<!--\s*topics\s*-->", re.IGNORECASE)
TOPIC_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does",
    "for", "from", "how", "i", "if", "in", "is", "it", "me", "my", "of",
    "on", "or", "that", "the", "this", "to", "use", "what", "when", "where",
    "which", "who", "why", "with", "you", "your",
}


class GuideUnavailableError(RuntimeError):
    """Raised when the bundled guide files cannot be found."""


def _candidate_dirs() -> Iterable[Path]:
    """Yields likely guide locations in priority order."""
    override = os.getenv(GUIDE_ENV, "").strip()
    if override:
        yield Path(override).expanduser()

    bundle = getattr(sys, "_MEIPASS", "")
    if bundle:
        base = Path(bundle)
        yield base / "guide"
        yield base / "aether" / "guide"
        yield base / "backend" / "guide"

    executable_dir = Path(sys.executable).resolve().parent
    yield executable_dir / "guide"
    yield executable_dir / "_internal" / "guide"
    yield executable_dir / "_internal" / "backend" / "guide"

    here = Path(__file__).resolve().parent
    yield here / "guide"  # backend/guide in a source checkout
    yield here.parent / "guide"  # legacy aether/guide checkout
    yield Path.cwd() / "guide"
    yield Path.cwd() / "aether" / "guide"
    yield Path.cwd() / "backend" / "guide"


def get_guide_dir() -> Path:
    """Returns the first guide directory that contains ``index.md``."""
    candidates = list(_candidate_dirs())
    for candidate in candidates:
        if (candidate / INDEX_FILE).is_file():
            return candidate
    expected = candidates[0] if candidates else Path("guide")
    raise GuideUnavailableError(
        f"The bundled guide was not found (looked in {expected})."
    )


def _read_text(path: Path, max_chars: int) -> str:
    """Reads UTF-8 Markdown with a hard character cap."""
    text = path.read_text(encoding="utf-8", errors="replace")
    if max_chars and len(text) > max_chars:
        return text[:max_chars].rstrip() + "\n\n[Guide text truncated.]"
    return text


def _parse_value(raw: str) -> Any:
    """Parses one simple frontmatter value without requiring YAML."""
    value = raw.strip()
    if not value:
        return ""
    if value[0:1] in {"'", '"'} and value[-1:] == value[0]:
        return value[1:-1]
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1]
        return [item.strip().strip("'\"") for item in inner.split(",") if item.strip()]
    return value


def _parse_frontmatter(text: str) -> Tuple[Dict[str, Any], str]:
    """Splits simple ``key: value`` frontmatter from the Markdown body."""
    match = _FRONTMATTER_RE.match(text)
    if not match:
        return {}, text
    meta: Dict[str, Any] = {}
    for line in match.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, separator, raw = line.partition(":")
        if not separator:
            continue
        name = key.strip().lower()
        if not name:
            continue
        meta[name] = _parse_value(raw)
    return meta, text[match.end():]


def _as_list(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def _as_order(value: Any) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return 1000


def _topic_meta(path: Path) -> Dict[str, Any]:
    """Loads one topic's frontmatter and validates its stable id."""
    text = path.read_text(encoding="utf-8", errors="replace")
    meta, _body = _parse_frontmatter(text)
    topic_id = str(meta.get("id") or path.stem).strip().lower()
    if not TOPIC_ID_RE.fullmatch(topic_id):
        raise GuideUnavailableError(
            f"Guide topic '{path.name}' has an invalid id: {topic_id!r}."
        )
    if topic_id != path.stem:
        raise GuideUnavailableError(
            f"Guide topic '{path.name}' must use its filename as its id."
        )
    title = str(meta.get("title") or topic_id.replace("-", " ").title()).strip()
    summary = str(meta.get("summary") or "").strip()
    return {
        "id": topic_id,
        "title": title,
        "summary": summary,
        "tags": _as_list(meta.get("tags")),
        "related": _as_list(meta.get("related")),
        "order": _as_order(meta.get("order")),
        "path": path,
    }


def _topic_files() -> List[Path]:
    """Returns topic files, excluding private/partial Markdown files."""
    root = get_guide_dir() / TOPICS_DIR
    if not root.is_dir():
        raise GuideUnavailableError("The guide has no topics folder.")
    return sorted(
        path for path in root.glob("*.md") if not path.name.startswith("_")
    )


def list_topics() -> List[Dict[str, Any]]:
    """Returns public topic metadata in display order."""
    topics = [_topic_meta(path) for path in _topic_files()]
    topics.sort(key=lambda item: (item["order"], item["title"].lower()))
    return topics


def _public(meta: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": meta["id"],
        "title": meta["title"],
        "summary": meta["summary"],
        "tags": list(meta["tags"]),
        "related": list(meta["related"]),
    }


def _index_parts() -> Tuple[Dict[str, Any], str]:
    directory = get_guide_dir()
    text = _read_text(directory / INDEX_FILE, 0)
    meta, body = _parse_frontmatter(text)
    title = str(meta.get("title") or "Aether Guide").strip()
    return {"title": title, "meta": meta}, body.strip()


def _topic_listing(topics: List[Dict[str, Any]]) -> str:
    lines = ["## Topics", ""]
    for topic in topics:
        summary = topic["summary"] or "Open this topic."
        lines.append(
            f"- [{topic['title']}]({TOPICS_DIR}/{topic['id']}.md) "
            f"· `{topic['id']}` — {summary}"
        )
    return "\n".join(lines)


def index_payload() -> Dict[str, Any]:
    """Returns the rendered index plus the topic directory.

    ``content`` is what the model reads: the index with a generated, linked
    topic list. ``intro`` is the same text without the list, for the Settings
    UI which already renders the topics as a sidebar.
    """
    header, body = _index_parts()
    topics = list_topics()
    listing = _topic_listing(topics)
    if TOPIC_MARKER.search(body):
        content = TOPIC_MARKER.sub(listing, body, count=1).strip()
    else:
        content = f"{body}\n\n{listing}".strip()
    intro = TOPIC_MARKER.sub("", body).strip()
    return {
        "title": header["title"],
        "intro": intro,
        "content": content,
        "topics": [_public(topic) for topic in topics],
    }


def _resolve_topic(reference: str) -> Optional[Dict[str, Any]]:
    clean = (reference or "").strip().lower()
    if not clean:
        return None
    topics = list_topics()
    for topic in topics:
        if topic["id"] == clean:
            return topic
    exact = [topic for topic in topics if topic["title"].lower() == clean]
    if len(exact) == 1:
        return exact[0]
    partial = [
        topic
        for topic in topics
        if clean in topic["id"] or clean in topic["title"].lower()
    ]
    return partial[0] if len(partial) == 1 else None


def read_topic(
    reference: str, max_chars: int = DEFAULT_MAX_TOPIC_CHARS
) -> Optional[Dict[str, Any]]:
    """Reads one topic by id or unique title, returning None if not found."""
    topic = _resolve_topic(reference)
    if topic is None:
        return None
    text = _read_text(topic["path"], max(500, int(max_chars)))
    meta, body = _parse_frontmatter(text)
    related = []
    for related_id in topic["related"]:
        match = _resolve_topic(related_id)
        if match is not None:
            related.append({"id": match["id"], "title": match["title"]})
    return {
        "id": topic["id"],
        "title": str(meta.get("title") or topic["title"]).strip(),
        "summary": topic["summary"],
        "content": body.strip(),
        "related": related,
    }


def _tokens(query: str) -> List[str]:
    return [
        token
        for token in re.findall(r"[a-z0-9]+", (query or "").lower())
        if len(token) >= 2 and token not in _STOPWORDS
    ]


def _snippet(body: str, tokens: List[str]) -> str:
    lowered = body.lower()
    position = -1
    for token in tokens:
        position = lowered.find(token)
        if position >= 0:
            break
    if position < 0:
        return ""
    start = max(0, position - 90)
    end = min(len(body), position + 130)
    text = " ".join(body[start:end].split())
    return f"{'…' if start else ''}{text}{'…' if end < len(body) else ''}"


def search_topics(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Lexically ranks topics; this is a router, not content retrieval."""
    tokens = _tokens(query)
    if not tokens:
        return []
    try:
        count = max(1, min(MAX_SEARCH_RESULTS, int(limit)))
    except (TypeError, ValueError):
        count = 5
    phrase = (query or "").strip().lower()
    results: List[Dict[str, Any]] = []
    for topic in list_topics():
        text = topic["path"].read_text(encoding="utf-8", errors="replace")
        _meta, body = _parse_frontmatter(text)
        title = topic["title"].lower()
        summary = topic["summary"].lower()
        tags = " ".join(topic["tags"]).lower()
        haystack = f"{title}\n{summary}\n{tags}\n{body.lower()}"
        score = 0
        for token in tokens:
            score += title.count(token) * 8
            score += tags.count(token) * 4
            score += summary.count(token) * 3
            score += body.lower().count(token)
        if phrase and phrase in haystack:
            score += 12
        if score <= 0:
            continue
        results.append({
            "id": topic["id"],
            "title": topic["title"],
            "summary": topic["summary"],
            "score": score,
            "snippet": _snippet(body, tokens),
        })
    results.sort(key=lambda item: (-item["score"], item["title"].lower()))
    return results[:count]


def index_text() -> str:
    """Formats the guide index for a tool result."""
    payload = index_payload()
    return (
        f"{payload['content']}\n\n"
        "Read one topic with read_guide(topic_id). Use search_guide only when "
        "the topic is not obvious from this index."
    )


def topic_text(reference: str, max_chars: int = DEFAULT_MAX_TOPIC_CHARS) -> str:
    """Formats one topic for a tool result."""
    topic = read_topic(reference, max_chars=max_chars)
    if topic is None:
        available = ", ".join(item["id"] for item in list_topics())
        return (
            f"No guide topic matches '{reference}'. "
            f"Available topic ids: {available}."
        )
    parts = [f"# {topic['title']}", "", topic["content"]]
    if topic["related"]:
        related = ", ".join(
            f"`{item['id']}` ({item['title']})" for item in topic["related"]
        )
        parts += ["", f"Related topics: {related}."]
    return "\n".join(parts).strip()


def search_text(query: str, limit: int = 5) -> str:
    """Formats lexical topic matches for a tool result."""
    results = search_topics(query, limit=limit)
    if not results:
        return (
            f"No guide topic matched '{query}'. Read the index with guide_index "
            "and choose a topic id."
        )
    lines = [f"Guide topics matching '{query}':"]
    for result in results:
        lines.append(
            f"- `{result['id']}` · **{result['title']}** — {result['summary']}"
        )
        if result["snippet"]:
            lines.append(f"  {result['snippet']}")
    lines.append("Read one with read_guide(topic_id).")
    return "\n".join(lines)


__all__ = [
    "GuideUnavailableError",
    "get_guide_dir",
    "index_payload",
    "index_text",
    "list_topics",
    "read_topic",
    "search_text",
    "search_topics",
    "topic_text",
]
