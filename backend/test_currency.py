"""Currency service caching, staleness, and offline behaviour (no real network)."""

import json

import pytest

from backend import currency_service

GOOD_PAYLOAD = {
    "result": "success",
    "base": "USD",
    "rates": {"USD": 1, "EUR": 0.91, "GBP": 0.76, "JPY": 157.2, "BAD": "x"},
}


def _isolate(monkeypatch, tmp_path, fetches):
    """Points the cache at a temp file and counts provider calls."""
    monkeypatch.setattr(currency_service, "_cache", None)
    monkeypatch.setattr(currency_service, "_refreshing", False)
    monkeypatch.setattr(currency_service, "cache_path", lambda: tmp_path / "rates.json")

    def fake_fetch(url):
        fetches.append(url)
        return GOOD_PAYLOAD

    monkeypatch.setattr(currency_service, "_fetch_json", fake_fetch)


def _write_cache(tmp_path, fetched_at):
    (tmp_path / "rates.json").write_text(
        json.dumps(
            {"base": "USD", "rates": {"USD": 1, "EUR": 0.91}, "fetched_at": fetched_at}
        ),
        encoding="utf-8",
    )


def test_clean_table_drops_junk_rates_and_fills_base():
    table = currency_service._clean_table(GOOD_PAYLOAD, "2026-01-01T00:00:00+00:00")

    assert table is not None
    assert "BAD" not in table["rates"]
    assert table["rates"]["EUR"] == 0.91

    partial = currency_service._clean_table({"rates": {"EUR": 0.91, "GBP": 0.76}}, "x")
    assert partial["base"] == "USD"
    assert partial["rates"]["USD"] == 1.0


def test_clean_table_rejects_unusable_payloads():
    assert currency_service._clean_table(None, "x") is None
    assert currency_service._clean_table({"base": "USD"}, "x") is None
    assert currency_service._clean_table({"rates": {"EUR": 0}}, "x") is None


def test_first_lookup_fetches_then_serves_from_file(monkeypatch, tmp_path):
    fetches = []
    _isolate(monkeypatch, tmp_path, fetches)

    first = currency_service.get_rates()
    second = currency_service.get_rates()

    assert first["source"] == "network"
    assert first["stale"] is False
    assert first["rates"]["EUR"] == 0.91
    assert (tmp_path / "rates.json").exists()

    # The second lookup must answer from the file without touching the network.
    assert second["source"] == "cache"
    assert len(fetches) == 1


def test_stale_file_is_served_and_refreshed_in_background(monkeypatch, tmp_path):
    fetches = []
    _isolate(monkeypatch, tmp_path, fetches)
    _write_cache(tmp_path, "2020-01-01T00:00:00+00:00")

    result = currency_service.get_rates()

    assert result["source"] == "cache"
    assert result["stale"] is True
    assert result["rates"]["EUR"] == 0.91

    # The refresh happens off the request path; wait briefly for the worker.
    deadline = 20
    while not fetches and deadline:
        import time

        time.sleep(0.05)
        deadline -= 1
    assert fetches, "a stale table must arm a background refresh"


def test_missing_or_unreadable_stamp_counts_as_stale(monkeypatch, tmp_path):
    fetches = []
    _isolate(monkeypatch, tmp_path, fetches)
    _write_cache(tmp_path, "")

    assert currency_service.get_rates()["stale"] is True


def test_failed_refresh_keeps_the_previous_table(monkeypatch, tmp_path):
    fetches = []
    _isolate(monkeypatch, tmp_path, fetches)
    _write_cache(tmp_path, "2020-01-01T00:00:00+00:00")
    before = (tmp_path / "rates.json").read_text(encoding="utf-8")

    def fail(_url):
        raise OSError("network down")

    monkeypatch.setattr(currency_service, "_fetch_json", fail)
    cached = currency_service.get_rates()
    assert cached["rates"]["EUR"] == 0.91

    import time

    time.sleep(0.2)
    assert (tmp_path / "rates.json").read_text(encoding="utf-8") == before


def test_no_file_and_no_network_raises(monkeypatch, tmp_path):
    fetches = []
    _isolate(monkeypatch, tmp_path, fetches)

    def fail(_url):
        raise OSError("network down")

    monkeypatch.setattr(currency_service, "_fetch_json", fail)

    with pytest.raises(currency_service.CurrencyError):
        currency_service.get_rates()


def test_api_returns_503_when_no_table_exists(monkeypatch, tmp_path):
    fetches = []
    _isolate(monkeypatch, tmp_path, fetches)

    def fail(_url):
        raise OSError("network down")

    monkeypatch.setattr(currency_service, "_fetch_json", fail)

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from backend import currency_api

    app = FastAPI()
    app.include_router(currency_api.router)

    response = TestClient(app).get("/api/currency")

    assert response.status_code == 503
