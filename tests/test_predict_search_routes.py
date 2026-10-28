import pytest
from httpx import AsyncClient

from app import db
from tests.route_fakes import FakeHomeAssistant, FakeMoonraker, install_fakes

SPOOL = {
    "brand": "Prusament",
    "material": "PLA",
    "color": "Orange",
    "color_hex": "#ff8800",
    "cost_per_gram": 0.03,
    "initial_weight_g": 1000,
    "current_weight_g": 900,
    "notes": None,
}


def moonraker_with_metadata(metadata: dict) -> FakeMoonraker:
    moonraker = FakeMoonraker()
    moonraker.metadata = metadata
    return moonraker


async def test_a_prediction_without_a_spool_costs_only_electricity(client: AsyncClient, monkeypatch):
    metadata = {"filament_weight_total": 10.0, "estimated_time": 7200, "layer_count": 50}
    install_fakes(
        monkeypatch,
        moonraker=moonraker_with_metadata(metadata),
        home_assistant=FakeHomeAssistant(average_watts=200.0, average_price=0.25),
    )
    body = (await client.get("/api/predict?filename=a.gcode&quantity=2")).json()
    assert body == {
        "filename": "a.gcode",
        "quantity": 2,
        "spool_id": None,
        "material": None,
        "filament_g": 20.0,
        "estimated_time_s": 14400.0,
        "layer_count": 50,
        "avg_watts": 200.0,
        "avg_eur_per_kwh": 0.25,
        "cost_filament": 0.0,
        "cost_electricity": 0.2,
        "cost_total": 0.2,
    }


async def test_a_prediction_uses_the_active_spool_when_none_is_given(client: AsyncClient, monkeypatch):
    spool = await db.create_spool({**SPOOL, "active": 1})
    install_fakes(
        monkeypatch,
        moonraker=moonraker_with_metadata({"filament_weight_total": 10.0, "estimated_time": 3600}),
        home_assistant=FakeHomeAssistant(average_watts=0.0, average_price=0.2),
    )
    body = (await client.get("/api/predict?filename=a.gcode")).json()
    assert (body["spool_id"], body["material"], body["cost_filament"]) == (spool["id"], "PLA", 0.3)
    assert body["avg_watts"] == 105.0
    assert body["cost_electricity"] == round(105.0 * 1 / 1000 * 0.2, 4)


async def test_a_prediction_uses_the_given_spool_and_the_filament_length_of_cura(client: AsyncClient, monkeypatch):
    await db.create_spool({**SPOOL, "active": 1})
    other = await db.create_spool({**SPOOL, "material": "PETG", "cost_per_gram": 0.05})
    install_fakes(
        monkeypatch,
        moonraker=moonraker_with_metadata({"filament_total": 1000.0}),
        home_assistant=FakeHomeAssistant(),
    )
    body = (await client.get(f"/api/predict?filename=a.gcode&spool_id={other['id']}")).json()
    grams = 1000.0 * 3.141592653589793 * 0.875**2 * 1.24 * 0.001
    assert (body["spool_id"], body["material"]) == (other["id"], "PETG")
    assert body["filament_g"] == round(grams, 2)
    assert body["cost_filament"] == round(grams * 0.05, 4)


async def test_a_prediction_for_an_unknown_spool_has_no_filament_cost(client: AsyncClient, monkeypatch):
    install_fakes(
        monkeypatch,
        moonraker=moonraker_with_metadata({"filament_weight_total": 10.0}),
        home_assistant=FakeHomeAssistant(),
    )
    body = (await client.get("/api/predict?filename=a.gcode&spool_id=99")).json()
    assert (body["spool_id"], body["material"], body["cost_filament"]) == (99, None, 0.0)


async def test_a_prediction_keeps_the_default_power_when_the_history_fails(client: AsyncClient, monkeypatch):
    class BrokenHistory(FakeHomeAssistant):
        async def avg_power_over(self, start, end):
            raise RuntimeError("no history")

    install_fakes(monkeypatch, moonraker=moonraker_with_metadata({}), home_assistant=BrokenHistory())
    assert (await client.get("/api/predict?filename=a.gcode")).json()["avg_watts"] == 105.0


async def test_a_prediction_says_502_when_the_metadata_cannot_be_read(client: AsyncClient, monkeypatch):
    moonraker = FakeMoonraker()
    moonraker.failure = RuntimeError("boom")
    install_fakes(monkeypatch, moonraker=moonraker, home_assistant=FakeHomeAssistant())
    response = await client.get("/api/predict?filename=a.gcode")
    assert (response.status_code, response.json()["detail"]) == (502, "Moonraker metadata error: boom")


def history_of(*names: str) -> FakeMoonraker:
    jobs = [
        {"job_id": str(index), "filename": name, "status": "completed", "end_time": 100 + index, "print_duration": 5}
        for index, name in enumerate(names)
    ]
    jobs.append({"job_id": "x", "filename": "Bracket-cancelled.gcode", "status": "cancelled"})
    return FakeMoonraker({"/server/history/list": {"jobs": jobs}})


async def test_an_empty_search_finds_nothing(client: AsyncClient):
    assert (await client.get("/api/search?q=%20")).json() == {"history": [], "spools": [], "projects": []}


async def test_the_search_finds_completed_prints_spools_and_projects(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=history_of("Bracket-v1.gcode", "Vase.gcode"))
    await db.create_spool(SPOOL)
    project = await db.create_project("Bracket holder")
    body = (await client.get("/api/search?q=BRACKET")).json()
    assert body["history"] == [{"job_id": "0", "filename": "Bracket-v1.gcode", "time": 100, "duration_s": 5}]
    assert body["spools"] == []
    assert [found["id"] for found in body["projects"]] == [project["id"]]
    spools = (await client.get("/api/search?q=orange")).json()["spools"]
    assert [spool["brand"] for spool in spools] == ["Prusament"]


async def test_the_search_can_be_limited_to_some_scopes(client: AsyncClient, monkeypatch):
    moonraker = history_of("Bracket-v1.gcode")
    install_fakes(monkeypatch, moonraker=moonraker)
    await db.create_project("Bracket holder")
    body = (await client.get("/api/search?q=bracket&scope=p")).json()
    assert (body["history"], len(body["projects"])) == ([], 1)
    assert moonraker.asked == []


async def test_the_search_looks_in_the_notes_of_a_project(client: AsyncClient):
    project = await db.create_project("Plain")
    await db.update_project(project["id"], {"notes": "needs a Gasket"})
    assert len((await client.get("/api/search?q=gasket&scope=p")).json()["projects"]) == 1


async def test_the_search_limits_each_group_to_ten(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=history_of(*[f"part-{number}.gcode" for number in range(15)]))
    assert len((await client.get("/api/search?q=part&scope=h")).json()["history"]) == 10


async def test_a_search_still_answers_when_the_printer_fails(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=FakeMoonraker({"/server/history/list": RuntimeError("down")}))
    await db.create_project("Bracket")
    body = (await client.get("/api/search?q=bracket")).json()
    assert (body["history"], len(body["projects"])) == ([], 1)


@pytest.mark.parametrize("scope", ["h,s", " s , p "])
async def test_scopes_are_a_comma_separated_list(client: AsyncClient, monkeypatch, scope):
    install_fakes(monkeypatch, moonraker=history_of("Bracket.gcode"))
    await db.create_project("Bracket")
    body = (await client.get("/api/search", params={"q": "bracket", "scope": scope})).json()
    assert (len(body["history"]) == 1, len(body["projects"]) == 1) == ("h" in scope, "p" in scope)
