"""Tests for the shared-executor watchdog and fail-fast guard."""

import asyncio
import time

import pytest

from backend import executor_guard
from backend.executor_guard import (
    ExecutorCallTimeout,
    executor_health,
    run_guarded,
    start_executor_watchdog,
    stop_executor_watchdog,
)


def test_run_guarded_passes_through_the_result():
    async def go():
        return await run_guarded("guard-pass", lambda a, b: a + b, 2, 3)

    assert asyncio.run(go()) == 5


def test_run_guarded_raises_instead_of_hanging_forever():
    async def go():
        await run_guarded("guard-timeout", time.sleep, 0.3, timeout=0.05)

    with pytest.raises(ExecutorCallTimeout, match="guard-timeout"):
        asyncio.run(go())


def test_saturated_pool_rejects_work_before_submitting(monkeypatch):
    called = []

    def work():
        called.append(True)

    monkeypatch.setattr(
        executor_guard,
        "executor_health",
        lambda: {
            "saturated": True,
            "saturated_seconds": executor_guard.SATURATION_SECONDS,
        },
    )

    async def go():
        await run_guarded("guard-saturated", work)

    with pytest.raises(ExecutorCallTimeout, match="saturated"):
        asyncio.run(go())
    assert called == []


def test_executor_health_reports_pool_state():
    async def go():
        start_executor_watchdog()
        try:
            return executor_health()
        finally:
            stop_executor_watchdog()

    health = asyncio.run(go())
    assert health["check_interval_seconds"] == 2.0
    assert health["ok"] is True
    assert health["saturated"] is False
    for key in ("workers", "busy", "pending", "max_workers", "incidents", "timeouts"):
        assert isinstance(health[key], int)


def test_idle_executor_worker_is_recognised():
    from concurrent.futures import ThreadPoolExecutor
    import sys
    import time

    with ThreadPoolExecutor(max_workers=1, thread_name_prefix="guard-test") as pool:
        list(pool.map(lambda _: None, [0]))
        frame = None
        for _ in range(50):
            threads = list(pool._threads)
            frame = sys._current_frames().get(threads[0].ident) if threads else None
            if frame is not None and executor_guard._is_idle_worker(frame):
                break
            time.sleep(0.01)

    assert frame is not None
    assert executor_guard._is_idle_worker(frame) is True
