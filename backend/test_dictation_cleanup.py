"""Dictation cleanup must never paste a model's reasoning trace."""

from backend.ai.llm_router import LLMRouter

RAW = "The quick brown fox jumps over the lazy dog. Ether dictation is now online."


def test_clean_output_is_returned(monkeypatch):
    router = LLMRouter()
    monkeypatch.setattr(
        router,
        "chat_completion",
        lambda *args, **kwargs: {"content": "The quick brown fox jumps over the lazy dog."},
    )

    assert router.clean_dictation(RAW) == "The quick brown fox jumps over the lazy dog."


def test_reasoning_trace_falls_back_to_raw_transcript(monkeypatch):
    router = LLMRouter()
    leaked = (
        "The user wants me to clean the audio transcript. "
        "The prompt says: " + RAW + " Let me check the words again and output the "
        "cleaned text exactly as requested. The quick brown fox jumps over the lazy dog."
    )
    monkeypatch.setattr(
        router, "chat_completion", lambda *args, **kwargs: {"content": leaked}
    )

    assert router.clean_dictation(RAW) == RAW


def test_empty_completion_falls_back_to_raw_transcript(monkeypatch):
    router = LLMRouter()
    monkeypatch.setattr(
        router, "chat_completion", lambda *args, **kwargs: {"content": ""}
    )

    assert router.clean_dictation(RAW) == RAW


def test_short_conversational_dictation_is_kept(monkeypatch):
    router = LLMRouter()
    raw = "let me send the report tomorrow"
    monkeypatch.setattr(
        router,
        "chat_completion",
        lambda *args, **kwargs: {"content": "Let me send the report tomorrow."},
    )

    assert router.clean_dictation(raw) == "Let me send the report tomorrow."
