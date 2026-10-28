from datetime import UTC, datetime
from pathlib import Path

import pytest
from httpx import AsyncClient

from app import db
from app.config import settings
from app.routes.dependencies import provide_gcode_meta_reader
from tests.route_fakes import FakeInflux, FakeMoonraker, install_fakes, override_provider

END_TIME = 1_760_000_000
JOB = {
    "filename": "part.gcode",
    "status": "completed",
    "end_time": END_TIME,
    "print_duration": 3600.0,
    "filament_used": 5000.0,
}
FILAMENT_G = round(5000.0 * 3.141592653589793 * 0.875**2 * 1.24 * 0.001, 2)
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


@pytest.fixture(autouse=True)
def photos_next_to_a_temporary_database(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "hoard.db"))


def moonraker_with_job(job: dict | Exception = JOB) -> FakeMoonraker:
    answer = job if isinstance(job, Exception) else {"job": job}
    return FakeMoonraker({"/server/history/job": answer})


def influx_row(filename: str, offset_minutes: int, cost_total: float) -> dict:
    moment = datetime.fromtimestamp(END_TIME + offset_minutes * 60, tz=UTC)
    return {
        "filename": filename,
        "time": moment.isoformat().replace("+00:00", "Z"),
        "avg_watts": 80.0,
        "avg_eur_per_kwh": 0.3,
        "cost_electricity": 0.5,
        "cost_filament": 0.7,
        "cost_total": cost_total,
    }


async def test_the_detail_of_a_print_joins_the_printer_the_costs_the_spool_and_the_project(
    client: AsyncClient, monkeypatch
):
    spool = await db.create_spool(SPOOL)
    await db.link_print_spool("a", spool["id"], 3.0)
    project = await db.create_project("Bracket")
    await db.add_project_print(project["id"], None, "a", None, None, None)
    influx = FakeInflux([influx_row("other.gcode", 0, 8.0), influx_row("part.gcode", -5, 1.2)])
    install_fakes(monkeypatch, moonraker=moonraker_with_job(), influx=influx)
    body = (await client.get("/api/prints/a")).json()
    assert body["job_id"] == "a"
    assert (body["filename"], body["status"], body["duration_s"], body["filament_g"]) == (
        "part.gcode",
        "completed",
        3600.0,
        FILAMENT_G,
    )
    assert body["time"] == datetime.fromtimestamp(END_TIME, tz=UTC).isoformat().replace("+00:00", "Z")
    assert (body["avg_watts"], body["avg_eur_per_kwh"], body["cost_total"]) == (80.0, 0.3, 1.2)
    assert (body["cost_electricity"], body["cost_filament"]) == (0.5, 0.7)
    assert body["spool"] == {
        "id": spool["id"],
        "brand": "Prusament",
        "material": "PLA",
        "color": "Orange",
        "color_hex": "#ff8800",
    }
    assert body["project"] == {"id": project["id"], "name": "Bracket"}
    assert (body["photos"], body["notes"], body["settings"]) == ([], None, None)
    assert influx.limits == [20]


async def test_a_cost_more_than_five_minutes_from_the_end_is_not_used(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=moonraker_with_job(), influx=FakeInflux([influx_row("part.gcode", 6, 1.2)]))
    body = (await client.get("/api/prints/a")).json()
    assert (body["cost_total"], body["avg_watts"]) == (None, None)


async def test_the_detail_of_a_print_the_printer_does_not_know_is_empty(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=moonraker_with_job(RuntimeError("down")), influx=FakeInflux())
    body = (await client.get("/api/prints/a")).json()
    assert (body["filename"], body["status"], body["time"], body["duration_s"]) == ("", "", None, 0)
    assert (body["filament_g"], body["spool"], body["project"], body["cost_total"]) == (0.0, None, None, None)


