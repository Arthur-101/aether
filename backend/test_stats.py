"""Tests for the Stats telemetry helpers and the speed-test runner."""

import time
from unittest.mock import patch

from backend.os_hooks import speed_test
from backend.os_hooks import telemetry_stats as stats
from backend.os_hooks.app_usage import group_cpu, group_ram, group_vram


def _reset_sampling(monkeypatch):
    monkeypatch.setattr(stats, "_previous", {"time": None, "disk": None, "net": None})
    monkeypatch.setattr(
        stats, "_apps_cache", {"time": 0.0, "ram": [], "vram": [], "cpu": []}
    )
    monkeypatch.setattr(stats, "_cpu_previous", {"time": 0.0, "samples": {}})


def test_top_apps_are_ranked_and_aggregated(monkeypatch):
    _reset_sampling(monkeypatch)
    apps = stats.get_top_apps(limit=4)

    assert isinstance(apps, list)
    assert 0 < len(apps) <= 4
    rams = [app["ram_mb"] for app in apps]
    assert rams == sorted(rams, reverse=True)
    assert all(app["processes"] >= 1 for app in apps)
    assert all(set(app) == {"name", "ram_mb", "processes"} for app in apps)


def test_top_apps_are_cached(monkeypatch):
    _reset_sampling(monkeypatch)
    first = stats.get_top_apps(limit=3)
    second = stats.get_top_apps(limit=3)
    assert second == first


def test_group_apps_merges_multi_process_apps():
    entries = [
        ("brave.exe", 300 * 1024 ** 2, 0, 1),
        ("brave.exe", 200 * 1024 ** 2, 0, 2),
        ("Code.exe", 900 * 1024 ** 2, 0, 3),
        ("", 10 * 1024 ** 2, 0, 4),
        ("renderer.exe", 10 * 1024 ** 2, 0, 5),
    ]
    apps = group_ram(entries, limit=2)

    assert [app["name"] for app in apps] == ["Code", "brave"]
    assert apps[0]["ram_mb"] == 900.0
    assert apps[1]["ram_mb"] == 500.0
    assert apps[1]["processes"] == 2


def test_group_vram_sums_dedicated_memory_by_app():
    entries = [
        ("game.exe", 0, 0, 10),
        ("game.exe", 0, 0, 11),
        ("browser.exe", 0, 0, 12),
        ("idle.exe", 0, 0, 13),
    ]
    vram = {
        10: 512 * 1024 ** 2,
        11: 256 * 1024 ** 2,
        12: 128 * 1024 ** 2,
        13: 0,
    }

    apps = group_vram(entries, vram, limit=5)

    assert apps[0] == {"name": "game", "vram_mb": 768.0, "processes": 2}
    assert [app["name"] for app in apps] == ["game", "browser"]


def test_group_cpu_reports_share_of_all_cores():
    # One second of CPU on each of two processes over a one-second window on
    # four threads is 25% of the machine each, 50% grouped.
    entries = [
        ("app.exe", 0, 10_000_000, 1),
        ("app.exe", 0, 10_000_000, 2),
        ("idle.exe", 0, 5_000_000, 3),
    ]
    apps = group_cpu(entries, {1: 0, 2: 0, 3: 0}, elapsed=1.0, threads=4, limit=5)
    by_name = {app["name"]: app for app in apps}

    assert by_name["app"]["cpu_percent"] == 50.0
    assert by_name["app"]["processes"] == 2
    assert by_name["idle"]["cpu_percent"] == 12.5


def test_group_cpu_skips_new_processes_without_a_baseline():
    entries = [("new.exe", 0, 10_000_000, 99)]

    assert group_cpu(entries, {}, elapsed=1.0, threads=4, limit=5) == []


def test_failed_process_sample_keeps_the_last_one(monkeypatch):
    _reset_sampling(monkeypatch)
    cached = [{"name": "kept", "ram_mb": 12.0, "processes": 1}]
    monkeypatch.setattr(
        stats,
        "_apps_cache",
        {"time": 1.0, "ram": cached, "vram": [], "cpu": []},
    )
    monkeypatch.setattr(
        stats, "process_usage", lambda: (_ for _ in ()).throw(OSError("nope"))
    )
    monkeypatch.setattr(stats.time, "monotonic", lambda: 1_000.0)

    assert stats.get_top_apps() == cached
    assert stats._apps_cache["time"] > 1_000.0


def test_process_list_reads_the_live_process_table():
    from backend.os_hooks.process_list import process_working_sets

    entries = process_working_sets()

    assert len(entries) > 10
    assert all(isinstance(name, str) and size >= 0 for name, size in entries)
    assert any(size > 0 for _, size in entries)


def test_io_rates_are_non_negative(monkeypatch):
    _reset_sampling(monkeypatch)
    first = stats._io_rates()
    time.sleep(0.05)
    second = stats._io_rates()

    expected = {"disk_read_mbps", "disk_write_mbps", "net_down_mbps", "net_up_mbps"}
    assert set(first) == expected
    assert set(second) == expected
    assert all(value >= 0 for value in second.values())


