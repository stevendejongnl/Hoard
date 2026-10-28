import os

from httpx import AsyncClient

from app import db
from tests.route_fakes import FakeInflux, FakeMoonraker, install_fakes

JOB = {
    "print_duration": 3600.0,
    "filament_used": 5000.0,
    "filename": "part.gcode",
    "end_time": 1_760_000_000.0,
}
FILAMENT_G = round(5000.0 * 3.141592653589793 * 0.875**2 * 1.24 * 0.001, 2)


async def create_project(client: AsyncClient) -> int:
    return (await client.post("/api/projects", json={"name": "Bracket"})).json()["id"]


def moonraker_with_job(job: dict | None = JOB) -> FakeMoonraker:
    return FakeMoonraker({"/server/history/job": {"job": job}})


async def test_linking_a_print_to_an_unknown_project_is_a_404(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=moonraker_with_job(), influx=FakeInflux())
    response = await client.post("/api/projects/99/prints", json={"job_id": "a"})
    assert (response.status_code, response.json()["detail"]) == (404, "Project not found")


async def test_a_linked_print_takes_its_cost_from_the_influx_point_of_its_end_time(client: AsyncClient, monkeypatch):
    influx = FakeInflux([{"filename": "part.gcode", "cost_total": 9.0}])
    influx.by_end_time[("part.gcode", 1_760_000_000.0)] = {"cost_total": 2.5}
    install_fakes(monkeypatch, moonraker=moonraker_with_job(), influx=influx)
    project_id = await create_project(client)
    body = (await client.post(f"/api/projects/{project_id}/prints", json={"job_id": "a"})).json()
    assert (body["duration_s"], body["filament_g"], body["cost_total"]) == (3600.0, FILAMENT_G, 2.5)
    assert (body["project_id"], body["job_id"], body["project_file_id"]) == (project_id, "a", None)


async def test_a_linked_print_falls_back_to_the_cost_of_the_file_name(client: AsyncClient, monkeypatch):
    influx = FakeInflux([{"filename": "other.gcode", "cost_total": 1.0}, {"filename": "part.gcode", "cost_total": 4.0}])
    install_fakes(monkeypatch, moonraker=moonraker_with_job(), influx=influx)
    project_id = await create_project(client)
    body = (await client.post(f"/api/projects/{project_id}/prints", json={"job_id": "a"})).json()
    assert body["cost_total"] == 4.0
    assert influx.limits == [500]


async def test_a_linked_print_keeps_what_was_read_before_influx_failed(client: AsyncClient, monkeypatch):
    class BrokenInflux(FakeInflux):
        async def query_by_end_time(self, filename, end_time_s):
            raise RuntimeError("influx down")

    install_fakes(monkeypatch, moonraker=moonraker_with_job(), influx=BrokenInflux())
    project_id = await create_project(client)
    body = (await client.post(f"/api/projects/{project_id}/prints", json={"job_id": "a"})).json()
    assert (body["duration_s"], body["filament_g"], body["cost_total"]) == (3600.0, FILAMENT_G, None)


async def test_a_linked_print_remembers_its_project_file(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=moonraker_with_job(), influx=FakeInflux())
    project_id = await create_project(client)
    file = (
        await client.post(f"/api/projects/{project_id}/files", json={"type": "gcode", "filename": "part.gcode"})
    ).json()
    body = (
        await client.post(f"/api/projects/{project_id}/prints", json={"job_id": "a", "project_file_id": file["id"]})
    ).json()
    assert body["project_file_id"] == file["id"]


async def test_refreshing_a_print_reads_the_stats_again_and_stores_them(client: AsyncClient, monkeypatch):
    install_fakes(
        monkeypatch, moonraker=FakeMoonraker({"/server/history/job": RuntimeError("down")}), influx=FakeInflux()
    )
    project_id = await create_project(client)
    await client.post(f"/api/projects/{project_id}/prints", json={"job_id": "a"})
    influx = FakeInflux()
    influx.by_end_time[("part.gcode", 1_760_000_000.0)] = {"cost_total": 2.5}
    install_fakes(monkeypatch, moonraker=moonraker_with_job(), influx=influx)
    response = await client.patch(f"/api/projects/{project_id}/prints/a/refresh")
    assert response.status_code == 200
    assert response.json() == {"job_id": "a", "duration_s": 3600.0, "filament_g": FILAMENT_G, "cost_total": 2.5}
    detail = (await client.get(f"/api/projects/{project_id}")).json()
    assert (detail["total_duration_s"], detail["total_cost"], detail["total_filament_g"]) == (3600.0, 2.5, FILAMENT_G)


async def test_refreshing_a_print_only_touches_the_given_project(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=moonraker_with_job(), influx=FakeInflux())
    first = await create_project(client)
    second = await create_project(client)
    for project_id in (first, second):
        await client.post(f"/api/projects/{project_id}/prints", json={"job_id": "a"})
    install_fakes(monkeypatch, moonraker=moonraker_with_job({**JOB, "print_duration": 10.0}), influx=FakeInflux())
    await client.patch(f"/api/projects/{first}/prints/a/refresh")
    assert (await client.get(f"/api/projects/{first}")).json()["total_duration_s"] == 10.0
    assert (await client.get(f"/api/projects/{second}")).json()["total_duration_s"] == 3600.0


