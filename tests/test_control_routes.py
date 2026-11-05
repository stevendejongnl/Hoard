import json

import httpx
import pytest
from httpx import AsyncClient

from app.config import settings
from app.routes.dependencies import provide_http_client_factory
from tests.route_fakes import (
    FakeHomeAssistant,
    FakeMoonraker,
    install_fakes,
    override_provider,
    recording_client_factory,
)

CLOSED_ADDRESS = "http://127.0.0.1:1"

COMMANDS = [
    ("/api/control/restart", "/printer/restart"),
    ("/api/control/firmware_restart", "/printer/firmware_restart"),
    ("/api/control/emergency_stop", "/printer/emergency_stop"),
    ("/api/control/pause", "/printer/print/pause"),
    ("/api/control/resume", "/printer/print/resume"),
    ("/api/control/cancel", "/printer/print/cancel"),
]


@pytest.mark.parametrize(("route", "printer_path"), COMMANDS)
async def test_a_command_is_posted_to_the_printer(client: AsyncClient, monkeypatch, route, printer_path):
    moonraker = FakeMoonraker()
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.post(route)
    assert (response.status_code, response.json()) == (200, {"ok": True})
    assert moonraker.posted == [(printer_path, {})]


@pytest.mark.parametrize(("route", "printer_path"), COMMANDS)
async def test_a_command_the_printer_refuses_is_a_502(client: AsyncClient, monkeypatch, route, printer_path):
    moonraker = FakeMoonraker()
    moonraker.failure = RuntimeError("klipper is not ready")
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.post(route)
    assert (response.status_code, response.json()["detail"]) == (502, "klipper is not ready")