def test_uptime_is_positive():
    assert stats.get_uptime_seconds() > 0


def test_extras_carry_every_stats_field(monkeypatch):
    _reset_sampling(monkeypatch)
    extras = stats.collect_stats_extras()

    for key in (
        "disk_used_gb",
        "disk_total_gb",
        "uptime_seconds",
        "top_apps",
        "top_apps_vram",
        "top_apps_cpu",
    ):
        assert key in extras
    assert extras["disk_total_gb"] >= extras["disk_used_gb"] > 0
    # GPU fields are always present, even when NVML has nothing to report.
    for key in ("gpu_percent", "gpu_name", "gpu_vram_used_gb", "gpu_temp_c"):
        assert key in extras


def test_speed_test_success(monkeypatch):
    monkeypatch.setattr(
        speed_test, "_measure_latency", lambda: {"ping_ms": 11.5, "jitter_ms": 1.8}
    )
    monkeypatch.setattr(speed_test, "_measure_download", lambda size: 240.25)
    monkeypatch.setattr(speed_test, "_measure_upload", lambda size: 21.5)
    monkeypatch.setattr(speed_test, "_sleep", lambda seconds: None)

    result = speed_test.run_speed_test(duration_seconds=5)

    assert result["state"] == "done"
    assert result["ping_ms"] == 11.5
    assert result["jitter_ms"] == 1.8
    assert result["download_mbps"] == 240.25
    assert result["upload_mbps"] == 21.5
    assert result["server"] == "Cloudflare"
    assert result["tested_at"]
    assert result["duration_seconds"] == 5
    assert {sample["phase"] for sample in result["samples"]} == {"download", "upload"}
    assert len(result["samples"]) >= 6


def test_speed_test_streams_progress(monkeypatch):
    events = []
    monkeypatch.setattr(
        speed_test, "_measure_latency", lambda: {"ping_ms": 9.0, "jitter_ms": 0.7}
    )
    monkeypatch.setattr(speed_test, "_measure_download", lambda size: 84.5)
    monkeypatch.setattr(speed_test, "_measure_upload", lambda size: 12.25)
    monkeypatch.setattr(speed_test, "_sleep", lambda seconds: None)

    result = speed_test.run_speed_test(events.append, duration_seconds=5)

    assert result["state"] == "done"
    phases = [event["phase"] for event in events]
    assert phases[0] == "latency"
    assert "download" in phases
    assert "upload" in phases
    progress = [event["progress"] for event in events]
    assert all(0 <= value <= 1 for value in progress)
    assert progress == sorted(progress)
    assert all(event["duration_seconds"] == 5 for event in events)
    assert events[-1]["samples"] == result["samples"]
    assert events[-1]["samples"][0]["t"] >= 0
    assert result["download_mbps"] == 84.5


def test_speed_test_clamps_duration_and_scales_sample_count(monkeypatch):
    monkeypatch.setattr(
        speed_test, "_measure_latency", lambda: {"ping_ms": 8.0, "jitter_ms": 0.5}
    )
    monkeypatch.setattr(speed_test, "_measure_download", lambda size: 100.0)
    monkeypatch.setattr(speed_test, "_measure_upload", lambda size: 10.0)
    monkeypatch.setattr(speed_test, "_sleep", lambda seconds: None)

    short = speed_test.run_speed_test(duration_seconds=1)
    long = speed_test.run_speed_test(duration_seconds=90)

    assert speed_test.clamp_duration(None) == speed_test.DEFAULT_DURATION_SECONDS
    assert speed_test.clamp_duration("not a number") == speed_test.DEFAULT_DURATION_SECONDS
    assert short["duration_seconds"] == speed_test.MIN_DURATION_SECONDS
    assert long["duration_seconds"] == speed_test.MAX_DURATION_SECONDS
    assert len(long["samples"]) > len(short["samples"])


def test_speed_test_reports_failure_without_raising(monkeypatch):
    monkeypatch.setattr(
        speed_test, "_measure_latency", lambda: {"ping_ms": 9.0, "jitter_ms": 1.0}
    )

    def offline(size):
        raise RuntimeError("network unreachable")

    monkeypatch.setattr(speed_test, "_measure_download", offline)
    monkeypatch.setattr(speed_test, "_sleep", lambda seconds: None)

    result = speed_test.run_speed_test()

    assert result["state"] == "error"
    assert "network unreachable" in result["message"]
    assert result["duration_seconds"] == speed_test.DEFAULT_DURATION_SECONDS


def test_speed_test_tolerates_latency_failure(monkeypatch):
    def no_ping():
        raise RuntimeError("timeout")

    monkeypatch.setattr(speed_test, "_measure_latency", no_ping)
    monkeypatch.setattr(speed_test, "_measure_download", lambda size: 100.0)
    monkeypatch.setattr(speed_test, "_measure_upload", lambda size: 10.0)
    monkeypatch.setattr(speed_test, "_sleep", lambda seconds: None)

    result = speed_test.run_speed_test()

    assert result["state"] == "done"
    assert result["ping_ms"] is None
    assert result["jitter_ms"] is None
