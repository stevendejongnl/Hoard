import pytest
from unittest.mock import AsyncMock
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_projects_empty(client: AsyncClient):
    r = await client.get("/api/projects")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_create_and_get_project(client: AsyncClient):
    r = await client.post("/api/projects", json={"name": "Voron 2.4"})
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Voron 2.4"
    assert data["print_count"] == 0
    assert data["files"] == []

    r2 = await client.get(f"/api/projects/{data['id']}")
    assert r2.status_code == 200
    assert r2.json()["name"] == "Voron 2.4"


@pytest.mark.asyncio
async def test_update_project_notes(client: AsyncClient):
    r = await client.post("/api/projects", json={"name": "Test"})
    pid = r.json()["id"]
    r2 = await client.patch(f"/api/projects/{pid}", json={"notes": "# Hello"})
    assert r2.status_code == 200
    assert r2.json()["notes"] == "# Hello"


@pytest.mark.asyncio
async def test_delete_project(client: AsyncClient):
    r = await client.post("/api/projects", json={"name": "Test"})
    pid = r.json()["id"]
    assert (await client.delete(f"/api/projects/{pid}")).status_code == 204
    assert (await client.get(f"/api/projects/{pid}")).status_code == 404


@pytest.mark.asyncio
async def test_add_and_delete_gcode_file(client: AsyncClient):
    r = await client.post("/api/projects", json={"name": "Test"})
    pid = r.json()["id"]
    r2 = await client.post(f"/api/projects/{pid}/files",
                            json={"type": "gcode", "filename": "part.gcode"})
    assert r2.status_code == 201
    fid = r2.json()["id"]
    assert (await client.delete(f"/api/projects/{pid}/files/{fid}")).status_code == 204
    project = (await client.get(f"/api/projects/{pid}")).json()
    assert project["files"] == []


@pytest.mark.asyncio
async def test_add_and_delete_link(client: AsyncClient):
    r = await client.post("/api/projects", json={"name": "Test"})
    pid = r.json()["id"]
    r2 = await client.post(f"/api/projects/{pid}/links",
                            json={"url": "https://printables.com/model/1", "label": "printables"})
    assert r2.status_code == 201
    lid = r2.json()["id"]
    assert (await client.delete(f"/api/projects/{pid}/links/{lid}")).status_code == 204


@pytest.mark.asyncio
async def test_link_print_moonraker_unavailable(client: AsyncClient, monkeypatch):
    monkeypatch.setattr("app.routes.projects.moonraker.get",
                        AsyncMock(side_effect=Exception("no moonraker")))
    monkeypatch.setattr("app.routes.projects.influx.query_history",
                        lambda limit=500: [])
    r = await client.post("/api/projects", json={"name": "Test"})
    pid = r.json()["id"]
    r2 = await client.post(f"/api/projects/{pid}/prints", json={"job_id": "abc123"})
    assert r2.status_code == 201
    assert r2.json()["job_id"] == "abc123"
    assert r2.json()["duration_s"] is None


@pytest.mark.asyncio
async def test_link_print_with_stats(client: AsyncClient, monkeypatch):
    monkeypatch.setattr("app.routes.projects.moonraker.get", AsyncMock(return_value={
        "job": {"print_duration": 3600.0, "filament_used": 5000.0, "filename": "part.gcode"}
    }))
    monkeypatch.setattr("app.routes.projects.influx.query_history",
                        lambda limit=500: [{"filename": "part.gcode", "cost_total": 1.5}])
    r = await client.post("/api/projects", json={"name": "Test"})
    pid = r.json()["id"]
    await client.post(f"/api/projects/{pid}/prints", json={"job_id": "job1"})
    await client.post(f"/api/projects/{pid}/prints", json={"job_id": "job2"})
    detail = (await client.get(f"/api/projects/{pid}")).json()
    assert detail["print_count"] == 2
    assert detail["total_cost"] == pytest.approx(3.0)
    assert detail["total_duration_s"] == pytest.approx(7200.0)


@pytest.mark.asyncio
async def test_unlink_print(client: AsyncClient, monkeypatch):
    monkeypatch.setattr("app.routes.projects.moonraker.get",
                        AsyncMock(side_effect=Exception("no moonraker")))
    monkeypatch.setattr("app.routes.projects.influx.query_history", lambda limit=500: [])
    r = await client.post("/api/projects", json={"name": "Test"})
    pid = r.json()["id"]
    await client.post(f"/api/projects/{pid}/prints", json={"job_id": "abc"})
    assert (await client.delete(f"/api/projects/{pid}/prints/abc")).status_code == 204
    assert (await client.get(f"/api/projects/{pid}")).json()["print_count"] == 0


@pytest.mark.asyncio
async def test_duplicate_print_link_is_noop(client: AsyncClient, monkeypatch):
    monkeypatch.setattr("app.routes.projects.moonraker.get",
                        AsyncMock(side_effect=Exception("no moonraker")))
    monkeypatch.setattr("app.routes.projects.influx.query_history", lambda limit=500: [])
    r = await client.post("/api/projects", json={"name": "Test"})
    pid = r.json()["id"]
    await client.post(f"/api/projects/{pid}/prints", json={"job_id": "abc"})
    r2 = await client.post(f"/api/projects/{pid}/prints", json={"job_id": "abc"})
    assert r2.status_code == 201
    assert (await client.get(f"/api/projects/{pid}")).json()["print_count"] == 1
