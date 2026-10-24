"""Unit tests for the cozy visualizer level shaping.

These tests never touch COM or the audio device: they exercise the pure
normalization/smoothing path that turns a session peak into the five wave
levels. The meter thread itself is only started by the media service.
"""

from backend.os_hooks.audio_levels import LINE_GAINS, AudioLevelMeter, _stem


def test_stem_normalizes_process_and_session_names() -> None:
    assert _stem("Spotify.exe") == "spotify"
    assert _stem(r"C:\Program Files\Spotify\Spotify.exe") == "spotify"
    assert _stem("spotifast.exe") == "spotifast"
    assert _stem("Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic") == (
        "microsoft.zunemusic"
    )
    assert _stem("  ") == ""


def test_silence_stays_flat() -> None:
    meter = AudioLevelMeter()
    levels, energy = meter._shape(0.0)

    assert energy == 0.0
    assert levels == [0.0] * len(LINE_GAINS)


def test_peak_is_normalized_and_ordered() -> None:
    meter = AudioLevelMeter()
    levels, energy = meter._shape(1.2)

    # Session peaks may exceed 1.0; the rolling ceiling normalizes the loudest
    # moment to 1.0 rather than clipping the visualizer at the top.
    assert energy == 1.0
    assert all(0.0 <= level <= 1.0 for level in levels)
    assert levels[0] >= levels[1] >= levels[3]
    assert levels[1] == levels[2]
    assert levels[3] == levels[4]

    second, _ = meter._shape(1.2)
    assert second[0] > levels[0]


def test_quiet_peak_is_lower_than_loud_peak() -> None:
    meter = AudioLevelMeter()
    _, loud = meter._shape(1.0)
    _, quiet = meter._shape(0.2)

    assert 0.0 < quiet < loud <= 1.0


def test_levels_decay_after_silence() -> None:
    meter = AudioLevelMeter()
    for _ in range(10):
        meter._shape(1.0)
    loud = meter._levels[0]

    for _ in range(20):
        meter._shape(0.0)

    assert meter._levels[0] < loud
    assert meter._levels[0] >= 0.0
