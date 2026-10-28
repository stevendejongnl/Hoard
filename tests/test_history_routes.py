from datetime import UTC, datetime

import pytest
from httpx import AsyncClient

from app import db
from tests.route_fakes import FakeHomeAssistant, FakeInflux, FakeMoonraker, install_fakes

END_TIME = 1_760_000_000  # a whole number of minutes is not needed; the minute is END_TIME // 60
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


def completed_job(job_id: str, filename: str = "part.gcode", end_time: int = END_TIME) -> dict:
    return {
        "job_id": job_id,
        "filename": filename,
        "status": "completed",
        "end_time": end_time,
        "start_time": end_time - 3600,
        "print_duration": 3600.0,
        "filament_used": 5000.0,
    }


def iso(timestamp: int) -> str:
    return datetime.fromtimestamp(timestamp, tz=UTC).isoformat().replace("+00:00", "Z")


def influx_cost(filename: str, timestamp: int, cost_total: float) -> dict:
    return {
        "filename": filename,
        "time": iso(timestamp),
        "avg_watts": 90.0,
        "avg_eur_per_kwh": 0.25,
        "cost_electricity": 0.4,
        "cost_filament": 0.6,
        "cost_total": cost_total,
    }


def moonraker_with(jobs: list[dict], totals: object | None = None) -> FakeMoonraker:
    answers: dict = {"/server/history/list": {"jobs": jobs}}
    answers["/server/history/totals"] = totals if totals is not None else {"job_totals": {"total_jobs": 42}}
    return FakeMoonraker(answers)


async def test_history_lists_only_completed_jobs_with_the_total(client: AsyncClient, monkeypatch):
    jobs = [completed_job("a"), {**completed_job("b"), "status": "cancelled"}]
    install_fakes(monkeypatch, moonraker=moonraker_with(jobs), influx=FakeInflux())
    body = (await client.get("/api/history?limit=5&offset=0")).json()
    assert (body["total"], body["limit"], body["offset"]) == (42, 5, 0)
    assert [record["job_id"] for record in body["records"]] == ["a"]
    assert body["records"][0] == {
        "job_id": "a",
        "filename": "part.gcode",
        "time": iso(END_TIME),
        "duration_s": 3600.0,
        "filament_g": round(5000.0 * 3.141592653589793 * 0.875**2 * 1.24 * 0.001, 2),
        "status": "completed",
        "avg_watts": None,
        "avg_eur_per_kwh": None,
        "cost_electricity": None,
        "cost_filament": None,
        "cost_total": None,
        "spool": None,
        "_source": "moonraker",
        "has_detail": False,
        "photo_count": 0,
    }


async def test_history_asks_the_printer_for_the_page_and_influx_for_enough_rows(client: AsyncClient, monkeypatch):
    moonraker = moonraker_with([completed_job("a")])
    influx = FakeInflux()
    install_fakes(monkeypatch, moonraker=moonraker, influx=influx)
    await client.get("/api/history?limit=20&offset=40")
    assert moonraker.asked[0] == ("/server/history/list", {"limit": 20, "start": 40, "order": "desc"})
    assert influx.limits == [max(500, 40 + 20 + 100)]


async def test_history_takes_the_cost_from_influx_within_five_minutes_of_the_end(client: AsyncClient, monkeypatch):
    install_fakes(
        monkeypatch,
        moonraker=moonraker_with([completed_job("a")]),
        influx=FakeInflux([influx_cost("part.gcode", END_TIME + 4 * 60, 1.0)]),
    )
    record = (await client.get("/api/history")).json()["records"][0]
    assert (record["_source"], record["cost_total"], record["avg_watts"]) == ("influx", 1.0, 90.0)
    assert (record["cost_electricity"], record["cost_filament"], record["avg_eur_per_kwh"]) == (0.4, 0.6, 0.25)


async def test_history_ignores_influx_rows_of_another_file_or_further_away(client: AsyncClient, monkeypatch):
    rows = [influx_cost("other.gcode", END_TIME, 1.0), influx_cost("part.gcode", END_TIME + 9 * 60, 2.0)]
    install_fakes(monkeypatch, moonraker=moonraker_with([completed_job("a")]), influx=FakeInflux(rows))
    record = (await client.get("/api/history")).json()["records"][0]
    assert (record["_source"], record["cost_total"]) == ("moonraker", None)


