import json

import httpx

from app import ha
from app.config import Settings, settings
from app.routes.dependencies import provide_http_client_factory
from app.switches import SwitchDefinition, create_switch_key, parse_switch_definitions
from tests.route_fakes import override_provider, recording_client_factory

POWER_STRIP = "Power strip=switch.feed_plug"
PI = "Raspberry Pi=switch.pi_outlet"
DRYER = "Filament dryer=switch.dryer_outlet"


def configure(monkeypatch, text: str) -> None:
    monkeypatch.setattr(settings, "ha_switches", text)


def test_no_extra_switches_are_configured_by_default(monkeypatch) -> None:
    monkeypatch.delenv("HA_SWITCHES", raising=False)
    assert Settings(_env_file=None).ha_switches == ""


def test_a_key_is_the_label_in_lowercase_words_joined_by_dashes() -> None:
    assert create_switch_key("Raspberry Pi") == "raspberry-pi"
    assert create_switch_key("  Filament dryer (attic) ") == "filament-dryer-attic"


def test_the_definitions_come_from_label_and_entity_pairs() -> None:
    definitions = parse_switch_definitions(f"{POWER_STRIP},{PI}")
    assert definitions == [
        SwitchDefinition(key="power-strip", label="Power strip", entity_id="switch.feed_plug"),
        SwitchDefinition(key="raspberry-pi", label="Raspberry Pi", entity_id="switch.pi_outlet"),
    ]


def test_spaces_around_the_pairs_are_ignored() -> None:
    definitions = parse_switch_definitions("  Pi = switch.pi_outlet , Dryer = switch.dryer_outlet  ")
    assert [definition.entity_id for definition in definitions] == ["switch.pi_outlet", "switch.dryer_outlet"]


def test_a_pair_without_a_label_or_an_entity_is_skipped() -> None:
    definitions = parse_switch_definitions("=switch.a,Label=,no equals sign,Pi=switch.pi_outlet")
    assert [definition.label for definition in definitions] == ["Pi"]


def test_two_switches_with_the_same_label_get_different_keys() -> None:
    definitions = parse_switch_definitions("Lamp=switch.one,Lamp=switch.two")
    assert [definition.key for definition in definitions] == ["lamp", "lamp-2"]


def test_an_empty_setting_gives_no_definitions() -> None:
    assert parse_switch_definitions("") == []


async def test_the_list_shows_every_switch_with_its_state(client, monkeypatch) -> None:
    states = {"switch.feed_plug": "on", "switch.pi_outlet": "off"}

    async def fake_state(entity_id: str) -> dict:
        return {"state": states[entity_id]}

    configure(monkeypatch, f"{POWER_STRIP},{PI}")
    monkeypatch.setattr(ha, "get_state", fake_state)
    response = await client.get("/api/control/switches")
    assert response.status_code == 200
    assert response.json() == [
        {"key": "power-strip", "label": "Power strip", "entity_id": "switch.feed_plug", "state": "on"},
        {"key": "raspberry-pi", "label": "Raspberry Pi", "entity_id": "switch.pi_outlet", "state": "off"},
    ]


async def test_a_switch_that_home_assistant_cannot_read_is_unknown(client, monkeypatch) -> None:
    async def failing_state(entity_id: str) -> dict:
        raise RuntimeError("offline")

    configure(monkeypatch, PI)
    monkeypatch.setattr(ha, "get_state", failing_state)
    response = await client.get("/api/control/switches")
    assert [item["state"] for item in response.json()] == ["unknown"]


async def test_the_list_is_empty_without_configured_switches(client, monkeypatch) -> None:
    configure(monkeypatch, "")
    assert (await client.get("/api/control/switches")).json() == []


async def test_a_switch_is_turned_on_and_off_through_home_assistant(client, monkeypatch) -> None:
    requests: list[httpx.Request] = []
    configure(monkeypatch, f"{PI},{DRYER}")
    override_provider(monkeypatch, provide_http_client_factory, recording_client_factory(requests))
    assert (await client.post("/api/control/switches/filament-dryer/on")).json() == {"state": "on"}
    assert (await client.post("/api/control/switches/raspberry-pi/off")).json() == {"state": "off"}
    assert [(request.url.path, json.loads(request.content)["entity_id"]) for request in requests] == [
        ("/api/services/homeassistant/turn_on", "switch.dryer_outlet"),
        ("/api/services/homeassistant/turn_off", "switch.pi_outlet"),
    ]


async def test_an_unknown_switch_is_not_found(client, monkeypatch) -> None:
    configure(monkeypatch, PI)
    assert (await client.post("/api/control/switches/nothing/on")).status_code == 404


async def test_a_failing_home_assistant_is_a_bad_gateway(client, monkeypatch) -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline")

    configure(monkeypatch, PI)
    override_provider(
        monkeypatch,
        provide_http_client_factory,
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(refuse)),
    )
    assert (await client.post("/api/control/switches/raspberry-pi/on")).status_code == 502