async def test_the_detail_reads_the_gcode_metadata_once_and_keeps_it(client: AsyncClient, monkeypatch):
    asked: list[str] = []

    async def read_gcode_meta(filename: str) -> dict:
        asked.append(filename)
        return {"operator": "steven"}

    install_fakes(monkeypatch, moonraker=moonraker_with_job(), influx=FakeInflux())
    override_provider(monkeypatch, provide_gcode_meta_reader, read_gcode_meta)
    body = (await client.get("/api/prints/a")).json()
    assert body["gcode_meta"] == {"operator": "steven"}
    assert (await db.get_or_create_print_job("a"))["gcode_meta"] == {"operator": "steven"}
    assert asked == ["part.gcode"]


async def test_the_detail_does_not_fail_when_the_gcode_metadata_cannot_be_read(client: AsyncClient, monkeypatch):
    async def read_gcode_meta(filename: str) -> dict:
        raise RuntimeError("no header")

    install_fakes(monkeypatch, moonraker=moonraker_with_job(), influx=FakeInflux())
    override_provider(monkeypatch, provide_gcode_meta_reader, read_gcode_meta)
    response = await client.get("/api/prints/a")
    assert response.status_code == 200
    assert response.json()["gcode_meta"] is None


async def test_updating_a_print_that_has_no_row_yet_stores_nothing(client: AsyncClient):
    """The row is created by the detail or by the recorder; an update before that is lost (kept as it is)."""
    body = (await client.patch("/api/prints/a", json={"notes": "good"})).json()
    assert body["notes"] is None


async def test_updating_a_print_stores_the_notes_and_the_settings(client: AsyncClient):
    await db.get_or_create_print_job("a")
    response = await client.patch("/api/prints/a", json={"notes": "good", "settings": {"nozzle": "0.4", "x": None}})
    body = response.json()
    assert (response.status_code, body["notes"], body["settings"]) == (200, "good", {"nozzle": "0.4", "x": None})


async def test_updating_a_print_without_fields_changes_nothing(client: AsyncClient):
    await db.get_or_create_print_job("a")
    await client.patch("/api/prints/a", json={"notes": "keep"})
    body = (await client.patch("/api/prints/a", json={})).json()
    assert body["notes"] == "keep"


async def test_a_photo_can_be_uploaded_listed_served_and_deleted(client: AsyncClient, tmp_path):
    upload = await client.post("/api/prints/a/photos", files={"file": ("../shot.jpg", b"jpeg-bytes", "image/jpeg")})
    photo = upload.json()
    assert photo["filename"].endswith("_shot.jpg")
    stored = tmp_path / "photos" / "a" / photo["filename"]
    assert stored.read_bytes() == b"jpeg-bytes"
    assert [item["id"] for item in (await client.get("/api/prints/a/photos")).json()] == [photo["id"]]
    served = await client.get(f"/api/photos/a/{photo['filename']}")
    assert (served.status_code, served.content) == (200, b"jpeg-bytes")
    deleted = await client.delete(f"/api/prints/a/photos/{photo['id']}")
    assert deleted.json() == {"deleted": photo["id"]}
    assert not Path(stored).exists()
    assert (await client.get("/api/prints/a/photos")).json() == []


async def test_deleting_an_unknown_photo_is_a_404(client: AsyncClient):
    response = await client.delete("/api/prints/a/photos/99")
    assert (response.status_code, response.json()["detail"]) == (404, "Photo not found")


async def test_a_photo_that_is_not_on_the_disk_is_a_404(client: AsyncClient):
    assert (await client.get("/api/photos/a/none.jpg")).status_code == 404


async def test_a_photo_record_is_removed_even_when_its_file_is_gone(client: AsyncClient, tmp_path):
    photo = (await client.post("/api/prints/a/photos", files={"file": ("s.jpg", b"x", "image/jpeg")})).json()
    (tmp_path / "photos" / "a" / photo["filename"]).unlink()
    assert (await client.delete(f"/api/prints/a/photos/{photo['id']}")).status_code == 200
