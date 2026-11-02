import json

import httpx
from httpx import AsyncClient

from app.config import settings
from app.routes.dependencies import provide_http_client_factory
from app.switches import SwitchDefinition, read_switch_definitions
from tests.route_fakes import FakeHomeAssistant, install_fakes, override_provider, recording_client_factory

PRINTER_ENTITY = "switch.machine_outlet"
STRIP = {"label": "Power strip", "entity": "switch.feed_plug"}
PI = {"label": "Raspberry Pi", "entity": "switch.pi_outlet", "requires": "Power strip"}
PRINTER = {"label": "Printer", "printer": True, "requires": "Raspberry Pi"}
DRYER = {"label": "Filament dryer", "entity": "switch.dryer_outlet", "requires": "Power strip"}


def as_json(*entries: dict) -> str:
    return json.dumps(list(entries))


def configure(monkeypatch, *entries: dict) -> None:
    monkeypatch.setattr(settings, "ha_switches", as_json(*entries))
    monkeypatch.setattr(settings, "ha_power_switch", PRINTER_ENTITY)


def test_a_json_list_keeps_its_order_and_names_what_each_switch_needs() -> None:
    definitions = read_switch_definitions(as_json(STRIP, PI, PRINTER, DRYER), PRINTER_ENTITY)
    assert definitions == [
        SwitchDefinition(key="power-strip", label="Power strip", entity_id="switch.feed_plug"),
        SwitchDefinition(
            key="raspberry-pi", label="Raspberry Pi", entity_id="switch.pi_outlet", requires="power-strip"
        ),
        SwitchDefinition(
            key="printer", label="Printer", entity_id=PRINTER_ENTITY, requires="raspberry-pi", is_printer=True
        ),
        SwitchDefinition(
            key="filament-dryer", label="Filament dryer", entity_id="switch.dryer_outlet", requires="power-strip"
        ),
    ]


def test_a_switch_may_need_one_that_comes_later_in_the_list() -> None:
    definitions = read_switch_definitions(as_json(PI, STRIP), PRINTER_ENTITY)
    assert definitions[0].requires == "power-strip"


def test_the_printer_power_comes_first_when_the_list_does_not_place_it() -> None:
    definitions = read_switch_definitions(as_json(STRIP), PRINTER_ENTITY)
    assert [(item.label, item.entity_id, item.is_printer) for item in definitions] == [
        ("Printer power", PRINTER_ENTITY, True),
        ("Power strip", "switch.feed_plug", False),
    ]


def test_the_old_label_and_entity_pairs_still_work_with_the_printer_power_first() -> None:
    definitions = read_switch_definitions("Power strip=switch.feed_plug,Pi=switch.pi_outlet", PRINTER_ENTITY)
    assert [item.key for item in definitions] == ["printer-power", "power-strip", "pi"]
    assert all(item.requires is None for item in definitions)


def test_nothing_configured_still_gives_the_printer_power() -> None:
    assert [item.key for item in read_switch_definitions("", PRINTER_ENTITY)] == ["printer-power"]


def test_a_switch_that_needs_an_unknown_label_needs_nothing() -> None:
    definitions = read_switch_definitions(as_json({**PI, "requires": "Nothing"}), PRINTER_ENTITY)
    assert definitions[1].requires is None


def test_switches_that_need_each_other_in_a_circle_do_not_keep_the_circle() -> None:
    first = {"label": "A", "entity": "switch.a", "requires": "B"}
    second = {"label": "B", "entity": "switch.b", "requires": "A"}
    definitions = read_switch_definitions(as_json(first, second), PRINTER_ENTITY)
    assert [item.requires for item in definitions] == [None, None, "a"]


def test_entries_without_a_label_or_an_entity_are_skipped() -> None:
    entries = as_json({"label": "No entity"}, {"entity": "switch.no_label"}, "text", STRIP)
    assert [item.key for item in read_switch_definitions(entries, PRINTER_ENTITY)] == ["printer-power", "power-strip"]


def test_a_list_that_is_not_valid_json_gives_only_the_printer_power() -> None:
    assert [item.key for item in read_switch_definitions("[{", PRINTER_ENTITY)] == ["printer-power"]


async def test_the_list_says_what_each_switch_needs_and_which_one_is_the_printer(client: AsyncClient, monkeypatch):
    configure(monkeypatch, STRIP, PI, PRINTER)
    states = {"switch.feed_plug": "on", "switch.pi_outlet": "off", PRINTER_ENTITY: "off"}
    install_fakes(monkeypatch, home_assistant=FakeHomeAssistant(states=states))
    body = (await client.get("/api/control/switches")).json()
    assert [(item["key"], item["state"], item["requires"], item["is_printer"]) for item in body] == [
        ("power-strip", "on", None, False),
        ("raspberry-pi", "off", "power-strip", False),
        ("printer", "off", "raspberry-pi", True),
    ]


async def test_a_switch_whose_needed_switch_is_off_is_not_switched_on(client: AsyncClient, monkeypatch):
    configure(monkeypatch, STRIP, PI)
    requests: list[httpx.Request] = []
    install_fakes(monkeypatch, home_assistant=FakeHomeAssistant(states={"switch.feed_plug": "off"}))
    override_provider(monkeypatch, provide_http_client_factory, recording_client_factory(requests))
    response = await client.post("/api/control/switches/raspberry-pi/on")
    assert (response.status_code, response.json()["detail"]) == (409, "Needs Power strip")
    assert requests == []


async def test_a_switch_whose_needed_switch_cannot_be_read_is_not_switched_on(client: AsyncClient, monkeypatch):
    configure(monkeypatch, STRIP, PI)
    install_fakes(monkeypatch, home_assistant=FakeHomeAssistant(states={}))
    assert (await client.post("/api/control/switches/raspberry-pi/on")).status_code == 409


async def test_a_switch_whose_needed_switch_is_on_is_switched_on(client: AsyncClient, monkeypatch):
    configure(monkeypatch, STRIP, PI)
    requests: list[httpx.Request] = []
    install_fakes(monkeypatch, home_assistant=FakeHomeAssistant(states={"switch.feed_plug": "on"}))
    override_provider(monkeypatch, provide_http_client_factory, recording_client_factory(requests))
    response = await client.post("/api/control/switches/raspberry-pi/on")
    assert response.json() == {"state": "on"}
    assert [json.loads(request.content)["entity_id"] for request in requests] == ["switch.pi_outlet"]


async def test_the_printer_power_is_not_switched_on_while_the_pi_is_off(client: AsyncClient, monkeypatch):
    configure(monkeypatch, STRIP, PI, PRINTER)
    install_fakes(monkeypatch, home_assistant=FakeHomeAssistant(states={"switch.pi_outlet": "off"}))
    for path in ("/api/control/power/on", "/api/control/switches/printer/on"):
        response = await client.post(path)
        assert (response.status_code, response.json()["detail"]) == (409, "Needs Raspberry Pi")
