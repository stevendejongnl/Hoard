from app.auto_power_off import (
    AutoPowerOff,
    AutoPowerOffSettings,
    PrinterActivity,
    is_busy,
)

IDLE = PrinterActivity(print_state="standby", heater_temperatures=[22.0, 24.5], switch_on=True)


class FakeClock:
    def __init__(self, now: float = 1000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class FakePrinter:
    def __init__(self, activity: PrinterActivity = IDLE, settings: AutoPowerOffSettings | None = None) -> None:
        self.activity = activity
        self.settings = settings or AutoPowerOffSettings()
        self.power_offs = 0

    async def read_activity(self) -> PrinterActivity:
        return self.activity

    async def load_settings(self) -> AutoPowerOffSettings:
        return self.settings

    async def power_off(self) -> None:
        self.power_offs += 1


def make_auto_power_off(printer: FakePrinter, clock: FakeClock) -> AutoPowerOff:
    return AutoPowerOff(printer.read_activity, printer.load_settings, printer.power_off, clock)


def test_a_printing_or_paused_printer_is_busy():
    assert is_busy(PrinterActivity("printing", [22.0], True))
    assert is_busy(PrinterActivity("paused", [22.0], True))


def test_a_hot_heater_is_busy_and_a_cool_one_is_not():
    assert is_busy(PrinterActivity("standby", [22.0, 60.0], True))
    assert not is_busy(PrinterActivity("complete", [22.0, 44.9], True))


async def test_the_power_goes_off_after_the_idle_time_and_not_before():
    printer, clock = FakePrinter(), FakeClock()
    auto_power_off = make_auto_power_off(printer, clock)
    await auto_power_off.check()
    clock.advance(29 * 60)
    await auto_power_off.check()
    assert printer.power_offs == 0
    clock.advance(60)
    await auto_power_off.check()
    assert printer.power_offs == 1


async def test_a_busy_printer_restarts_the_idle_time():
    printer, clock = FakePrinter(), FakeClock()
    auto_power_off = make_auto_power_off(printer, clock)
    await auto_power_off.check()
    clock.advance(20 * 60)
    printer.activity = PrinterActivity("printing", [210.0], True)
    await auto_power_off.check()
    printer.activity = IDLE
    clock.advance(20 * 60)
    await auto_power_off.check()
    clock.advance(20 * 60)
    await auto_power_off.check()
    assert printer.power_offs == 0
    clock.advance(10 * 60)
    await auto_power_off.check()
    assert printer.power_offs == 1


async def test_a_printer_that_is_off_is_not_switched_off_again():
    printer, clock = FakePrinter(PrinterActivity("standby", [22.0], switch_on=False)), FakeClock()
    auto_power_off = make_auto_power_off(printer, clock)
    await auto_power_off.check()
    clock.advance(3600)
    await auto_power_off.check()
    assert printer.power_offs == 0
    assert auto_power_off.status().off_at is None


async def test_a_disabled_setting_never_switches_off():
    printer, clock = FakePrinter(settings=AutoPowerOffSettings(enabled=False)), FakeClock()
    auto_power_off = make_auto_power_off(printer, clock)
    await auto_power_off.check()
    clock.advance(3600)
    await auto_power_off.check()
    assert printer.power_offs == 0
    assert auto_power_off.status().off_at is None


async def test_the_idle_time_is_a_setting():
    printer, clock = FakePrinter(settings=AutoPowerOffSettings(idle_minutes=5)), FakeClock()
    auto_power_off = make_auto_power_off(printer, clock)
    await auto_power_off.check()
    clock.advance(5 * 60)
    await auto_power_off.check()
    assert printer.power_offs == 1


async def test_the_status_says_when_the_power_goes_off():
    printer, clock = FakePrinter(), FakeClock(1000.0)
    auto_power_off = make_auto_power_off(printer, clock)
    await auto_power_off.check()
    assert auto_power_off.status().off_at == 1000.0 + 30 * 60


async def test_postponing_moves_the_power_off_later():
    printer, clock = FakePrinter(), FakeClock()
    auto_power_off = make_auto_power_off(printer, clock)
    await auto_power_off.check()
    auto_power_off.postpone(3600)
    clock.advance(31 * 60)
    await auto_power_off.check()
    assert printer.power_offs == 0
    clock.advance(30 * 60)
    await auto_power_off.check()
    assert printer.power_offs == 1


async def test_canceling_keeps_the_power_on_until_the_printer_has_been_busy_again():
    printer, clock = FakePrinter(), FakeClock()
    auto_power_off = make_auto_power_off(printer, clock)
    await auto_power_off.check()
    auto_power_off.cancel()
    clock.advance(3600)
    await auto_power_off.check()
    assert printer.power_offs == 0
    assert auto_power_off.status().off_at is None
    printer.activity = PrinterActivity("printing", [210.0], True)
    await auto_power_off.check()
    printer.activity = IDLE
    await auto_power_off.check()
    clock.advance(30 * 60)
    await auto_power_off.check()
    assert printer.power_offs == 1
