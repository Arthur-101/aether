"""Tests for the Stats telemetry helpers and the speed-test runner."""

import time
from unittest.mock import patch

from backend.os_hooks import speed_test
from backend.os_hooks import telemetry_stats as stats


def _reset_sampling(monkeypatch):
    monkeypatch.setattr(stats, "_previous", {"time": None, "disk": None, "net": None})
    monkeypatch.setattr(stats, "_apps_cache", {"time": 0.0, "apps": []})


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

    for key in ("disk_used_gb", "disk_total_gb", "uptime_seconds", "top_apps"):
        assert key in extras
    assert extras["disk_total_gb"] >= extras["disk_used_gb"] > 0
    # GPU fields are always present, even when NVML has nothing to report.
    for key in ("gpu_percent", "gpu_name", "gpu_vram_used_gb", "gpu_temp_c"):
        assert key in extras


def test_speed_test_success(monkeypatch):
    monkeypatch.setattr(speed_test, "_measure_latency", lambda: 11.5)
    monkeypatch.setattr(speed_test, "_measure_download", lambda size: 240.25)
    monkeypatch.setattr(speed_test, "_measure_upload", lambda size: 21.5)

    result = speed_test.run_speed_test()

    assert result["state"] == "done"
    assert result["ping_ms"] == 11.5
    assert result["download_mbps"] == 240.25
    assert result["upload_mbps"] == 21.5
    assert result["server"] == "Cloudflare"
    assert result["tested_at"]


def test_speed_test_reports_failure_without_raising(monkeypatch):
    monkeypatch.setattr(speed_test, "_measure_latency", lambda: 9.0)

    def offline(size):
        raise RuntimeError("network unreachable")

    monkeypatch.setattr(speed_test, "_measure_download", offline)

    result = speed_test.run_speed_test()

    assert result["state"] == "error"
    assert "network unreachable" in result["message"]


def test_speed_test_tolerates_latency_failure(monkeypatch):
    def no_ping():
        raise RuntimeError("timeout")

    monkeypatch.setattr(speed_test, "_measure_latency", no_ping)
    monkeypatch.setattr(speed_test, "_measure_download", lambda size: 100.0)
    monkeypatch.setattr(speed_test, "_measure_upload", lambda size: 10.0)

    result = speed_test.run_speed_test()

    assert result["state"] == "done"
    assert result["ping_ms"] is None