async def test_refreshing_without_a_printer_stores_empty_stats(client: AsyncClient, monkeypatch):
    install_fakes(
        monkeypatch, moonraker=FakeMoonraker({"/server/history/job": RuntimeError("down")}), influx=FakeInflux()
    )
    project_id = await create_project(client)
    body = (await client.patch(f"/api/projects/{project_id}/prints/a/refresh")).json()
    assert body == {"job_id": "a", "duration_s": None, "filament_g": None, "cost_total": None}


async def test_a_missing_project_is_a_404_for_get_update_and_delete(client: AsyncClient):
    assert (await client.get("/api/projects/99")).status_code == 404
    assert (await client.patch("/api/projects/99", json={"name": "x"})).status_code == 404
    assert (await client.delete("/api/projects/99")).status_code == 404


async def test_updating_a_project_changes_only_the_given_fields(client: AsyncClient):
    project_id = await create_project(client)
    await client.patch(f"/api/projects/{project_id}", json={"notes": "hello"})
    body = (await client.patch(f"/api/projects/{project_id}", json={"name": "Renamed"})).json()
    assert (body["name"], body["notes"]) == ("Renamed", "hello")


async def test_uploading_a_file_stores_it_with_its_extension_as_type(client: AsyncClient):
    project_id = await create_project(client)
    response = await client.post(
        f"/api/projects/{project_id}/files/upload",
        files={"file": ("Model.STL", b"solid", "application/octet-stream")},
        params={"label": "main"},
    )
    body = response.json()
    assert (response.status_code, body["type"], body["label"]) == (201, "stl", "main")
    assert body["filename"].endswith("_Model.STL")
    assert open(body["filename"], "rb").read() == b"solid"


async def test_an_uploaded_file_is_labelled_with_its_name_without_a_label(client: AsyncClient):
    project_id = await create_project(client)
    response = await client.post(
        f"/api/projects/{project_id}/files/upload", files={"file": ("a.3mf", b"x", "application/octet-stream")}
    )
    assert (response.json()["type"], response.json()["label"]) == ("3mf", "a.3mf")


async def test_uploading_to_an_unknown_project_is_a_404(client: AsyncClient):
    response = await client.post("/api/projects/99/files/upload", files={"file": ("a.stl", b"x")})
    assert response.status_code == 404


async def test_adding_a_file_to_an_unknown_project_is_a_404(client: AsyncClient):
    response = await client.post("/api/projects/99/files", json={"type": "gcode", "filename": "a.gcode"})
    assert response.status_code == 404


async def test_deleting_a_file_removes_it_from_the_disk_unless_it_is_gcode(client: AsyncClient):
    project_id = await create_project(client)
    upload = await client.post(
        f"/api/projects/{project_id}/files/upload", files={"file": ("a.stl", b"x", "application/octet-stream")}
    )
    stored = upload.json()
    assert (await client.delete(f"/api/projects/{project_id}/files/{stored['id']}")).status_code == 204
    assert not os.path.exists(stored["filename"])


async def test_deleting_a_file_of_another_project_is_a_404(client: AsyncClient):
    project_id = await create_project(client)
    other = await create_project(client)
    file = (await client.post(f"/api/projects/{project_id}/files", json={"type": "gcode", "filename": "a"})).json()
    assert (await client.delete(f"/api/projects/{other}/files/{file['id']}")).status_code == 404
    assert (await client.delete(f"/api/projects/{project_id}/files/{file['id']}")).status_code == 204


async def test_deleting_a_project_removes_its_stored_files(client: AsyncClient):
    project_id = await create_project(client)
    upload = await client.post(
        f"/api/projects/{project_id}/files/upload", files={"file": ("a.stl", b"x", "application/octet-stream")}
    )
    assert (await client.delete(f"/api/projects/{project_id}")).status_code == 204
    assert not os.path.exists(upload.json()["filename"])
    assert (await client.get(f"/api/projects/{project_id}")).status_code == 404


async def test_downloading_a_stored_file(client: AsyncClient):
    project_id = await create_project(client)
    upload = await client.post(
        f"/api/projects/{project_id}/files/upload", files={"file": ("a.stl", b"solid", "application/octet-stream")}
    )
    response = await client.get(f"/api/projects/{project_id}/files/{upload.json()['id']}/download")
    assert (response.status_code, response.content) == (200, b"solid")
    assert "_a.stl" in response.headers["content-disposition"]


async def test_downloading_a_gcode_file_or_one_missing_from_the_disk_is_a_404(client: AsyncClient):
    project_id = await create_project(client)
    gcode = (await client.post(f"/api/projects/{project_id}/files", json={"type": "gcode", "filename": "a"})).json()
    ghost = (await client.post(f"/api/projects/{project_id}/files", json={"type": "stl", "filename": "/nope"})).json()
    first = await client.get(f"/api/projects/{project_id}/files/{gcode['id']}/download")
    second = await client.get(f"/api/projects/{project_id}/files/{ghost['id']}/download")
    assert (first.status_code, first.json()["detail"]) == (404, "File not found")
    assert (second.status_code, second.json()["detail"]) == (404, "File missing from disk")


async def test_deleting_the_cover_link_clears_the_cover(client: AsyncClient):
    project_id = await create_project(client)
    link = (await client.post(f"/api/projects/{project_id}/links", json={"url": "http://127.0.0.1:1/x"})).json()
    await db.set_project_cover(project_id, "http://image", link["id"])
    await client.delete(f"/api/projects/{project_id}/links/{link['id']}")
    project = await db.get_project(project_id)
    assert (project["cover_url"], project["cover_link_id"]) == (None, None)
