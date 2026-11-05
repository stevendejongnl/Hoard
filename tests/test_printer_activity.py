from typing import Any

from app.auto_power_off import PrinterActivity, read_printer_activity


class FakeKlipper:
    def __init__(self, answer: Any) -> None:
        self.answer = answer

    async def get(self, path: str, **params: Any) -> Any:
        if isinstance(self.answer, Exception):
            raise self.answer
        assert path == "/printer/objects/query"
        return self.answer


HEATERS = {"status": {"extruder": {"temperature": 31.2}, "heater_bed": {"temperature": 28.0}}}


async def test_the_activity_is_the_print_state_the_heaters_and_the_switch():
    activity = await read_printer_activity(
        FakeKlipper(HEATERS), lambda: {"state": "complete"}, lambda: {"switch": "on"}
    )
    assert activity == PrinterActivity("complete", [31.2, 28.0], True)


async def test_a_switch_that_is_off_or_unknown_is_not_on():
    for switch in ("off", "unknown", None):
        activity = await read_printer_activity(FakeKlipper(HEATERS), lambda: {}, lambda s=switch: {"switch": s})
        assert activity.switch_on is False


async def test_a_printer_that_does_not_answer_has_no_heater_readings_and_is_not_busy():
    activity = await read_printer_activity(
        FakeKlipper(ConnectionError("off")), lambda: {"state": "standby"}, lambda: {"switch": "on"}
    )
    assert activity == PrinterActivity("standby", [], True)