async def test_history_shows_the_spool_the_project_and_the_detail_of_a_print(client: AsyncClient, monkeypatch):
    spool = await db.create_spool(SPOOL)
    await db.link_print_spool("a", spool["id"], 12.5)
    project = await db.create_project("Bracket")
    await db.add_project_print(project["id"], None, "a", None, None, None)
    await db.get_or_create_print_job("a")
    await db.add_print_photo("a", "one.jpg", source="upload")
    install_fakes(monkeypatch, moonraker=moonraker_with([completed_job("a")]), influx=FakeInflux())
    record = (await client.get("/api/history")).json()["records"][0]
    assert record["spool"] == {
        "id": spool["id"],
        "brand": "Prusament",
        "material": "PLA",
        "color": "Orange",
        "color_hex": "#ff8800",
    }
    assert record["project"] == {"id": project["id"], "name": "Bracket"}
    assert (record["has_detail"], record["photo_count"]) == (True, 1)


async def test_history_total_falls_back_to_the_offset_plus_the_page_when_the_totals_fail(
    client: AsyncClient, monkeypatch
):
    jobs = [completed_job("a"), completed_job("b")]
    install_fakes(monkeypatch, moonraker=moonraker_with(jobs, totals=RuntimeError("no totals")), influx=FakeInflux())
    assert (await client.get("/api/history?offset=7")).json()["total"] == 9


async def test_a_job_without_an_end_time_has_no_time(client: AsyncClient, monkeypatch):
    job = {**completed_job("a"), "end_time": 0}
    install_fakes(monkeypatch, moonraker=moonraker_with([job]), influx=FakeInflux())
    assert (await client.get("/api/history")).json()["records"][0]["time"] is None


async def test_assigning_an_unknown_spool_is_a_404(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=moonraker_with([]), influx=FakeInflux(), home_assistant=FakeHomeAssistant())
    response = await client.patch("/api/history/a/spool", json={"spool_id": 99})
    assert (response.status_code, response.json()["detail"]) == (404, "Spool not found")


async def test_assigning_a_spool_links_it_and_rewrites_the_cost_from_the_exact_energy(client: AsyncClient, monkeypatch):
    spool = await db.create_spool(SPOOL)
    moonraker = FakeMoonraker({"/server/history/job": {"job": completed_job("a")}})
    influx = FakeInflux()
    install_fakes(
        monkeypatch,
        moonraker=moonraker,
        influx=influx,
        home_assistant=FakeHomeAssistant(energy_kwh=0.5, average_price=0.2),
    )
    response = await client.patch("/api/history/a/spool", json={"spool_id": spool["id"]})
    assert response.json() == {"job_id": "a", "spool_id": spool["id"]}
    filament_g = round(5000.0 * 3.141592653589793 * 0.875**2 * 1.24 * 0.001, 2)
    assert (await db.get_print_spool("a"))["filament_used_g"] == filament_g
    assert influx.deleted == [(datetime.fromtimestamp(END_TIME, tz=UTC), "part.gcode")]
    written = influx.written[0]
    assert written["avg_watts"] == 500.0
    assert written["avg_eur_per_kwh"] == 0.2
    assert written["cost_electricity"] == 0.1
    assert written["cost_filament"] == round(filament_g * 0.03, 4)
    assert written["cost_total"] == round(0.1 + filament_g * 0.03, 4)
    assert (written["spool_id"], written["material"], written["job_id"]) == (spool["id"], "PLA", "a")


async def test_assigning_a_spool_keeps_the_linked_filament_weight_of_an_earlier_assignment(
    client: AsyncClient, monkeypatch
):
    spool = await db.create_spool(SPOOL)
    await db.link_print_spool("a", spool["id"], 7.0)
    influx = FakeInflux()
    install_fakes(
        monkeypatch,
        moonraker=FakeMoonraker({"/server/history/job": {"job": completed_job("a")}}),
        influx=influx,
        home_assistant=FakeHomeAssistant(energy_kwh=1.0, average_price=0.1),
    )
    await client.patch("/api/history/a/spool", json={"spool_id": spool["id"]})
    assert influx.written[0]["filament_g"] == 7.0


async def test_assigning_a_spool_uses_the_average_power_when_there_is_no_energy_reading(
    client: AsyncClient, monkeypatch
):
    spool = await db.create_spool(SPOOL)
    influx = FakeInflux()
    install_fakes(
        monkeypatch,
        moonraker=FakeMoonraker({"/server/history/job": {"job": completed_job("a")}}),
        influx=influx,
        home_assistant=FakeHomeAssistant(energy_kwh=None, average_watts=100.0, average_price=0.25),
    )
    await client.patch("/api/history/a/spool", json={"spool_id": spool["id"]})
    written = influx.written[0]
    assert (written["avg_watts"], written["cost_electricity"]) == (100.0, 0.025)


