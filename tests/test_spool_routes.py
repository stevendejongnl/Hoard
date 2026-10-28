import asyncio

from httpx import AsyncClient

from app import db
from app.routes.spools import provide_spool_price_recalculator
from tests.route_fakes import FakeInflux, FakeMoonraker, install_fakes, override_provider

SPOOL = {
    "brand": "Prusament",
    "material": "PLA",
    "color": "Orange",
    "color_hex": "#ff8800",
    "cost_per_gram": 0.03,
    "initial_weight_g": 1000,
    "current_weight_g": 900,
    "tag_id": "tag-1",
}


async def test_a_spool_is_created_listed_and_found_by_its_tag(client: AsyncClient):
    created = await client.post("/api/spools", json=SPOOL)
    assert created.status_code == 201
    spool = created.json()
    assert (spool["brand"], spool["tag_id"], spool["active"]) == ("Prusament", "tag-1", 0)
    assert [item["id"] for item in (await client.get("/api/spools")).json()] == [spool["id"]]
    assert (await client.get("/api/spools/by-tag/tag-1")).json()["id"] == spool["id"]


async def test_a_tag_nobody_has_is_a_404(client: AsyncClient):
    response = await client.get("/api/spools/by-tag/nothing")
    assert (response.status_code, response.json()["detail"]) == (404, "No spool has this tag")


async def test_two_spools_cannot_share_a_tag(client: AsyncClient):
    await client.post("/api/spools", json=SPOOL)
    response = await client.post("/api/spools", json=SPOOL)
    assert (response.status_code, response.json()["detail"]) == (409, "Another spool already has this tag")


async def test_updating_a_spool_changes_the_given_fields(client: AsyncClient):
    spool = (await client.post("/api/spools", json=SPOOL)).json()
    response = await client.patch(f"/api/spools/{spool['id']}", json={"notes": "dry", "current_weight_g": 800})
    body = response.json()
    assert (response.status_code, body["notes"], body["current_weight_g"], body["brand"]) == (
        200,
        "dry",
        800,
        "Prusament",
    )


async def test_an_update_without_fields_is_a_422(client: AsyncClient):
    spool = (await client.post("/api/spools", json=SPOOL)).json()
    response = await client.patch(f"/api/spools/{spool['id']}", json={})
    assert (response.status_code, response.json()["detail"]) == (422, "No fields to update")


async def test_an_empty_tag_clears_the_tag(client: AsyncClient):
    spool = (await client.post("/api/spools", json=SPOOL)).json()
    body = (await client.patch(f"/api/spools/{spool['id']}", json={"tag_id": ""})).json()
    assert body["tag_id"] is None


async def test_updating_an_unknown_spool_is_a_404(client: AsyncClient):
    response = await client.patch("/api/spools/99", json={"notes": "x"})
    assert (response.status_code, response.json()["detail"]) == (404, "Spool not found")


async def test_a_tag_of_another_spool_is_a_409_on_update(client: AsyncClient):
    await client.post("/api/spools", json=SPOOL)
    other = (await client.post("/api/spools", json={**SPOOL, "tag_id": "tag-2"})).json()
    response = await client.patch(f"/api/spools/{other['id']}", json={"tag_id": "tag-1"})
    assert response.status_code == 409


async def test_changing_the_price_recalculates_the_prints_of_the_spool(client: AsyncClient, monkeypatch):
    install_fakes(monkeypatch, moonraker=FakeMoonraker(), influx=FakeInflux())
    spool = (await client.post("/api/spools", json=SPOOL)).json()
    response = await client.patch(f"/api/spools/{spool['id']}", json={"cost_per_gram": 0.05})
    assert response.json()["cost_per_gram"] == 0.05


async def test_a_spool_without_prints_can_be_deleted(client: AsyncClient):
    spool = (await client.post("/api/spools", json=SPOOL)).json()
    assert (await client.delete(f"/api/spools/{spool['id']}")).status_code == 204
    assert (await client.get("/api/spools")).json() == []


async def test_a_spool_with_linked_prints_cannot_be_deleted(client: AsyncClient):
    spool = (await client.post("/api/spools", json=SPOOL)).json()
    await db.link_print_spool("job-1", spool["id"], 5.0)
    response = await client.delete(f"/api/spools/{spool['id']}")
    assert (response.status_code, response.json()["detail"]) == (409, "Spool has linked prints — unlink first")


async def test_the_push_subscription_can_be_added_and_removed(client: AsyncClient):
    subscription = {"endpoint": "https://push.example/1", "keys": {"p256dh": "key", "auth": "secret"}}
    assert (await client.post("/api/push/subscribe", json=subscription)).json() == {"status": "ok"}
    assert [row["endpoint"] for row in await db.get_push_subscriptions()] == ["https://push.example/1"]
    assert (await client.post("/api/push/unsubscribe", json={"endpoint": "https://push.example/1"})).json() == {
        "status": "ok"
    }
    assert await db.get_push_subscriptions() == []


async def test_the_vapid_public_key_is_served(client: AsyncClient):
    response = await client.get("/api/push/vapid-public-key")
    assert response.status_code == 200
    assert isinstance(response.json()["key"], str)


async def test_changing_the_price_asks_the_recalculator_for_that_spool(client: AsyncClient, monkeypatch):
    asked: list[int] = []

    async def recalculate(spool_id: int) -> None:
        asked.append(spool_id)

    override_provider(monkeypatch, provide_spool_price_recalculator, recalculate)
    spool = (await client.post("/api/spools", json=SPOOL)).json()
    await client.patch(f"/api/spools/{spool['id']}", json={"cost_per_gram": 0.06})
    await client.patch(f"/api/spools/{spool['id']}", json={"notes": "no price change"})
    await asyncio.sleep(0)
    assert asked == [spool["id"]]
