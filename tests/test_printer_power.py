from typing import Any

import pytest

from app.printer_power import PrinterPower, without_expected_faults


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


def make_power(answers: list[Any], attempts: int = 5) -> tuple[PrinterPower, FakeKlipper, FakeSleep]:
    klipper, sleep = FakeKlipper(answers), FakeSleep()
    return PrinterPower(klipper, sleep, attempts=attempts), klipper, sleep


async def test_getting_ready_for_a_power_off_shuts_klipper_down_and_marks_the_power_off_as_expected():
    power, klipper, _ = make_power([{"state": "ready"}])
    await power.prepare_power_off()
    assert klipper.posted == ["/printer/emergency_stop"]
    assert power.is_expected_off()


async def test_a_printer_that_does_not_answer_the_shutdown_is_still_marked_as_expected_off():
    power, klipper, _ = make_power([{"state": "ready"}])

    async def refuse(path: str, **data: Any) -> Any:
        raise ConnectionError("down")

    klipper.post = refuse  # type: ignore[method-assign]
    await power.prepare_power_off()
    assert power.is_expected_off()


async def test_switching_the_power_on_ends_the_expected_off():
    power, _, _ = make_power([{"state": "ready"}])
    await power.prepare_power_off()
    power.note_power_on()
    assert not power.is_expected_off()


async def test_a_ready_klipper_needs_no_restart():
    power, klipper, _ = make_power([{"state": "ready"}])
    assert await power.wait_until_ready() is True
    assert klipper.posted == []


async def test_waiting_for_a_printer_that_just_got_power_restarts_the_firmware_once_and_waits_for_ready():
    unreachable = ConnectionError("not up yet")
    power, klipper, sleep = make_power(
        [unreachable, {"state": "shutdown"}, {"state": "shutdown"}, {"state": "startup"}, {"state": "ready"}]
    )
    assert await power.wait_until_ready() is True
    assert klipper.posted == ["/printer/firmware_restart"]
    assert len(sleep.slept) == 4


async def test_a_printer_that_never_gets_ready_gives_up():
    power, _, sleep = make_power([{"state": "startup"}], attempts=3)
    assert await power.wait_until_ready() is False
    assert len(sleep.slept) == 3


def test_while_the_power_off_is_expected_the_klipper_and_board_faults_are_left_out():
    faults = [
        {"key": "klipper.shutdown", "source": "Klipper"},
        {"key": "board.mcu.invalid_bytes", "source": "mcu"},
        {"key": "host.under_voltage", "source": "Host"},
    ]
    kept = without_expected_faults(faults, expected_off=True)
    assert [fault["key"] for fault in kept] == ["host.under_voltage"]
    assert without_expected_faults(faults, expected_off=False) == faults


@pytest.mark.parametrize("state", ["error", "shutdown"])
async def test_an_unexpected_loss_of_power_is_still_a_fault_when_nothing_marked_it(state: str):
    power, _, _ = make_power([{"state": state}])
    assert not power.is_expected_off()