async def test_assigning_a_spool_still_succeeds_when_the_cost_recalculation_fails(client: AsyncClient, monkeypatch):
    spool = await db.create_spool(SPOOL)
    influx = FakeInflux()
    install_fakes(
        monkeypatch,
        moonraker=FakeMoonraker({"/server/history/job": RuntimeError("down")}),
        influx=influx,
        home_assistant=FakeHomeAssistant(),
    )
    response = await client.patch("/api/history/a/spool", json={"spool_id": spool["id"]})
    assert response.json() == {"job_id": "a", "spool_id": spool["id"]}
    assert influx.written == []
    assert (await db.get_print_spool("a"))["spool_id"] == spool["id"]


async def test_recalculating_without_a_spool_is_a_400(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=moonraker_with([]), influx=FakeInflux(), home_assistant=FakeHomeAssistant())
    response = await client.post("/api/history/a/recalculate")
    assert (response.status_code, response.json()["detail"]) == (400, "No spool assigned — assign a spool first")


async def test_recalculating_uses_the_assigned_spool(client: AsyncClient, monkeypatch):
    spool = await db.create_spool(SPOOL)
    await db.link_print_spool("a", spool["id"], 10.0)
    influx = FakeInflux()
    install_fakes(
        monkeypatch,
        moonraker=FakeMoonraker({"/server/history/job": {"job": completed_job("a")}}),
        influx=influx,
        home_assistant=FakeHomeAssistant(energy_kwh=0.5, average_price=0.2),
    )
    response = await client.post("/api/history/a/recalculate")
    assert response.json() == {"job_id": "a", "spool_id": spool["id"]}
    assert influx.written[0]["cost_filament"] == 0.3


async def test_restoring_an_unknown_job_is_a_404(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=FakeMoonraker({"/server/history/job": {}}), influx=FakeInflux())
    assert (await client.post("/api/history/a/restore")).status_code == 404


async def test_restoring_a_job_without_times_is_a_422(client: AsyncClient, monkeypatch):
    job = {**completed_job("a"), "start_time": 0}
    install_fakes(monkeypatch, moonraker=FakeMoonraker({"/server/history/job": {"job": job}}), influx=FakeInflux())
    response = await client.post("/api/history/a/restore")
    assert (response.status_code, response.json()["detail"]) == (422, "Job missing start_time / end_time")


async def test_restoring_costs_writes_electricity_only_without_a_spool(client: AsyncClient, monkeypatch):
    influx = FakeInflux()
    install_fakes(
        monkeypatch,
        moonraker=FakeMoonraker({"/server/history/job": {"job": completed_job("a")}}),
        influx=influx,
        home_assistant=FakeHomeAssistant(energy_kwh=0.5, average_price=0.2),
    )
    body = (await client.post("/api/history/a/restore")).json()
    assert body == {
        "job_id": "a",
        "avg_watts": 500.0,
        "avg_eur_per_kwh": 0.2,
        "cost_electricity": 0.1,
        "cost_filament": 0.0,
        "cost_total": 0.1,
    }
    assert influx.written[0]["spool_id"] is None
    assert influx.written[0]["material"] is None
    assert influx.deleted == [(datetime.fromtimestamp(END_TIME, tz=UTC), "part.gcode")]


async def test_restoring_costs_adds_the_filament_of_the_assigned_spool(client: AsyncClient, monkeypatch):
    spool = await db.create_spool(SPOOL)
    await db.link_print_spool("a", spool["id"], 10.0)
    influx = FakeInflux()
    install_fakes(
        monkeypatch,
        moonraker=FakeMoonraker({"/server/history/job": {"job": completed_job("a")}}),
        influx=influx,
        home_assistant=FakeHomeAssistant(energy_kwh=None, average_watts=100.0, average_price=0.0005),
    )
    body = (await client.post("/api/history/a/restore")).json()
    filament_g = round(5000.0 * 3.141592653589793 * 0.875**2 * 1.24 * 0.001, 2)
    assert body["cost_filament"] == round(filament_g * 0.03, 4)
    assert influx.written[0]["material"] == "PLA"
    assert body["avg_watts"] == 100.0


@pytest.mark.parametrize("price", [0.0, 0.0009])
async def test_a_price_below_a_tenth_of_a_cent_is_replaced_by_the_recent_average(
    client: AsyncClient, monkeypatch, price
):
    class PriceFallback(FakeHomeAssistant):
        async def avg_price_over(self, start, end) -> float:
            return price

        async def avg_price_hours(self, hours: int = 27) -> float:
            return 0.3

    influx = FakeInflux()
    install_fakes(
        monkeypatch,
        moonraker=FakeMoonraker({"/server/history/job": {"job": completed_job("a")}}),
        influx=influx,
        home_assistant=PriceFallback(energy_kwh=1.0),
    )
    assert (await client.post("/api/history/a/restore")).json()["avg_eur_per_kwh"] == 0.3
