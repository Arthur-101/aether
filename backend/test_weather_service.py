"""Weather service caching and offline degradation tests (no real network)."""

from backend import weather_service


class _Config:
    def __init__(self, clock):
        self.clock = clock

    def get(self, section, key=None):
        if section == "clock":
            return self.clock if key is None else self.clock.get(key)
        return None


def _fake_provider(url):
    if "geocoding-api" in url:
        return {
            "results": [
                {"name": "London", "admin1": "England", "country": "UK", "latitude": 51.5, "longitude": -0.1}
            ]
        }
    return {
        "current": {
            "temperature_2m": 14.4,
            "apparent_temperature": 13.1,
            "relative_humidity_2m": 71,
            "wind_speed_10m": 12.2,
            "weather_code": 2,
            "is_day": 1,
        }
    }


def test_manual_weather_snapshot(monkeypatch):
    weather_service.clear_weather_cache()
    monkeypatch.setattr(
        weather_service,
        "config_manager",
        _Config({"weather_mode": "manual", "weather_city": "London", "weather_unit": "celsius"}),
    )
    monkeypatch.setattr(weather_service, "_fetch_json", _fake_provider)

    snapshot = weather_service.get_weather()

    assert snapshot["available"] is True
    assert snapshot["location"] == "London, England, UK"
    assert snapshot["temperature"] == 14.4
    assert snapshot["condition"] == "Partly cloudy"
    assert snapshot["unit"] == "C"


def test_weather_failure_returns_offline_snapshot(monkeypatch):
    weather_service.clear_weather_cache()
    monkeypatch.setattr(
        weather_service,
        "config_manager",
        _Config({"weather_mode": "manual", "weather_city": "London", "weather_unit": "fahrenheit"}),
    )

    def fail(_url):
        raise OSError("network down")

    monkeypatch.setattr(weather_service, "_fetch_json", fail)

    snapshot = weather_service.get_weather()

    assert snapshot["available"] is False
    assert snapshot["stale"] is False
    assert snapshot["unit"] == "F"
    assert "offline" in snapshot["message"].lower()


def test_weather_failure_after_cache_returns_stale_snapshot(monkeypatch):
    weather_service.clear_weather_cache()
    monkeypatch.setattr(
        weather_service,
        "config_manager",
        _Config({"weather_mode": "manual", "weather_city": "London", "weather_unit": "celsius"}),
    )
    monkeypatch.setattr(weather_service, "_fetch_json", _fake_provider)
    first = weather_service.get_weather()
    assert first["available"] is True

    with weather_service._cache_lock:
        for cached in weather_service._weather_cache.values():
            cached["_cached_at"] = 0

    def fail(_url):
        raise OSError("network down")

    monkeypatch.setattr(weather_service, "_fetch_json", fail)
    stale = weather_service.get_weather()

    assert stale["available"] is True
    assert stale["stale"] is True
    assert stale["location"] == "London, England, UK"
