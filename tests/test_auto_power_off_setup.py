import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from app.auto_power_off import watch_auto_power_off
from app.auto_power_off_setup import build_auto_power_off
from app.config import Settings
from app.db import Database
from tests.route_fakes import FakePrinterPower, recording_client_factory

PRINTER_ONLY = Settings(ha_power_switch="switch.plug", ha_switches="", ha_url="http://ha.test", ha_token="t")
PRINTER_ON_A_PI = Settings(
    ha_power_switch="switch.plug",
    ha_switches='[{"label": "Pi", "entity": "switch.pi"}, {"label": "Printer power", "printer": true, "requires": "Pi"}]',
    ha_url="http://ha.test",
    ha_token="t",
)


class FakeHub:
    def __init__(self, printer_state: dict[str, Any], power: dict[str, Any]) -> None:
        self.values = {"printer_state": printer_state, "power": power}

    def last_value(self, event: str) -> dict[str, Any]:
        return self.values.get(event, {})


class FakeKlipper:
    async def get(self, path: str, **params: Any) -> Any:
        return {"status": {"extruder": {"temperature": 25.0}, "heater_bed": {"temperature": 24.0}}}


class FakeClock:
    now = 0.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
async def database(tmp_path: Path) -> Database:
    database = Database(str(tmp_path / "hoard.db"))
    await database.initialise()
    return database


def make_auto_power_off(database: Database, app_settings: Settings, requests: list[httpx.Request], power=None):
    clock = FakeClock()
    hub = FakeHub({"state": "standby"}, {"switch": "on"})
    factory = recording_client_factory(requests)
    auto = build_auto_power_off(database, hub, FakeKlipper(), power or FakePrinterPower(), app_settings, factory, clock)
    return auto, clock


async def test_an_idle_printer_is_switched_off_through_home_assistant_and_the_power_cut_is_noted(database: Database):
    requests: list[httpx.Request] = []
    power = FakePrinterPower()
    auto, clock = make_auto_power_off(database, PRINTER_ONLY, requests, power)
    await auto.check()
    clock.now = 31 * 60
    await auto.check()
    assert power.calls == ["note_power_cut"]
    assert requests[0].url.path == "/api/services/homeassistant/turn_off"
    assert json.loads(requests[0].content) == {"entity_id": "switch.plug"}


async def test_only_the_printer_switch_is_cut_and_not_what_it_needs(database: Database):
    requests: list[httpx.Request] = []
    auto, clock = make_auto_power_off(database, PRINTER_ON_A_PI, requests)
    await auto.check()
    clock.now = 31 * 60
    await auto.check()
    assert [json.loads(request.content)["entity_id"] for request in requests] == ["switch.plug"]


async def test_the_stored_settings_decide_when_the_power_goes_off(database: Database):
    await database.save_auto_power_off_settings({"idle_minutes": 5})
    requests: list[httpx.Request] = []
    auto, clock = make_auto_power_off(database, PRINTER_ONLY, requests)
    await auto.check()
    clock.now = 5 * 60
    await auto.check()
    assert len(requests) == 1


class StopTestError(Exception):
    """Raised by the fake sleep to end the loop."""


async def test_the_watcher_checks_every_round_and_goes_on_after_an_error():
    checks = 0

    class FlakyAutoPowerOff:
        async def check(self) -> None:
            nonlocal checks
            checks += 1
            if checks == 1:
                raise ConnectionError("moonraker is down")

    slept: list[float] = []

    async def sleep(seconds: float) -> None:
        slept.append(seconds)
        if len(slept) == 2:
            raise StopTestError

    with pytest.raises(StopTestError):
        await watch_auto_power_off(FlakyAutoPowerOff(), sleep, interval=9)
    assert (checks, slept) == (2, [9, 9])
