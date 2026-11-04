from httpx import AsyncClient

from app.control_access import ControlAccess
from app.main import app
from app.routes.dependencies import provide_control_access


async def install(monkeypatch) -> ControlAccess:
    access = ControlAccess()
    monkeypatch.setitem(app.dependency_overrides, provide_control_access, lambda: access)
    return access


async def test_the_dashboard_sees_what_is_waiting_and_what_is_allowed(client: AsyncClient, monkeypatch):
    access = await install(monkeypatch)
    waiting = await access.request("claude", "level the bed")
    granted = await access.request("other", "")
    await access.allow(granted["id"])
    body = (await client.get("/api/control/access")).json()
    assert [(item["id"], item["client"]) for item in body["pending"]] == [(waiting["id"], "claude")]
    assert [item["client"] for item in body["granted"]] == ["other"]


async def test_the_person_allows_a_request(client: AsyncClient, monkeypatch):
    access = await install(monkeypatch)
    request = await access.request("claude", "")
    response = await client.post(f"/api/control/access/{request['id']}/allow")
    assert (response.status_code, response.json()) == (200, {"ok": True})
    assert access.is_granted("claude") is True


async def test_the_person_denies_a_request(client: AsyncClient, monkeypatch):
    access = await install(monkeypatch)
    request = await access.request("claude", "")
    assert (await client.post(f"/api/control/access/{request['id']}/deny")).status_code == 200
    assert access.is_granted("claude") is False
    assert access.snapshot()["pending"] == []


async def test_a_request_that_is_gone_is_a_404(client: AsyncClient, monkeypatch):
    await install(monkeypatch)
    assert (await client.post("/api/control/access/nope/allow")).status_code == 404
    assert (await client.post("/api/control/access/nope/deny")).status_code == 404


async def test_the_person_takes_the_access_back(client: AsyncClient, monkeypatch):
    access = await install(monkeypatch)
    request = await access.request("claude", "")
    await access.allow(request["id"])
    assert (await client.delete("/api/control/access/grants/claude")).status_code == 200
    assert access.is_granted("claude") is False
    assert (await client.delete("/api/control/access/grants/claude")).status_code == 404
