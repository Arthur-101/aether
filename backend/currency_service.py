"""
Daily exchange rates for the island calculator's Currency mode.

Uses the keyless open.er-api.com daily table, cached in
``%APPDATA%/Aether/data/currency_rates.json`` so the converter keeps working
offline. A cached table is always served first; a stale one is refreshed in the
background so a slow or unreachable provider never delays a lookup. The network
is only ever hit when there is no usable file, or once a day after that.
"""

import json
import logging
import os
import threading
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from .config_manager import get_data_dir

logger = logging.getLogger("aether.currency")

RATES_URL = "https://open.er-api.com/v6/latest/USD"
CACHE_FILE_NAME = "currency_rates.json"
CACHE_TTL_SECONDS = 24 * 60 * 60
REQUEST_TIMEOUT_SECONDS = 6

_lock = threading.Lock()
_refreshing = False
_cache: Optional[Dict[str, Any]] = None


class CurrencyError(RuntimeError):
    """Raised when no rate table can be produced at all."""


def cache_path() -> Path:
    """Returns the state file the daily table is kept in."""
    return get_data_dir() / CACHE_FILE_NAME


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _fetch_json(url: str) -> Dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Aether/0.1 currency",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict):
        raise CurrencyError("Exchange rate provider returned an invalid response.")
    return payload


def _clean_table(raw: Any, fetched_at: str) -> Optional[Dict[str, Any]]:
    """Keeps only a complete USD table; a partial payload is treated as no data."""
    if not isinstance(raw, dict):
        return None
    rates = raw.get("rates")
    if not isinstance(rates, dict):
        return None
    clean = {
        str(code).upper(): float(rate)
        for code, rate in rates.items()
        if isinstance(rate, (int, float)) and rate > 0
    }
    if len(clean) < 2:
        return None
    base = str(raw.get("base") or "USD").upper()
    clean.setdefault(base, 1.0)
    return {"base": base, "rates": clean, "fetched_at": fetched_at}


def _age_seconds(fetched_at: Any) -> Optional[float]:
    """Age of the cached table, or None when the stamp is missing or unreadable."""
    if not isinstance(fetched_at, str) or not fetched_at:
        return None
    try:
        stamp = datetime.fromisoformat(fetched_at)
    except ValueError:
        return None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - stamp).total_seconds()


def _is_stale(table: Dict[str, Any]) -> bool:
    age = _age_seconds(table.get("fetched_at"))
    return age is None or age >= CACHE_TTL_SECONDS


def _read_cache() -> Optional[Dict[str, Any]]:
    """Returns the cached table, or None when the file is missing or unusable."""
    global _cache
    with _lock:
        if _cache is not None:
            return _cache
    try:
        raw = json.loads(cache_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    table = _clean_table(raw, str(raw.get("fetched_at") or "") if isinstance(raw, dict) else "")
    if table is None:
        return None
    with _lock:
        _cache = table
    return table


def _write_cache(table: Dict[str, Any]) -> None:
    """Writes atomically so a crash mid-write can never truncate the table."""
    global _cache
    path = cache_path()
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(json.dumps(table, ensure_ascii=False), encoding="utf-8")
    os.replace(temp, path)
    with _lock:
        _cache = table


def _refresh_blocking() -> Dict[str, Any]:
    """Fetches and stores a fresh table, or raises CurrencyError."""
    payload = _fetch_json(RATES_URL)
    table = _clean_table(payload, _now_iso())
    if table is None:
        raise CurrencyError("Exchange rate provider returned an unusable table.")
    _write_cache(table)
    return table


def _refresh_async() -> None:
    """Refreshes once in the background; concurrent callers share the pass."""
    global _refreshing
    with _lock:
        if _refreshing:
            return
        _refreshing = True

    def run() -> None:
        global _refreshing
        try:
            _refresh_blocking()
            logger.info("Exchange rates refreshed.")
        except Exception as exc:  # noqa: BLE001 - any failure keeps the old file
            logger.warning("Exchange rate refresh failed: %s", exc)
        finally:
            with _lock:
                _refreshing = False

    threading.Thread(target=run, name="currency-refresh", daemon=True).start()


def refresh_if_stale() -> None:
    """Startup pass: arms a background refresh when the file is old or absent."""
    table = _read_cache()
    if table is None or _is_stale(table):
        _refresh_async()


def get_rates() -> Dict[str, Any]:
    """Returns the USD table, serving the file and refreshing behind it.

    The only blocking network call is the very first one, when there is no file
    to fall back on; every later lookup answers from disk.
    """
    table = _read_cache()
    if table is None:
        try:
            table = _refresh_blocking()
        except Exception as exc:  # noqa: BLE001 - surfaced as a 503, not a crash
            raise CurrencyError("No exchange rates available yet.") from exc
        return _respond(table, "network")

    if _is_stale(table):
        _refresh_async()
    return _respond(table, "cache")


def _respond(table: Dict[str, Any], source: str) -> Dict[str, Any]:
    return {
        "base": table["base"],
        "rates": table["rates"],
        "fetched_at": table.get("fetched_at", ""),
        "source": source,
        "stale": _is_stale(table),
    }
