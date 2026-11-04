import pytest
from httpx import AsyncClient

from app.control_layout import CARD_KEYS

LAYOUT = {"order": ["move", "camera"], "spans": {"camera": 2}, "hidden": ["console"]}


async def test_nothing_is_stored_until_the_layout_is_changed(client: AsyncClient):
    for device in ("desktop", "phone"):
        response = await client.get(f"/api/control/layout/{device}")
        assert (response.status_code, response.json()) == (200, None)


async def test_a_saved_layout_comes_back(client: AsyncClient):
    saved = await client.put("/api/control/layout/desktop", json=LAYOUT)
    assert (saved.status_code, saved.json()) == (200, LAYOUT)
    assert (await client.get("/api/control/layout/desktop")).json() == LAYOUT


async def test_the_desktop_and_the_phone_keep_their_own_layout(client: AsyncClient):
    phone = {"order": ["camera"], "spans": {}, "hidden": []}
    await client.put("/api/control/layout/desktop", json=LAYOUT)
    await client.put("/api/control/layout/phone", json=phone)
    assert (await client.get("/api/control/layout/desktop")).json() == LAYOUT
    assert (await client.get("/api/control/layout/phone")).json() == phone


async def test_saving_again_replaces_the_layout(client: AsyncClient):
    await client.put("/api/control/layout/desktop", json=LAYOUT)
    newer = {"order": ["console"], "spans": {"console": 3}, "hidden": []}
    await client.put("/api/control/layout/desktop", json=newer)
    assert (await client.get("/api/control/layout/desktop")).json() == newer


async def test_resetting_forgets_the_layout(client: AsyncClient):
    await client.put("/api/control/layout/desktop", json=LAYOUT)
    assert (await client.delete("/api/control/layout/desktop")).status_code == 200
    assert (await client.get("/api/control/layout/desktop")).json() is None


async def test_an_unknown_device_is_a_404(client: AsyncClient):
    assert (await client.get("/api/control/layout/tablet")).status_code == 404
    assert (await client.put("/api/control/layout/tablet", json=LAYOUT)).status_code == 404
    assert (await client.delete("/api/control/layout/tablet")).status_code == 404


@pytest.mark.parametrize(
    "layout",
    [
        {"order": ["nope"], "spans": {}, "hidden": []},
        {"order": ["move", "move"], "spans": {}, "hidden": []},
        {"order": [], "spans": {"move": 4}, "hidden": []},
        {"order": [], "spans": {"move": 0}, "hidden": []},
        {"order": [], "spans": {"nope": 2}, "hidden": []},
        {"order": [], "spans": {}, "hidden": ["nope"]},
        {"order": [], "spans": {}, "hidden": ["move", "move"]},
        {"order": ["move"], "spans": {}, "hidden": ["move"]},
    ],
)
async def test_a_layout_that_makes_no_sense_is_refused(client: AsyncClient, layout):
    assert (await client.put("/api/control/layout/desktop", json=layout)).status_code == 422
    assert (await client.get("/api/control/layout/desktop")).json() is None


def test_the_page_has_nine_cards():
    assert CARD_KEYS == (
        "camera",
        "move",
        "temperatures",
        "extruder",
        "tuning",
        "bed_mesh",
        "calibration",
        "macros",
        "console",
    )
