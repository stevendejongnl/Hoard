from httpx import AsyncClient

from app.db import default_database
from tests.route_fakes import FakeMoonraker, install_fakes


def create_printer() -> FakeMoonraker:
    return FakeMoonraker(
        {
            "/machine/system_info": {"system_info": {"cpu_info": {"model": "Raspberry Pi 3"}}},
            "/machine/proc_stats": {"cpu_temp": 40.0},
            "/server/info": {"klippy_state": "ready", "moonraker_version": "v1"},
            "/printer/info": {"state": "ready", "software_version": "v2"},
            "/printer/objects/list": {"objects": ["mcu", "toolhead", "gcode_macro PARK", "webhooks"]},
            "/printer/objects/query": {"status": {"mcu": {"mcu_version": "v3", "mcu_constants": {"MCU": "stm32"}}}},
        }
    )


async def test_the_system_route_returns_the_sections(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=create_printer())
    response = await client.get("/api/system")
    assert response.status_code == 200
    body = response.json()
    assert body["reachable"] is True
    assert "host" in [section["key"] for section in body["sections"]]


async def test_it_asks_only_for_the_objects_it_can_show(client: AsyncClient, monkeypatch):
    printer = create_printer()
    install_fakes(monkeypatch, moonraker=printer)
    await client.get("/api/system")
    asked = next(params for path, params in printer.asked if path == "/printer/objects/query")
    assert set(asked) == {"mcu", "toolhead"}


async def test_part_of_the_answers_failing_still_shows_the_rest(client: AsyncClient, monkeypatch):
    printer = create_printer()
    printer.answers["/printer/objects/list"] = RuntimeError("Klipper is off")
    install_fakes(monkeypatch, moonraker=printer)
    body = (await client.get("/api/system")).json()
    assert body["reachable"] is True
    assert "host" in [section["key"] for section in body["sections"]]


async def test_a_host_that_does_not_answer_is_reported(client: AsyncClient, monkeypatch):
    answers = {
        path: RuntimeError("No route to host")
        for path in ("/machine/system_info", "/machine/proc_stats", "/server/info", "/printer/info")
    }
    install_fakes(monkeypatch, moonraker=FakeMoonraker(answers))
    body = (await client.get("/api/system")).json()
    assert body["reachable"] is False
    assert body["sections"] == []
    assert [fault["key"] for fault in body["active_faults"]] == ["host.unreachable"]


async def test_the_route_returns_the_active_faults_and_the_history(client: AsyncClient, monkeypatch):
    printer = create_printer()
    printer.answers["/printer/info"] = {"state": "shutdown", "state_message": "Timer too close"}
    install_fakes(monkeypatch, moonraker=printer)
    await default_database.record_system_faults(
        [{"key": "host.under_voltage", "severity": "error", "source": "Host", "title": "Under-voltage", "detail": ""}],
        now=100,
    )
    body = (await client.get("/api/system")).json()
    assert [fault["key"] for fault in body["active_faults"]] == ["klipper.shutdown"]
    assert [fault["key"] for fault in body["fault_history"]] == ["host.under_voltage"]


async def test_hidden_rows_are_saved_on_the_server(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=create_printer())
    response = await client.put("/api/system/hidden", json={"keys": ["host.uptime", "fans"]})
    assert response.status_code == 200
    body = (await client.get("/api/system")).json()
    assert sorted(body["hidden"]) == ["fans", "host.uptime"]
