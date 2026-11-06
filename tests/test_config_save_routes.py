import pytest
from httpx import AsyncClient

from tests.route_fakes import FakeMoonraker, install_fakes

QUERY_PATH = "/printer/objects/query"
GCODE_PATH = "/printer/gcode/script"
WAITING = {"bltouch": {"z_offset": "-2.400"}}
RUNNING = {"bltouch": {"z_offset": -2.35}}


def printer(state: str = "standby", pending: dict | None = None) -> FakeMoonraker:
    configfile = {"save_config_pending": bool(pending), "save_config_pending_items": pending or {}, "settings": RUNNING}
    return FakeMoonraker({QUERY_PATH: {"status": {"print_stats": {"state": state}, "configfile": configfile}}})


def scripts(moonraker: FakeMoonraker) -> list[str]:
    return [data["script"] for path, data in moonraker.posted if path == GCODE_PATH]


async def test_the_changes_that_wait_to_be_saved_are_listed(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=printer(pending=WAITING))
    response = await client.get("/api/control/config/pending")
    assert response.json() == {
        "pending": True,
        "changes": [{"section": "bltouch", "key": "z_offset", "old": "-2.35", "new": "-2.400"}],
    }


async def test_a_printer_with_nothing_to_save_says_so(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=printer())
    assert (await client.get("/api/control/config/pending")).json() == {"pending": False, "changes": []}


async def test_a_printer_that_does_not_answer_gives_a_502(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=FakeMoonraker({QUERY_PATH: RuntimeError("offline")}))
    response = await client.get("/api/control/config/pending")
    assert (response.status_code, response.json()["detail"]) == (502, "offline")


async def test_saving_runs_save_config_and_tells_the_power_that_the_restart_is_expected(
    client: AsyncClient, monkeypatch, printer_power
):
    moonraker = printer(pending=WAITING)
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.post("/api/control/config/save")
    assert response.status_code == 200
    assert scripts(moonraker) == ["SAVE_CONFIG"]
    assert printer_power.calls == ["note_expected_restart"]


async def test_saving_with_nothing_waiting_is_refused(client: AsyncClient, monkeypatch, printer_power):
    moonraker = printer()
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.post("/api/control/config/save")
    assert (response.status_code, response.json()["detail"]) == (409, "Nothing is waiting to be saved")
    assert (scripts(moonraker), printer_power.calls) == ([], [])


@pytest.mark.parametrize("state", ["printing", "paused"])
async def test_saving_is_locked_during_a_print(client: AsyncClient, monkeypatch, printer_power, state):
    moonraker = printer(state, WAITING)
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.post("/api/control/config/save")
    assert (response.status_code, response.json()["detail"]) == (409, "Locked while the printer is printing")
    assert (moonraker.posted, printer_power.calls) == ([], [])


async def test_a_printer_that_refuses_the_save_is_a_502_and_the_restart_is_not_expected(
    client: AsyncClient, monkeypatch, printer_power
):
    moonraker = printer(pending=WAITING)
    moonraker.failure = RuntimeError("refused")
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.post("/api/control/config/save")
    assert response.status_code == 502
    assert printer_power.calls == []
