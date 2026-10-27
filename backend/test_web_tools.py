"""Web tool tests: Tavily search parsing, keyless fetch, and bounded extraction."""

import json
from urllib.error import HTTPError, URLError

from backend.mcp_tools import web_tools


class FakeResponse:
    """Context-manager stand-in for urlopen()'s response object."""

    def __init__(self, body: bytes, content_type: str = "text/html") -> None:
        self._body = body
        self.headers = {"Content-Type": content_type}

    def read(self, _n: int = -1) -> bytes:
        return self._body

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_args) -> bool:
        return False


class FakeConfig:
    def __init__(self, key: str) -> None:
        self.key = key

    def get(self, section, key=None, default=None):
        if section == "ai_provider" and key == "tavily_api_key":
            return self.key
        return default


def _key(monkeypatch, value: str) -> None:
    monkeypatch.setattr(web_tools, "config_manager", FakeConfig(value))


def test_web_search_without_key_explains_how_to_configure(monkeypatch):
    _key(monkeypatch, "")
    assert "Tavily API key" in web_tools.web_search("anything")


def test_web_search_parses_results(monkeypatch):
    _key(monkeypatch, "tvly-test")
    payload = {
        "results": [
            {"title": "Python", "url": "https://python.org", "content": "The Python language."},
            {"title": "Docs", "url": "https://docs.python.org", "content": "Official docs."},
        ]
    }
    monkeypatch.setattr(
        web_tools,
        "urlopen",
        lambda *_args, **_kwargs: FakeResponse(json.dumps(payload).encode(), "application/json"),
    )

    out = web_tools.web_search("python", n=2)
    assert "Web results for 'python'" in out
    assert "Python" in out and "https://python.org" in out
    assert "Official docs." in out


def test_web_search_rejects_bad_key(monkeypatch):
    _key(monkeypatch, "tvly-bad")
    error = HTTPError("https://api.tavily.com/search", 401, "Unauthorized", {}, None)
    monkeypatch.setattr(web_tools, "urlopen", lambda *_a, **_k: (_ for _ in ()).throw(error))

    assert "rejected the API key" in web_tools.web_search("python")


def test_web_search_handles_network_failure(monkeypatch):
    _key(monkeypatch, "tvly-test")
    monkeypatch.setattr(
        web_tools, "urlopen", lambda *_a, **_k: (_ for _ in ()).throw(URLError("offline"))
    )

    assert "could not reach Tavily" in web_tools.web_search("python")


def test_web_search_needs_a_query(monkeypatch):
    _key(monkeypatch, "tvly-test")
    assert "Provide a search query" in web_tools.web_search("  ")


def test_fetch_url_rejects_non_http_scheme():
    assert "http" in web_tools.fetch_url("file:///etc/passwd")
    assert "URL" in web_tools.fetch_url("not a url")


def test_fetch_url_extracts_readable_text(monkeypatch):
    html = (
        "<html><head><style>.x{}</style><script>evil()</script></head>"
        "<body><h1>Title</h1><p>Hello world.</p></body></html>"
    )
    monkeypatch.setattr(
        web_tools, "urlopen", lambda *_a, **_k: FakeResponse(html.encode(), "text/html; charset=utf-8")
    )

    out = web_tools.fetch_url("https://example.com")
    assert "Title" in out
    assert "Hello world." in out
    assert "evil()" not in out
    assert ".x{}" not in out


def test_fetch_url_truncates_long_pages(monkeypatch):
    html = "<p>" + ("word " * 6000) + "</p>"
    monkeypatch.setattr(
        web_tools, "urlopen", lambda *_a, **_k: FakeResponse(html.encode(), "text/html")
    )

    out = web_tools.fetch_url("https://example.com")
    assert "truncated" in out
    assert len(out) < web_tools.MAX_PAGE_CHARS + 200


def test_fetch_url_rejects_unsupported_content_type(monkeypatch):
    monkeypatch.setattr(
        web_tools, "urlopen", lambda *_a, **_k: FakeResponse(b"\x89PNG", "image/png")
    )
    assert "unsupported content type" in web_tools.fetch_url("https://example.com/x.png")


def test_result_count_clamps_out_of_range_values():
    assert web_tools._result_count(0) == 1
    assert web_tools._result_count(999) == web_tools.MAX_RESULTS
    assert web_tools._result_count("bad") == web_tools.DEFAULT_RESULTS


def test_web_schemas_are_registered():
    from backend.mcp_tools.server import TOOL_DISPATCH, get_openai_tool_schemas

    schema_names = {item["function"]["name"] for item in get_openai_tool_schemas()}
    expected = {"web_search", "fetch_url"}
    assert expected <= schema_names
    assert expected <= set(TOOL_DISPATCH)
