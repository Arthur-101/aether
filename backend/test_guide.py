"""Guide tests: bundled content, links, API, tools, and prompt wiring."""

from __future__ import annotations

import re

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import guide_store
from backend.ai.prompts import build_assistant_messages
from backend.guide_api import router as guide_router
from backend.mcp_tools import tool_permissions
from backend.mcp_tools.server import execute_tool, get_openai_tool_schemas
from backend.tool_groups import TOOL_GROUP_IDS

GUIDE_DIR = guide_store.get_guide_dir()
LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
SECRET_RE = re.compile(
    r"(sk-[A-Za-z0-9_-]{16,}"
    r"|AIza[0-9A-Za-z_-]{20,}"
    r"|tvly-[A-Za-z0-9_-]{10,}"
    r"|ghp_[A-Za-z0-9]{20,}"
    r"|xox[baprs]-[A-Za-z0-9-]{10,}"
    r"|Bearer\s+[A-Za-z0-9._-]{12,})"
)
GUIDE_TOOLS = {"guide_index", "read_guide", "search_guide"}


@pytest.fixture()
def client() -> TestClient:
    app = FastAPI()
    app.include_router(guide_router)
    return TestClient(app)


def _markdown_files():
    yield GUIDE_DIR / "index.md"
    yield from sorted((GUIDE_DIR / "topics").glob("*.md"))


def test_index_is_compact_and_lists_every_topic():
    payload = guide_store.index_payload()

    assert payload["title"] == "Aether Guide"
    assert payload["intro"]
    assert "<!-- topics -->" not in payload["content"]
    # The index is a router, not the manual: it must stay cheap to inject.
    assert len(payload["content"]) < 3500
    assert payload["topics"]
    for topic in payload["topics"]:
        assert topic["id"] in payload["content"]
        assert topic["title"] in payload["content"]

    ids = {topic["id"] for topic in payload["topics"]}
    assert {
        "getting-started",
        "ai-engines",
        "voice",
        "chat-and-memory",
        "tools-and-approvals",
        "spotify",
        "web-search",
        "troubleshooting",
        "architecture",
    } <= ids


def test_topics_have_valid_frontmatter_and_unique_ids():
    topics = guide_store.list_topics()
    ids = [topic["id"] for topic in topics]

    assert len(ids) == len(set(ids))
    for topic in topics:
        assert topic["id"] == topic["path"].stem
        assert topic["title"]
        assert topic["summary"]
        assert isinstance(topic["order"], int)
        for related in topic["related"]:
            assert guide_store.read_topic(related) is not None


def test_every_relative_guide_link_resolves():
    for path in _markdown_files():
        text = path.read_text(encoding="utf-8")
        for match in LINK_RE.finditer(text):
            href = match.group(1).strip()
            if re.match(r"^(https?:|mailto:|tel:)", href, re.IGNORECASE):
                continue
            target = href.split("#")[0]
            if not target:
                continue
            resolved = (path.parent / target).resolve()
            assert resolved.is_file(), f"{path.name} links to missing {href}"
            assert resolved.is_relative_to(GUIDE_DIR.resolve())


def test_guide_contains_no_secrets_or_user_paths():
    for path in _markdown_files():
        text = path.read_text(encoding="utf-8")
        assert not SECRET_RE.search(text), f"possible secret in {path.name}"
        assert "C:\\Users\\" not in text
        assert "/Users/" not in text


def test_guide_dir_override_wins(tmp_path, monkeypatch):
    (tmp_path / "index.md").write_text(
        "---\ntitle: Test Guide\n---\n# Test Guide\n", encoding="utf-8"
    )
    (tmp_path / "topics").mkdir()
    monkeypatch.setenv(guide_store.GUIDE_ENV, str(tmp_path))

    assert guide_store.get_guide_dir() == tmp_path


