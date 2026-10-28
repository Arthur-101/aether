"""Streaming tests: delta accumulation, engine parsing, and draft resets."""

import asyncio
import json
import time
from types import SimpleNamespace

from backend.ai import cloud_engine, local_engine, ollama_engine
from backend.ai.llm_router import LLMRouter
from backend.ai.stream_accumulator import StreamAccumulator
from backend.chat_stream import ChatStreamBridge


def _chunk(content=None, reasoning=None, tool_calls=None):
    delta = SimpleNamespace(
        content=content,
        reasoning_content=reasoning,
        tool_calls=tool_calls or [],
    )
    return SimpleNamespace(choices=[SimpleNamespace(delta=delta)])


def test_accumulator_joins_fragmented_tool_arguments():
    acc = StreamAccumulator()

    assert acc.feed(content="Hel") == "Hel"
    acc.feed(content="lo", reasoning="because")
    acc.feed(tool_calls=[{
        "index": 0, "id": "call_a", "name": "read_note", "arguments": '{"id":',
    }])
    acc.feed(tool_calls=[{"index": 0, "arguments": ' "n1"}'}])

    assert acc.content == "Hello"
    assert acc.reasoning == "because"
    assert acc.tool_calls() == [{
        "id": "call_a",
        "type": "function",
        "function": {"name": "read_note", "arguments": '{"id": "n1"}'},
    }]


def test_cloud_stream_emits_text_and_assembles_calls():
    class FakeLiteLLM:
        @staticmethod
        def completion(**kwargs):
            assert kwargs["stream"] is True
            call = SimpleNamespace(
                index=0,
                id="call_1",
                function=SimpleNamespace(name="read_clipboard", arguments="{}"),
            )
            return [
                _chunk(content="Checking"),
                _chunk(content=" now", tool_calls=[call]),
            ]

    deltas = []
    result = cloud_engine.CloudEngine._stream_completion(
        FakeLiteLLM, {"model": "x"}, deltas.append
    )

    assert deltas == ["Checking", " now"]
    assert result["content"] == "Checking now"
    assert result["tool_calls"][0]["function"]["name"] == "read_clipboard"


def test_cloud_stream_falls_back_before_any_token():
    class FakeLiteLLM:
        @staticmethod
        def completion(**kwargs):
            raise RuntimeError("stream unsupported")

    assert cloud_engine.CloudEngine._stream_completion(
        FakeLiteLLM, {"model": "x"}, lambda text: None
    ) is None


class _FakeResponse:
    def __init__(self, lines):
        self._lines = lines

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def __iter__(self):
        return iter(self._lines)


def test_local_sse_stream(monkeypatch):
    lines = [
        b'data: {"choices":[{"delta":{"content":"Local"}}]}\n',
        b'data: {"choices":[{"delta":{"content":" answer"}}]}\n',
        b"data: [DONE]\n",
    ]
    monkeypatch.setattr(
        local_engine.urllib.request, "urlopen", lambda *a, **k: _FakeResponse(lines)
    )

    deltas = []
    result = local_engine.LocalGGUFEngine()._stream_completion(
        {"messages": []}, deltas.append
    )

    assert deltas == ["Local", " answer"]
    assert result["content"] == "Local answer"


def test_ollama_ndjson_stream(monkeypatch):
    lines = [
        json.dumps({"message": {"content": "Ollama"}, "done": False}).encode(),
        json.dumps({"message": {"content": " reply"}, "done": True}).encode(),
    ]
    monkeypatch.setattr(
        ollama_engine.urllib.request, "urlopen", lambda *a, **k: _FakeResponse(lines)
    )

    deltas = []
    result = ollama_engine.OllamaEngine()._stream_completion(
        "http://127.0.0.1:11434", {"messages": []}, deltas.append
    )

    assert deltas == ["Ollama", " reply"]
    assert result["content"] == "Ollama reply"


def test_router_discards_draft_when_round_becomes_a_tool_call(monkeypatch):
    class FakeEngine:
        def __init__(self):
            self.round = 0

        def complete(self, messages, on_token=None, **kwargs):
            self.round += 1
            if self.round == 1:
                on_token("let me check")
                return {
                    "content": "let me check",
                    "tool_calls": [{
                        "id": "call_1",
                        "type": "function",
                        "function": {"name": "read_clipboard", "arguments": "{}"},
                    }],
                }
            on_token("final answer")
            return {"content": "final answer", "tool_calls": []}

    router = LLMRouter()
    engine = FakeEngine()
    monkeypatch.setattr(router, "_engine", lambda: engine)
    monkeypatch.setattr(router, "_execute_tool", lambda *a, **k: "clipboard text")

    events = []
    result = router.chat_completion(
        [{"role": "user", "content": "hi"}],
        tools=[{"type": "function", "function": {"name": "read_clipboard"}}],
        on_stream=lambda text: events.append(("delta", text)),
        on_stream_reset=lambda: events.append(("reset", None)),
    )

    assert result["content"] == "final answer"
    assert events == [
        ("delta", "let me check"),
        ("reset", None),
        ("delta", "final answer"),
    ]


def test_router_resets_before_a_reasoning_retry(monkeypatch):
    leaked = "The user wants me to " + ("explain the thing " * 12)

    class FakeEngine:
        def __init__(self):
            self.round = 0

        def complete(self, messages, on_token=None, **kwargs):
            self.round += 1
            if self.round == 1:
                on_token(leaked)
                return {"content": leaked, "tool_calls": []}
            on_token("clean answer")
            return {"content": "clean answer", "tool_calls": []}

    router = LLMRouter()
    monkeypatch.setattr(router, "_engine", lambda: FakeEngine())

    events = []
    result = router.chat_completion(
        [{"role": "user", "content": "hi"}],
        on_stream=lambda text: events.append(("delta", text)),
        on_stream_reset=lambda: events.append(("reset", None)),
    )

    assert result["content"] == "clean answer"
    assert events == [
        ("delta", leaked),
        ("reset", None),
        ("delta", "clean answer"),
    ]


def test_bridge_coalesces_and_flushes_before_the_final_event(monkeypatch):
    async def scenario():
        events = []

        async def fake_broadcast(event_type, payload):
            events.append((event_type, payload))

        monkeypatch.setattr(
            "backend.chat_stream.ws_manager.broadcast", fake_broadcast
        )
        loop = asyncio.get_running_loop()
        bridge = ChatStreamBridge(loop, "session-1", interval=10.0)
        bridge._last_emit = time.monotonic()
        bridge.push("Hel")
        bridge.push("lo")
        await bridge.flush()

        assert events == [
            ("CHAT_STREAM_DELTA", {"session_id": "session-1", "delta": "Hello"})
        ]

        events.clear()
        bridge.push("discard me")
        bridge.reset()
        await bridge.flush()
        assert events == [
            ("CHAT_STREAM_RESET", {"session_id": "session-1"})
        ]

    asyncio.run(scenario())