async def test_a_print_is_started_with_its_file_name(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    install_fakes(monkeypatch, moonraker=moonraker)
    response = await client.post("/api/control/print", params={"filename": "part.gcode"})
    assert response.json() == {"ok": True, "filename": "part.gcode"}
    assert moonraker.posted == [("/printer/print/start", {"filename": "part.gcode"})]


async def test_starting_a_print_the_printer_refuses_is_a_502(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.failure = RuntimeError("busy")
    install_fakes(monkeypatch, moonraker=moonraker)
    assert (await client.post("/api/control/print", params={"filename": "a.gcode"})).status_code == 502


async def test_the_switches_are_listed_with_their_state_and_unknown_when_unreadable(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "ha_switches", "Power strip=switch.strip,Pi=switch.pi")
    monkeypatch.setattr(settings, "ha_power_switch", "switch.plug")
    install_fakes(monkeypatch, home_assistant=FakeHomeAssistant(states={"switch.strip": "on", "switch.plug": "off"}))
    body = (await client.get("/api/control/switches")).json()
    assert [(item["key"], item["label"], item["entity_id"], item["state"]) for item in body] == [
        ("printer-power", "Printer power", "switch.plug", "off"),
        ("power-strip", "Power strip", "switch.strip", "on"),
        ("pi", "Pi", "switch.pi", "unknown"),
    ]


async def test_an_unknown_switch_is_a_404(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "ha_switches", "")
    for action in ("on", "off"):
        response = await client.post(f"/api/control/switches/none/{action}")
        assert (response.status_code, response.json()["detail"]) == (404, "Switch not found")


@pytest.mark.parametrize("action", ["on", "off"])
async def test_a_switch_that_home_assistant_cannot_reach_is_a_502(client: AsyncClient, monkeypatch, action):
    monkeypatch.setattr(settings, "ha_switches", "Pi=switch.pi")
    monkeypatch.setattr(settings, "ha_url", CLOSED_ADDRESS)
    assert (await client.post(f"/api/control/switches/pi/{action}")).status_code == 502


@pytest.mark.parametrize("action", ["on", "off"])
async def test_a_switch_is_turned_on_or_off_through_home_assistant(client: AsyncClient, monkeypatch, action):
    monkeypatch.setattr(settings, "ha_switches", "Pi=switch.pi")
    requests: list[httpx.Request] = []
    override_provider(monkeypatch, provide_http_client_factory, recording_client_factory(requests))
    response = await client.post(f"/api/control/switches/pi/{action}")
    assert response.json()["state"] == action
    request = requests[0]
    assert request.url.path == f"/api/services/homeassistant/turn_{action}"
    assert json.loads(request.content) == {"entity_id": "switch.pi"}
    assert request.headers["authorization"] == f"Bearer {settings.ha_token}"


async def test_the_power_state_is_read_from_home_assistant(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "ha_power_switch", "switch.plug")
    requests: list[httpx.Request] = []
    override_provider(monkeypatch, provide_http_client_factory, recording_client_factory(requests, state="off"))
    response = await client.get("/api/control/power")
    assert response.json() == {"state": "off"}
    assert requests[0].url.path == "/api/states/switch.plug"


@pytest.mark.parametrize("action", ["on", "off"])
async def test_the_printer_power_is_switched_through_home_assistant(client: AsyncClient, monkeypatch, action):
    monkeypatch.setattr(settings, "ha_power_switch", "switch.plug")
    requests: list[httpx.Request] = []
    override_provider(monkeypatch, provide_http_client_factory, recording_client_factory(requests))
    response = await client.post(f"/api/control/power/{action}")
    assert response.json()["state"] == action
    assert requests[-1].url.path == f"/api/services/homeassistant/turn_{action}"


@pytest.mark.parametrize(("method", "path"), [("get", "power"), ("post", "power/on"), ("post", "power/off")])
async def test_the_power_switch_is_a_502_when_home_assistant_cannot_be_reached(
    client: AsyncClient, monkeypatch, method, path
):
    monkeypatch.setattr(settings, "ha_url", CLOSED_ADDRESS)
    assert (await getattr(client, method)(f"/api/control/{path}")).status_code == 502


async def test_switching_the_printer_off_tells_the_power_so_the_power_off_is_expected(
    client: AsyncClient, monkeypatch, printer_power
):
    monkeypatch.setattr(settings, "ha_power_switch", "switch.plug")
    override_provider(monkeypatch, provide_http_client_factory, recording_client_factory([]))
    await client.post("/api/control/power/off")
    assert printer_power.calls == ["note_power_cut"]


async def test_switching_another_switch_leaves_the_printer_power_alone(client: AsyncClient, monkeypatch, printer_power):
    monkeypatch.setattr(settings, "ha_switches", "Pi=switch.pi")
    override_provider(monkeypatch, provide_http_client_factory, recording_client_factory([]))
    await client.post("/api/control/switches/pi/off")
    await client.post("/api/control/switches/pi/on")
    assert printer_power.calls == []


async def test_a_power_off_that_home_assistant_refuses_is_not_noted(client: AsyncClient, monkeypatch, printer_power):
    monkeypatch.setattr(settings, "ha_url", CLOSED_ADDRESS)
    assert (await client.post("/api/control/power/off")).status_code == 502
    assert printer_power.calls == []


async def start_print_with_the_printer_switch(
    client, monkeypatch, printer_power, switch_state: str, ready: bool = True
):
    monkeypatch.setattr(settings, "ha_power_switch", "switch.plug")
    monkeypatch.setattr(settings, "ha_switches", "")
    requests: list[httpx.Request] = []
    moonraker = FakeMoonraker()
    printer_power.ready = ready
    install_fakes(
        monkeypatch, moonraker=moonraker, home_assistant=FakeHomeAssistant(states={"switch.plug": switch_state})
    )
    override_provider(monkeypatch, provide_http_client_factory, recording_client_factory(requests))
    response = await client.post("/api/control/print", params={"filename": "part.gcode"})
    return response, requests, moonraker


async def test_a_print_started_while_the_printer_is_off_switches_the_power_on_and_waits_for_klipper(
    client: AsyncClient, monkeypatch, printer_power
):
    response, requests, moonraker = await start_print_with_the_printer_switch(client, monkeypatch, printer_power, "off")
    assert response.status_code == 200
    assert [request.url.path for request in requests] == ["/api/services/homeassistant/turn_on"]
    assert printer_power.calls == ["wait_until_ready"]
    assert moonraker.posted == [("/printer/print/start", {"filename": "part.gcode"})]


async def test_a_print_is_not_started_when_klipper_does_not_get_ready_after_the_power_came_on(
    client: AsyncClient, monkeypatch, printer_power
):
    response, _, moonraker = await start_print_with_the_printer_switch(
        client, monkeypatch, printer_power, "off", ready=False
    )
    assert response.status_code == 502
    assert "did not get ready" in response.json()["detail"]
    assert moonraker.posted == []


async def test_a_print_started_while_the_printer_is_on_does_not_touch_the_power(
    client: AsyncClient, monkeypatch, printer_power
):
    response, requests, moonraker = await start_print_with_the_printer_switch(client, monkeypatch, printer_power, "on")
    assert response.status_code == 200
    assert requests == []
    assert printer_power.calls == []
    assert len(moonraker.posted) == 1
