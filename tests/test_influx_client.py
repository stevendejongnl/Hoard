import asyncio
import inspect
import threading
import time
from datetime import UTC, datetime

from app.influx import InfluxClient

PUBLIC_METHODS = [
    "write_print_job",
    "delete_print_job",
    "query_history",
    "query_history_between",
    "query_by_end_time",
    "count_history",
    "write_electricity_price",
    "query_avg_price_between",
    "oldest_electricity_price",
]


class SlowQueryApi:
    def __init__(self, seconds: float) -> None:
        self.seconds = seconds
        self.thread_id: int | None = None
        self.flux = ""

    def query(self, flux: str, org: str | None = None) -> list:
        self.thread_id = threading.get_ident()
        self.flux = flux
        time.sleep(self.seconds)
        return []


class FakeConnection:
    def __init__(self, query_api: SlowQueryApi) -> None:
        self._query_api = query_api

    def query_api(self) -> SlowQueryApi:
        return self._query_api


def create_client_with_slow_queries(seconds: float) -> tuple[InfluxClient, SlowQueryApi]:
    client = InfluxClient()
    query_api = SlowQueryApi(seconds)
    client._client = FakeConnection(query_api)
    return client, query_api


def test_every_method_that_talks_to_influxdb_can_be_awaited() -> None:
    for name in PUBLIC_METHODS:
        assert inspect.iscoroutinefunction(getattr(InfluxClient, name)), name


async def test_a_slow_query_does_not_freeze_the_event_loop() -> None:
    client, _query_api = create_client_with_slow_queries(0.4)
    ticks: list[float] = []

    async def tick() -> None:
        for _ in range(8):
            ticks.append(time.monotonic())
            await asyncio.sleep(0.05)

    await asyncio.gather(client.query_history(limit=3), tick())
    longest_gap = max(later - earlier for earlier, later in zip(ticks, ticks[1:], strict=False))
    assert longest_gap < 0.2


async def test_a_query_runs_on_a_worker_thread() -> None:
    client, query_api = create_client_with_slow_queries(0.01)
    await client.query_history(limit=3)
    assert query_api.thread_id is not None
    assert query_api.thread_id != threading.get_ident()


async def test_the_history_between_two_moments_asks_influxdb_for_that_period_only() -> None:
    client, query_api = create_client_with_slow_queries(0.0)
    await client.query_history_between(
        datetime(2026, 10, 28, 12, 0, 0, tzinfo=UTC), datetime(2026, 10, 28, 15, 30, 0, tzinfo=UTC)
    )
    assert "range(start: 2026-10-28T12:00:00Z, stop: 2026-10-28T15:30:00Z)" in query_api.flux
    assert "limit(" not in query_api.flux
