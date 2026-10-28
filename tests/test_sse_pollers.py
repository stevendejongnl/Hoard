import asyncio
from typing import Any

from app import sse


class OnePassSleep:
    """Lets a poller run one pass, then stops it the way the application shutdown does."""

    def __init__(self, passes: int = 1) -> None:
        self.remaining = passes
        self.seconds: list[float] = []

    async def __call__(self, seconds: float) -> None:
        self.seconds.append(seconds)
        self.remaining -= 1
        if self.remaining < 0:
            raise asyncio.CancelledError


class RecordingHub:
    def __init__(self) -> None:
        self.broadcasts: list[tuple[str, dict[str, Any]]] = []

    async def broadcast(self, event: str, data: dict[str, Any]) -> None:
        self.broadcasts.append((event, data))


class FakeMoonraker:
    def __init__(self, proc_stats: Any, directory: Any, status: dict[str, Any] | None = None) -> None:
        self.proc_stats = proc_stats
        self.directory = directory
        self.status = status or {}
        self.handled: list[list[Any]] = []
        self.queries: list[tuple[str, dict[str, Any]]] = []
        self._handlers = {"notify_status_update": [self.handle]}

    async def handle(self, params: list[Any]) -> None:
        self.handled.append(params)

    async def get_proc_stats(self) -> dict[str, Any]:
        if isinstance(self.proc_stats, Exception):
            raise self.proc_stats
        return self.proc_stats

    async def get(self, path: str, **params: Any) -> Any:
        self.queries.append((path, params))
        if path == "/printer/objects/query":
            return {"status": self.status}
        if isinstance(self.directory, Exception):
            raise self.directory
        return self.directory


async def run_pi_stats(moonraker: FakeMoonraker) -> list[tuple[str, dict[str, Any]]]:
    recording_hub = RecordingHub()
    try:
        await sse._poll_pi_stats(30, moonraker_client=moonraker, event_hub=recording_hub, sleep=OnePassSleep(0))
    except asyncio.CancelledError:
        pass
    return recording_hub.broadcasts


async def test_the_pi_stats_are_rounded_and_the_disk_use_is_a_percentage() -> None:
    moonraker = FakeMoonraker(
        {
            "cpu_temp": 45.66,
            "system_memory": {"total": 1000, "used": 250},
            "system_cpu_usage": {"cpu": 12.34},
            "system_uptime": 99.9,
        },
        {"disk_usage": {"total": 200, "used": 50}},
    )
    assert await run_pi_stats(moonraker) == [
        (
            "pi_stats",
            {"cpu_temp": 45.7, "cpu_load": 12.3, "memory_pct": 25.0, "disk_pct": 25.0, "uptime_s": 99},
        )
    ]
    assert moonraker.queries == [("/server/files/directory?path=gcodes", {})]


async def test_pi_stats_without_data_are_zero_and_a_failing_disk_query_gives_zero_disk() -> None:
    moonraker = FakeMoonraker({"system_cpu_usage": 5, "system_memory": {"total": 0}}, RuntimeError("down"))
    assert await run_pi_stats(moonraker) == [
        ("pi_stats", {"cpu_temp": 0, "cpu_load": 0, "memory_pct": 0, "disk_pct": 0.0, "uptime_s": 0})
    ]


async def test_pi_stats_without_disk_size_give_zero_disk() -> None:
    moonraker = FakeMoonraker({}, {"disk_usage": {"total": 0, "used": 5}})
    ((_, payload),) = await run_pi_stats(moonraker)
    assert payload["disk_pct"] == 0.0


async def test_a_failing_proc_stats_request_broadcasts_nothing() -> None:
    assert await run_pi_stats(FakeMoonraker(RuntimeError("down"), {})) == []


class FakeHomeAssistant:
    async def get_current_power(self) -> float:
        return 118.0

    async def get_current_price(self) -> float:
        return 0.27


async def run_power_poll(read_switch_state: Any) -> list[tuple[str, dict[str, Any]]]:
    recording_hub = RecordingHub()
    try:
        await sse._poll_ha(
            30,
            home_assistant=FakeHomeAssistant(),
            event_hub=recording_hub,
            read_switch_state=read_switch_state,
            sleep=OnePassSleep(0),
        )
    except asyncio.CancelledError:
        pass
    return recording_hub.broadcasts


async def test_the_power_event_carries_watts_price_and_switch() -> None:
    async def read_switch_state() -> str:
        return "on"

    assert await run_power_poll(read_switch_state) == [("power", {"watts": 118.0, "eur_per_kwh": 0.27, "switch": "on"})]


async def test_an_unreadable_switch_is_reported_as_unknown() -> None:
    async def read_switch_state() -> str:
        raise RuntimeError("down")

    ((_, payload),) = await run_power_poll(read_switch_state)
    assert payload["switch"] == "unknown"


async def test_the_printer_state_fallback_hands_the_status_to_the_status_handlers() -> None:
    moonraker = FakeMoonraker({}, {}, status={"print_stats": {"state": "printing"}})
    sleep = OnePassSleep(1)
    try:
        await sse._poll_printer_state(10, moonraker_client=moonraker, sleep=sleep)
    except asyncio.CancelledError:
        pass
    assert sleep.seconds == [10, 10]
    assert moonraker.handled == [[{"print_stats": {"state": "printing"}}]]
