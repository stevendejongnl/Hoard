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
    install_fakes(monkeypatch, home_assistant=FakeHomeAssistant(states={"switch.strip": "on"}))
    body = (await client.get("/api/control/switches")).json()
    assert body == [
        {"key": "power-strip", "label": "Power strip", "entity_id": "switch.strip", "state": "on"},
        {"key": "pi", "label": "Pi", "entity_id": "switch.pi", "state": "unknown"},
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
    assert response.json() == {"state": action}
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
    assert response.json() == {"state": action}
    assert requests[0].url.path == f"/api/services/switch/turn_{action}"


@pytest.mark.parametrize(("method", "path"), [("get", "power"), ("post", "power/on"), ("post", "power/off")])
async def test_the_power_switch_is_a_502_when_home_assistant_cannot_be_reached(
    client: AsyncClient, monkeypatch, method, path
):
    monkeypatch.setattr(settings, "ha_url", CLOSED_ADDRESS)
    assert (await getattr(client, method)(f"/api/control/{path}")).status_code == 502
