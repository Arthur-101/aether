"""espeak-ng subprocess bridge tests.

The CLI is an optional voice component, so the end-to-end checks skip when it is
not installed. Tokenisation, spacing, and the failure paths run everywhere —
those are the parts a future refactor is most likely to break silently.
"""

from pathlib import Path

import pytest

from backend.ai import espeak_g2p, tts_engine


@pytest.fixture(autouse=True)
def isolated_lookup(monkeypatch, tmp_path):
    """Keeps component probing away from the real %LOCALAPPDATA% tree."""
    monkeypatch.setenv("AETHER_COMPONENTS_DIR", str(tmp_path / "components"))
    monkeypatch.delenv("AETHER_ESPEAK_DIR", raising=False)
    espeak_g2p.reset_cache()
    yield
    espeak_g2p.reset_cache()


def _kinds(text):
    return [(kind, content) for kind, content, _ in espeak_g2p._tokenize(text)]


def test_tokenize_splits_on_clause_punctuation():
    assert _kinds("Hello, world!") == [
        ("text", "Hello"),
        ("punct", ","),
        ("text", "world"),
        ("punct", "!"),
    ]


def test_tokenize_keeps_apostrophes_inside_words():
    assert _kinds("Don't stop.") == [("text", "Don't stop"), ("punct", ".")]


def test_tokenize_treats_quotes_and_brackets_as_inline():
    segments = espeak_g2p._tokenize('She said, "This works."')
    assert ("punct", '"', True) in segments
    assert [c for k, c, _ in segments if k == "text"] == ["She said", "This works"]


def test_tokenize_collapses_whitespace():
    assert _kinds("  a \n\t b  ") == [("text", "a b")]


def test_tokenize_records_leading_space_for_each_segment():
    segments = espeak_g2p._tokenize("a, b")
    assert [(kind, gap) for kind, _, gap in segments] == [
        ("text", False),
        ("punct", False),
        ("text", True),
    ]


def test_interleave_restores_punctuation_and_spacing():
    segments = espeak_g2p._tokenize("one, two.")
    assert espeak_g2p._interleave(segments, ["wˈʌn", "tˈuː"]) == "wˈʌn, tˈuː."


def test_missing_component_raises(monkeypatch, tmp_path):
    monkeypatch.setattr(
        espeak_g2p, "_candidate_directories", lambda: [tmp_path / "absent"]
    )
    espeak_g2p.reset_cache()
    assert espeak_g2p.available() is False
    with pytest.raises(espeak_g2p.G2PUnavailable):
        espeak_g2p.phonemize("hello")


def test_missing_result_is_reprobed_after_the_window(monkeypatch, tmp_path):
    """A pack installed while the daemon runs must be picked up without a restart."""
    component_dir = tmp_path / "espeak-ng"
    component_dir.mkdir()
    (component_dir / espeak_g2p.EXECUTABLE_NAME).write_bytes(b"MZ")
    data = component_dir / espeak_g2p.DATA_DIR_NAME
    data.mkdir()
    (data / espeak_g2p.DATA_MARKER).write_bytes(b"x")

    visible = {"on": False}
    monkeypatch.setattr(
        espeak_g2p,
        "_candidate_directories",
        lambda: [component_dir] if visible["on"] else [tmp_path / "absent"],
    )
    espeak_g2p.reset_cache()
    assert espeak_g2p.available() is False

    visible["on"] = True
    # Still negative until the retry window elapses.
    assert espeak_g2p.available() is False
    espeak_g2p._probed_at -= espeak_g2p.MISSING_RETRY_S + 1
    assert espeak_g2p.available() is True


def test_executable_without_data_is_rejected(monkeypatch, tmp_path):
    """espeak segfaults on a missing data path, so it must be checked first."""
    broken = tmp_path / "broken"
    broken.mkdir()
    (broken / espeak_g2p.EXECUTABLE_NAME).write_bytes(b"MZ")
    monkeypatch.setattr(espeak_g2p, "_candidate_directories", lambda: [broken])
    espeak_g2p.reset_cache()
    assert espeak_g2p.available() is False


def test_empty_text_never_spawns_a_process(monkeypatch):
    monkeypatch.setattr(
        espeak_g2p,
        "resolve",
        lambda: pytest.fail("empty text must not resolve the component"),
    )
    assert espeak_g2p.phonemize("") == ""
    assert espeak_g2p.phonemize("   \n\t ") == ""


def test_engine_delegates_to_the_bridge(monkeypatch):
    seen = {}

    def fake(text):
        seen["text"] = text
        return "həlˈoʊ"

    monkeypatch.setattr(espeak_g2p, "phonemize", fake)
    engine = tts_engine.LocalTTSEngine()
    assert engine.phonemize("hello") == "həlˈoʊ"
    assert seen["text"] == "hello"


def test_engine_no_longer_imports_gpl_packages():
    source = Path(tts_engine.__file__).read_text(encoding="utf-8")
    assert "phonemizer" not in source
    assert "espeakng_loader" not in source


needs_component = pytest.mark.skipif(
    not espeak_g2p.available(), reason="espeak-ng voice component not installed"
)


@needs_component
def test_phonemize_keeps_punctuation_and_single_line():
    result = espeak_g2p.phonemize("Hello, world! How are you today?")
    assert result.startswith("həlˈoʊ")
    assert "," in result and "!" in result and result.endswith("?")
    assert "\n" not in result


@needs_component
def test_phonemize_survives_control_characters():
    result = espeak_g2p.phonemize("hello\x00 world\x07")
    assert result and "hello" not in result


@needs_component
def test_phonemize_matches_expected_stress_for_a_sentence():
    """Sentence-level stress must survive clause splitting."""
    result = espeak_g2p.phonemize("The API returns JSON, not XML.")
    assert "nˌɑːt" in result or "nˈɑːt" in result
    assert result.count(",") == 1
