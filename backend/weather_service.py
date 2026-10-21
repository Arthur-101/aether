"""
No-key weather lookup for the Clock & Tasks tab.

Uses Open-Meteo for geocoding and current conditions. Auto mode resolves an
approximate location from the network; manual mode geocodes the configured
city. Results are cached and every network failure degrades to a snapshot
instead of blocking or crashing the WebSocket loop.
"""

import json
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

from .config_manager import config_manager
from .weather_codes import condition as _condition

WEATHER_TTL_SECONDS = 10 * 60
LOCATION_TTL_SECONDS = 6 * 60 * 60
REQUEST_TIMEOUT_SECONDS = 6

_cache_lock = threading.Lock()
_weather_cache: Dict[str, Dict[str, Any]] = {}
_location_cache: Dict[str, Tuple[float, float, str, float]] = {}


class WeatherError(RuntimeError):
    """Raised when a weather provider cannot return usable data."""


def clear_weather_cache() -> None:
    """Invalidates weather/location caches after a config change."""
    with _cache_lock:
        _weather_cache.clear()
        _location_cache.clear()


def _fetch_json(url: str) -> Dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Aether/0.1 weather",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict):
        raise WeatherError("Weather provider returned an invalid response.")
    return payload


def _cached_location(key: str) -> Optional[Tuple[float, float, str, float]]:
    with _cache_lock:
        cached = _location_cache.get(key)
    if not cached:
        return None
    if time.monotonic() - cached[3] > LOCATION_TTL_SECONDS:
        return None
    return cached


def _store_location(
    key: str, latitude: float, longitude: float, label: str
) -> Tuple[float, float, str, float]:
    item = (latitude, longitude, label, time.monotonic())
    with _cache_lock:
        _location_cache[key] = item
    return item


def _geocode_city(city: str) -> Tuple[float, float, str, float]:
    query = urllib.parse.urlencode(
        {"name": city, "count": 1, "language": "en", "format": "json"}
    )
    payload = _fetch_json(f"https://geocoding-api.open-meteo.com/v1/search?{query}")
    results = payload.get("results") or []
    if not results:
        raise WeatherError(f"Could not find the city '{city}'.")
    result = results[0]
    latitude = float(result["latitude"])
    longitude = float(result["longitude"])
    label = ", ".join(
        part
        for part in (
            str(result.get("name") or city),
            str(result.get("admin1") or ""),
            str(result.get("country") or ""),
        )
        if part
    )
    return latitude, longitude, label


def _auto_location() -> Tuple[float, float, str, float]:
    payload = _fetch_json("https://ipapi.co/json/")
    latitude = payload.get("latitude")
    longitude = payload.get("longitude")
    if latitude is None or longitude is None:
        raise WeatherError("Automatic location is unavailable.")
    label = ", ".join(
        part
        for part in (
            str(payload.get("city") or ""),
            str(payload.get("region") or ""),
            str(payload.get("country_name") or ""),
        )
        if part
    )
    return float(latitude), float(longitude), label or "Current location"


def _resolve_location(clock: Dict[str, Any]) -> Tuple[float, float, str, float]:
    latitude = clock.get("weather_latitude")
    longitude = clock.get("weather_longitude")
    if isinstance(latitude, (int, float)) and isinstance(longitude, (int, float)):
        label = str(clock.get("weather_label") or "").strip() or "Saved location"
        return float(latitude), float(longitude), label, 0.0

    mode = str(clock.get("weather_mode") or "auto")
    city = str(clock.get("weather_city") or "").strip()
    cache_key = f"{mode}:{city.lower()}"
    cached = _cached_location(cache_key)
    if cached:
        return cached

    if mode == "manual" and city:
        result = _geocode_city(city)
    elif city:
        try:
            result = _auto_location()
        except Exception:
            result = _geocode_city(city)
    else:
        result = _auto_location()
    return _store_location(cache_key, *result)


def _fetch_weather(
    latitude: float, longitude: float, unit: str
) -> Dict[str, Any]:
    temperature_unit = "fahrenheit" if unit == "fahrenheit" else "celsius"
    query = urllib.parse.urlencode(
        {
            "latitude": latitude,
            "longitude": longitude,
            "current": (
                "temperature_2m,relative_humidity_2m,apparent_temperature,"
                "is_day,weather_code,wind_speed_10m"
            ),
            "temperature_unit": temperature_unit,
            "wind_speed_unit": "kmh",
            "timezone": "auto",
        }
    )
    payload = _fetch_json(f"https://api.open-meteo.com/v1/forecast?{query}")
    current = payload.get("current") or {}
    condition, icon = _condition(current.get("weather_code"))
    return {
        "temperature": round(float(current.get("temperature_2m")), 1),
        "apparent_temperature": round(
            float(current.get("apparent_temperature")), 1
        ),
        "humidity": int(current.get("relative_humidity_2m") or 0),
        "wind_kph": round(float(current.get("wind_speed_10m") or 0), 1),
        "condition": condition,
        "icon": icon,
        "is_day": bool(current.get("is_day", 1)),
    }


def _cache_key(clock: Dict[str, Any]) -> str:
    return ":".join(
        (
            str(clock.get("weather_mode") or "auto"),
            str(clock.get("weather_city") or "").strip().lower(),
            str(clock.get("weather_unit") or "celsius"),
        )
    )


def _fallback(message: str, stale: bool = False) -> Dict[str, Any]:
    return {
        "available": False,
        "stale": stale,
        "location": "",
        "temperature": None,
        "unit": "F" if config_manager.get("clock", "weather_unit") == "fahrenheit" else "C",
        "condition": "Weather unavailable",
        "icon": "cloud",
        "humidity": None,
        "wind_kph": None,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "message": message,
    }


def get_weather() -> Dict[str, Any]:
    """Returns current conditions, using cache/fallback instead of raising."""
    clock = config_manager.get("clock") or {}
    key = _cache_key(clock)
    now = time.monotonic()
    with _cache_lock:
        cached = _weather_cache.get(key)

    if cached and now - float(cached.get("_cached_at", 0)) < WEATHER_TTL_SECONDS:
        return {k: v for k, v in cached.items() if k != "_cached_at"}

    try:
        latitude, longitude, location, _ = _resolve_location(clock)
        weather = _fetch_weather(
            latitude,
            longitude,
            str(clock.get("weather_unit") or "celsius"),
        )
    except Exception as exc:
        message = f"Weather is offline: {exc}"
        if cached:
            fallback = {k: v for k, v in cached.items() if k != "_cached_at"}
            fallback.update({"stale": True, "message": message})
            return fallback
        return _fallback(message)

    unit = "F" if clock.get("weather_unit") == "fahrenheit" else "C"
    snapshot = {
        **weather,
        "available": True,
        "stale": False,
        "location": str(clock.get("weather_label") or "") or location,
        "unit": unit,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "message": "",
    }
    cache_value = {**snapshot, "_cached_at": now}
    with _cache_lock:
        _weather_cache[key] = cache_value
    return snapshot
