from typing import Any

import pytest

from app.printer_power import PrinterPower, watch_printer_power, without_expected_faults


class FakeKlipper:
    """Answers /printer/info from a list, one answer per call; the last one stays."""

    def __init__(self, answers: list[Any]) -> None:
        self.answers = list(answers)
        self.posted: list[str] = []

    async def get(self, path: str, **params: Any) -> Any:
        answer = self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]
        if isinstance(answer, Exception):
            raise answer
        return answer

    async def post(self, path: str, **data: Any) -> Any:
        self.posted.append(path)
        return {}


class FakeSleep:
    def __init__(self) -> None:
        self.slept: list[float] = []

    async def __call__(self, seconds: float) -> None:
        self.slept.append(seconds)


class FakeClock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


def make_power(answers: list[Any], attempts: int = 5) -> tuple[PrinterPower, FakeKlipper, FakeSleep, FakeClock]:
    klipper, sleep, clock = FakeKlipper(answers), FakeSleep(), FakeClock()
    return PrinterPower(klipper, sleep, attempts=attempts, clock=clock, grace_seconds=60), klipper, sleep, clock


async def test_a_ready_klipper_needs_no_restart():
    power, klipper, _, _ = make_power([{"state": "ready"}])
    assert await power.wait_until_ready() is True
    assert klipper.posted == []


async def test_waiting_for_a_printer_that_just_got_power_restarts_the_firmware_once_and_waits_for_ready():
    unreachable = ConnectionError("not up yet")
    power, klipper, sleep, _ = make_power(
        [unreachable, {"state": "shutdown"}, {"state": "shutdown"}, {"state": "startup"}, {"state": "ready"}]
    )
    assert await power.wait_until_ready() is True
    assert klipper.posted == ["/printer/firmware_restart"]
    assert len(sleep.slept) == 4


async def test_a_printer_that_never_gets_ready_gives_up():
    power, _, sleep, _ = make_power([{"state": "startup"}], attempts=3)
    assert await power.wait_until_ready() is False
    assert len(sleep.slept) == 3


async def test_a_switch_that_reads_off_means_the_power_off_is_expected():
    power, _, _, _ = make_power([{"state": "ready"}])
    assert not power.is_expected_off()
    power.observe("off")
    assert power.is_expected_off()
    power.observe("on")
    assert not power.is_expected_off()


async def test_a_switch_that_cannot_be_read_does_not_hide_faults():
    power, _, _, _ = make_power([{"state": "ready"}])
    power.observe("unknown")
    assert not power.is_expected_off()


async def test_the_power_cut_of_hoard_is_expected_until_the_grace_time_is_over():
    power, _, _, clock = make_power([{"state": "ready"}])
    power.note_power_cut()
    assert power.is_expected_off()
    clock.now += 59
    assert power.is_expected_off()
    clock.now += 2
    assert not power.is_expected_off()


async def test_the_power_coming_on_by_any_means_brings_klipper_back():
    power, klipper, _, _ = make_power([{"state": "shutdown"}, {"state": "ready"}])
    power.observe("off")
    power.observe("on")
    assert await power._recovery is True
    assert klipper.posted == ["/printer/firmware_restart"]


async def test_a_switch_that_was_on_all_along_starts_no_recovery():
    power, klipper, _, _ = make_power([{"state": "ready"}])
    power.observe("on")
    power.observe("on")
    assert power._recovery is None
    assert klipper.posted == []


async def test_a_switch_that_is_on_when_hoard_starts_starts_no_recovery():
    power, _, _, _ = make_power([{"state": "ready"}])
    power.observe("on")
    assert power._recovery is None


def test_while_the_power_off_is_expected_the_klipper_and_board_faults_are_left_out():
    faults = [
        {"key": "klipper.shutdown", "source": "Klipper"},
        {"key": "board.mcu.invalid_bytes", "source": "mcu"},
        {"key": "host.under_voltage", "source": "Host"},
    ]
    kept = without_expected_faults(faults, expected_off=True)
    assert [fault["key"] for fault in kept] == ["host.under_voltage"]
    assert without_expected_faults(faults, expected_off=False) == faults


class StopTestError(Exception):
    """Raised by the fake sleep to end the loop."""


async def test_the_watcher_hands_the_switch_state_to_the_power_each_round():
    power, _, _, _ = make_power([{"state": "ready"}])
    states = iter(["on", "off"])
    rounds: list[float] = []

    async def read_switch_state() -> str:
        return next(states)

    async def sleep(seconds: float) -> None:
        rounds.append(seconds)
        if len(rounds) == 2:
            raise StopTestError

    with pytest.raises(StopTestError):
        await watch_printer_power(read_switch_state, power, sleep, interval=7)
    assert rounds == [7, 7]
    assert power.is_expected_off()


async def test_a_switch_that_fails_to_read_is_unknown_and_the_watcher_goes_on():
    power, _, _, _ = make_power([{"state": "ready"}])

    async def read_switch_state() -> str:
        raise ConnectionError("home assistant is down")

    async def sleep(seconds: float) -> None:
        raise StopTestError

    with pytest.raises(StopTestError):
        await watch_printer_power(read_switch_state, power, sleep)
    assert not power.is_expected_off()


def test_a_restart_that_hoard_starts_makes_the_loss_of_klipper_expected_for_a_while():
    power, _, _, clock = make_power([{"state": "ready"}])
    assert power.is_expected_off() is False
    power.note_expected_restart()
    assert power.is_expected_off() is True
    clock.now += 61
    assert power.is_expected_off() is False
