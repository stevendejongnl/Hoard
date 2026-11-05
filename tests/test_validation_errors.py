import pytest
from httpx import AsyncClient

from tests.route_fakes import FakeMoonraker, install_fakes


@pytest.fixture(autouse=True)
def printer(monkeypatch) -> FakeMoonraker:
    moonraker = FakeMoonraker({"/printer/objects/query": {"status": {"print_stats": {"state": "standby"}}}})
    install_fakes(monkeypatch, moonraker=moonraker)
    return moonraker


async def refused(client: AsyncClient, route: str, body: dict) -> str:
    response = await client.post(f"/api/control/{route}", json=body)
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)
    return response.json()["detail"]


async def test_a_heater_target_over_the_limit_names_the_heater_the_limit_and_the_target(client: AsyncClient):
    text = await refused(client, "temperature", {"heater": "extruder", "target": 301})
    assert text == "The nozzle goes up to 300 °C, not 301 °C."
    text = await refused(client, "temperature", {"heater": "heater_bed", "target": 131})
    assert text == "The bed goes up to 130 °C, not 131 °C."


async def test_a_number_out_of_range_says_the_range_and_what_was_sent(client: AsyncClient):
    assert await refused(client, "move", {"axis": "x", "distance": 250}) == "distance must be at most 200 (got 250)."
    assert await refused(client, "speed", {"percent": 5}) == "percent must be at least 10 (got 5)."


async def test_a_missing_field_is_named(client: AsyncClient):
    assert await refused(client, "move", {"distance": 10}) == "axis is required."


async def test_a_value_that_is_not_one_of_the_choices_lists_them(client: AsyncClient):
    text = await refused(client, "move", {"axis": "w", "distance": 10})
    assert text == "axis must be one of 'x', 'y' or 'z'."


async def test_a_value_of_the_wrong_kind_is_named(client: AsyncClient):
    assert await refused(client, "move", {"axis": "x", "distance": "far"}) == "distance must be a number."


async def test_a_check_of_the_model_keeps_its_sentence(client: AsyncClient):
    assert await refused(client, "move", {"axis": "x", "distance": 0}) == "distance must not be zero."
    assert await refused(client, "gcode", {"script": "  "}) == "script must not be empty."


async def test_several_problems_are_all_listed(client: AsyncClient):
    text = await refused(client, "move", {"axis": "w", "distance": 250})
    assert text == "axis must be one of 'x', 'y' or 'z'; distance must be at most 200 (got 250)."


async def test_what_a_person_typed_into_a_text_field_is_not_echoed_back(client: AsyncClient):
    text = await refused(client, "macro", {"name": "bad name; M112"})
    assert "M112" not in text
    assert text == "name has a form that is not allowed."