def test_read_topic_and_search_route_questions():
    voice = guide_store.read_topic("voice")
    assert voice is not None
    assert "Phonon-2" in voice["content"]
    assert guide_store.read_topic("VOICE") is not None

    assert guide_store.read_topic("not-a-topic") is None
    assert guide_store.search_topics("") == []
    assert guide_store.search_topics("tavily")[0]["id"] == "web-search"
    assert guide_store.search_topics("paradee")[0]["id"] == "voice"
    assert guide_store.search_topics("spotify premium")[0]["id"] == "spotify"


def test_topic_ids_cannot_escape_the_guide_folder():
    assert guide_store.read_topic("../guide_store") is None
    assert guide_store.read_topic("..\\..\\secret") is None
    assert guide_store.read_topic("topics/voice") is None


def test_guide_tools_are_read_only_and_in_notes():
    for name in GUIDE_TOOLS:
        permission = tool_permissions.tool_permission(name)
        assert permission.group == "notes"
        assert permission.risk == "read"
        assert tool_permissions.requires_approval(name) is False

    schema_names = {
        schema["function"]["name"]
        for schema in get_openai_tool_schemas(["notes"], [])
    }
    assert GUIDE_TOOLS <= schema_names


def test_guide_tool_results():
    index = execute_tool("guide_index", {})
    assert index.startswith("# Aether Guide")
    assert "Topics" in index

    voice = execute_tool("read_guide", {"topic": "voice"})
    assert "Phonon-2" in voice

    search = execute_tool("search_guide", {"query": "tavily"})
    assert "web-search" in search

    missing = execute_tool("read_guide", {"topic": "not-a-topic"})
    assert "No guide topic matches" in missing
    assert "getting-started" in missing


def test_guide_tools_follow_the_notes_loadout():
    notes = {
        schema["function"]["name"]
        for schema in get_openai_tool_schemas(["notes"], [])
    }
    web = {
        schema["function"]["name"]
        for schema in get_openai_tool_schemas(["web"], [])
    }
    assert GUIDE_TOOLS <= notes
    assert not (GUIDE_TOOLS & web)

    blocked = execute_tool(
        "read_guide", {"topic": "voice"}, enabled_groups=["web"]
    )
    assert blocked.startswith("Error")
    assert "disabled" in blocked.lower()


def test_guide_prompt_appears_with_the_notes_group():
    default = build_assistant_messages("hi")[0]["content"]
    assert "guide_index" in default

    notes = build_assistant_messages(
        "hi", enabled_tool_groups=["notes"], disabled_tools=[]
    )[0]["content"]
    assert "guide_index" in notes

    without_notes = build_assistant_messages(
        "hi", enabled_tool_groups=["web"], disabled_tools=[]
    )[0]["content"]
    assert "guide_index" not in without_notes

    generic = build_assistant_messages(
        "hi", enabled_tool_groups=["notes"], disabled_tools=["read_guide"]
    )[0]["content"]
    assert "guide tool" in generic
    assert "guide_index" not in generic


def test_guide_api_index_topic_and_search(client):
    index = client.get("/api/guide/index")
    assert index.status_code == 200
    payload = index.json()
    assert payload["title"] == "Aether Guide"
    assert any(topic["id"] == "voice" for topic in payload["topics"])

    topic = client.get("/api/guide/topics/voice")
    assert topic.status_code == 200
    body = topic.json()
    assert body["id"] == "voice"
    assert "Phonon-2" in body["content"]
    assert body["related"]

    search = client.get("/api/guide/search", params={"q": "tavily"})
    assert search.status_code == 200
    assert search.json()["results"][0]["id"] == "web-search"


def test_guide_api_rejects_unknown_and_traversal_ids(client):
    assert client.get("/api/guide/topics/not-a-topic").status_code == 404
    assert client.get("/api/guide/topics/..%2F..%2Fsecret").status_code == 404
    assert client.get("/api/guide/search", params={"q": ""}).json()["results"] == []


def test_main_registers_the_guide_api():
    from backend.main import app

    paths = set(app.openapi().get("paths", {}))
    assert "/api/guide/index" in paths
    assert "/api/guide/topics/{topic_id}" in paths
    assert "/api/guide/search" in paths
