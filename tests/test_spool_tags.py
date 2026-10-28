import pytest
from httpx import AsyncClient

SPOOL = {
    "brand": "eSUN",
    "material": "PLA",
    "color": "Black",
    "cost_per_gram": 0.012,
    "initial_weight_g": 1000,
    "current_weight_g": 612,
}
TAG = "04:a2:2b:1c:5d:80:00"


async def create_spool(client: AsyncClient, **extra) -> dict:
    response = await client.post("/api/spools", json={**SPOOL, **extra})
    assert response.status_code == 201
    return response.json()


@pytest.mark.asyncio
async def test_a_new_spool_has_no_tag(client: AsyncClient):
    assert (await create_spool(client))["tag_id"] is None


@pytest.mark.asyncio
async def test_a_spool_can_be_created_with_a_tag(client: AsyncClient):
    assert (await create_spool(client, tag_id=TAG))["tag_id"] == TAG


@pytest.mark.asyncio
async def test_a_tag_can_be_linked_to_a_spool(client: AsyncClient):
    spool = await create_spool(client)
    response = await client.patch(f"/api/spools/{spool['id']}", json={"tag_id": TAG})
    assert response.status_code == 200
    assert response.json()["tag_id"] == TAG


@pytest.mark.asyncio
async def test_a_spool_is_found_by_its_tag(client: AsyncClient):
    spool = await create_spool(client, tag_id=TAG)
    response = await client.get(f"/api/spools/by-tag/{TAG}")
    assert response.status_code == 200
    assert response.json()["id"] == spool["id"]


@pytest.mark.asyncio
async def test_an_unknown_tag_is_not_found(client: AsyncClient):
    response = await client.get("/api/spools/by-tag/unknown")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_a_tag_belongs_to_one_spool_at_a_time(client: AsyncClient):
    await create_spool(client, tag_id=TAG)
    other = await create_spool(client)
    response = await client.patch(f"/api/spools/{other['id']}", json={"tag_id": TAG})
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_an_empty_tag_unlinks_it(client: AsyncClient):
    spool = await create_spool(client, tag_id=TAG)
    response = await client.patch(f"/api/spools/{spool['id']}", json={"tag_id": ""})
    assert response.status_code == 200
    assert response.json()["tag_id"] is None
    assert (await client.get(f"/api/spools/by-tag/{TAG}")).status_code == 404
