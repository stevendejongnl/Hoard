from dataclasses import replace
from typing import Any

import pytest

from app.detection_monitor import DetectionMonitor
from app.detection_settings import DetectionSettings
from app.spaghetti_watch import WatchStatus
from app.system_faults import check_system_faults


class StopTestError(Exception):
    """Raised by the fake sleep to end the loop."""


class FakeWatcher:
    def __init__(self, statuses: list[WatchStatus | Exception]) -> None:
        self.statuses = list(statuses)
        self.printer_states: list[dict[str, Any]] = []

    async def check(self, printer_state: dict[str, Any]) -> WatchStatus:
        self.printer_states.append(printer_state)
        status = self.statuses.pop(0)
        if isinstance(status, Exception):
            raise status
        return status


class FakeHub:
    def __init__(self) -> None:
        self.announced: list[tuple[str, dict[str, Any]]] = []

    async def broadcast(self, kind: str, data: dict[str, Any]) -> None:
        self.announced.append((kind, data))


class FakeSleep:
    def __init__(self, runs: int) -> None:
        self.runs = runs
        self.slept: list[float] = []

    async def __call__(self, seconds: float) -> None:
        self.slept.append(seconds)
        if len(self.slept) >= self.runs:
            raise StopTestError


def make_monitor(statuses: list[WatchStatus | Exception], runs: int, settings: DetectionSettings | None = None):
    watcher, hub, sleep = FakeWatcher(statuses), FakeHub(), FakeSleep(runs)

    async def load_settings() -> DetectionSettings:
        return settings or DetectionSettings()

    monitor = DetectionMonitor(watcher, lambda: {"state": "printing"}, load_settings, hub, sleep)
    return monitor, watcher, hub, sleep


async def test_each_round_judges_the_current_printer_state_and_announces_the_status():
    monitor, watcher, hub, _ = make_monitor([WatchStatus("watching", score=0.2)], runs=1)
    with pytest.raises(StopTestError):
        await monitor.run()
    assert watcher.printer_states == [{"state": "printing"}]
    assert hub.announced == [("detection", {"state": "watching", "score": 0.2})]


async def test_the_wait_between_rounds_is_the_interval_setting():
    monitor, _, _, sleep = make_monitor(
        [WatchStatus("idle")], runs=1, settings=replace(DetectionSettings(), interval_seconds=25)
    )
    with pytest.raises(StopTestError):
        await monitor.run()
    assert sleep.slept == [25]


async def test_a_round_that_fails_does_not_stop_the_loop():
    monitor, _, hub, sleep = make_monitor([RuntimeError("boom"), WatchStatus("idle")], runs=2)
    with pytest.raises(StopTestError):
        await monitor.run()
    assert len(sleep.slept) == 2
    assert hub.announced == [("detection", {"state": "idle", "score": None})]


async def test_there_is_no_fault_while_the_print_looks_fine():
    monitor, _, _, _ = make_monitor([WatchStatus("watching", score=0.1)], runs=1)
    with pytest.raises(StopTestError):
        await monitor.run()
    assert monitor.faults() == []


async def test_an_alert_is_a_fault_for_as_long_as_it_lasts():
    monitor, _, _, _ = make_monitor([WatchStatus("alert", score=0.84)], runs=1)
    with pytest.raises(StopTestError):
        await monitor.run()
    [fault] = monitor.faults()
    assert (fault["key"], fault["severity"], fault["source"]) == ("detection.failure", "error", "Detection")
    assert "84" in fault["detail"]


async def test_the_fault_check_includes_the_faults_of_the_monitor():
    stored: list[list[dict[str, Any]]] = []

    class FakeDatabase:
        async def record_system_faults(self, faults: list[dict[str, Any]], now: int) -> None:
            stored.append(faults)

        async def prune_system_faults(self) -> None:
            return None

    async def read_readings() -> dict[str, Any]:
        return {"reachable": False}

    extra = {"key": "detection.failure", "severity": "error", "source": "Detection", "title": "t", "detail": ""}
    await check_system_faults(read_readings, FakeDatabase(), FakeHub(), read_extra_faults=lambda: [extra])
    assert [fault["key"] for fault in stored[0]] == ["host.unreachable", "detection.failure"]
